/**
 * Browser preflight verdicts
 *
 * Analysis needs a browser the environment may not have. The server this
 * project drives connects and serves its full tool list even when no browser
 * is installed, and reports the absence as a tool *result* rather than an
 * error, so the agent loop treats it as something to work around and spends
 * an entire page's worth of model calls on a page that never loaded. Nothing
 * in that outcome mentions a browser. Preflight exists to answer the question
 * before the transport opens, while the answer is still cheap and legible.
 *
 * @packageDocumentation
 */

/*
 * There is deliberately no minimum version constant here.
 *
 * An earlier draft blocked on Chrome 144, reasoning that it was the oldest
 * numbered version the pinned server's documentation mentions. It mentions it
 * for `--autoConnect`, a feature this project does not use; the server's
 * actual requirement is "current stable or newer", which is a moving target
 * with no number in it. Blocking on 144 therefore rejected browsers that work.
 *
 * Whether a browser is too old is settled the same way the sandbox question
 * is: by launching it and seeing. A browser too old to drive fails the launch
 * probe and is reported as unstartable, carrying the browser's own
 * explanation -- which beats a number this project invented.
 */

/**
 * What Chrome prints when the sandbox cannot start because the process is
 * root. Observed in a `node:24-slim` container running Chrome 151.
 */
export const rootSandboxSignature =
	'Running as root without --no-sandbox is not supported. See https://crbug.com/638180.';

/**
 * What Chrome prints when the sandbox cannot start because the environment
 * forbids the namespace it needs. Observed in the same container as an
 * ordinary non-root user, which is why the root check alone is not enough.
 */
export const namespaceSandboxSignature =
	'Failed to move to new namespace: PID namespaces supported, Network namespace supported, but failed: errno = Operation not permitted';

/**
 * The browser preflight actually found.
 */
export type BrowserIdentity = {
	/** Absolute path to the executable that answered */
	executablePath: string;

	/** The version banner as the browser reported it */
	version: string;

	/** Major version parsed from that banner */
	majorVersion: number;
};

/**
 * A requirement the environment did not meet.
 *
 * The two kinds are kept apart because their remedies are different: install
 * a browser, or fix the environment that stops the one you have from
 * starting. Collapsing them would produce a message that is true and useless.
 */
export type UnmetRequirement =
	| {
			kind: 'browser-absent';
			searchedPaths: string[];
			configuredPath?: string;
	  }
	| {
			kind: 'browser-unstartable';
			cause: string;
	  };

/**
 * The outcome of checking the environment before analysis begins.
 *
 * `ready-without-sandbox` is a success state rather than a flag on `ready`
 * because the disclosure is not optional: a caller cannot render this verdict
 * without encountering the cause it has to report. A boolean would let the
 * disclosure be dropped silently, which is the one outcome the clarification
 * ruled out -- relaxing the protection is permitted, hiding it is not.
 */
export type PreflightVerdict =
	| {kind: 'ready'; browser: BrowserIdentity}
	| {kind: 'ready-without-sandbox'; browser: BrowserIdentity; cause: string}
	| {kind: 'unmet'; requirement: UnmetRequirement};

/**
 * How a failed launch is understood.
 */
export type LaunchFailureClass =
	| {kind: 'sandbox-unavailable'; cause: string}
	| {kind: 'unstartable'; cause: string};

/**
 * Decide whether a failed launch means the sandbox is unavailable.
 *
 * Only the two signatures observed in a real container count. Anything else
 * is `unstartable`: treating an unknown failure as a sandbox problem would
 * disable a browser security protection in response to a fault that has
 * nothing to do with it, and the fallback would then hide the real cause.
 */
export function classifyLaunchFailure(stderr: string): LaunchFailureClass {
	const sandboxLine = findLine(
		stderr,
		line =>
			line.includes('Running as root without --no-sandbox') ||
			line.includes('Failed to move to new namespace'),
	);

	if (sandboxLine) {
		return {kind: 'sandbox-unavailable', cause: sandboxLine};
	}

	return {kind: 'unstartable', cause: significantLine(stderr)};
}

/**
 * Read the major version out of a browser's `--version` banner.
 *
 * @returns The major version, or undefined when the banner carries no version
 */
export function parseChromeMajorVersion(banner: string): number | undefined {
	const match = /\b(\d+)\.\d+\.\d+(?:\.\d+)?\b/.exec(banner);
	if (!match?.[1]) {
		return undefined;
	}

	return Number(match[1]);
}

/**
 * Render an unmet requirement as something a reader can act on.
 *
 * The pipeline owner sees only this string in their CI log, so it carries the
 * remedy as well as the diagnosis.
 */
export function describeUnmetRequirement(
	requirement: UnmetRequirement,
): string {
	switch (requirement.kind) {
		case 'browser-absent': {
			if (requirement.configuredPath) {
				return [
					`No browser was found at the configured path ${requirement.configuredPath}.`,
					'uxlint did not search anywhere else, because a configured path is taken as deliberate.',
					'Correct the browser executable path setting, or remove it to search the default locations.',
				].join(' ');
			}

			return [
				`No usable Chrome was found. Searched: ${requirement.searchedPaths.join(', ')}.`,
				'Install Google Chrome (https://www.google.com/chrome/), or set the browser executable path if Chrome lives elsewhere.',
				'In a container image, add google-chrome-stable or Chrome for Testing.',
			].join(' ');
		}

		case 'browser-unstartable': {
			return [
				'A browser was found but would not start.',
				`The browser reported: ${requirement.cause}`,
				'The executable exists but cannot run here -- this is an environment problem, or a browser too old to drive, rather than a missing install.',
			].join(' ');
		}
	}
}

/**
 * Render the notice that accompanies a relaxed sandbox.
 *
 * Called the "sandbox relaxation" wherever it is surfaced, so that a user
 * grepping their logs for one wording finds every occurrence.
 */
export function describeSandboxRelaxation(cause: string): string {
	return [
		'Sandbox relaxation: the browser security sandbox could not start in this environment,',
		'so uxlint disabled it to let the run proceed.',
		`The browser reported: ${cause}`,
		'Pages are being rendered without sandbox isolation.',
	].join(' ');
}

/**
 * First line satisfying a predicate.
 */
function findLine(
	stderr: string,
	predicate: (line: string) => boolean,
): string | undefined {
	for (const line of stderr.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length > 0 && predicate(trimmed)) {
			return trimmed;
		}
	}

	return undefined;
}

/**
 * The line of a browser's stderr worth showing a user.
 *
 * Not simply the first: Chrome routinely opens with a WARNING about reading
 * its channel from CHROME_VERSION_EXTRA before it gets to the sentence that
 * explains the failure. Taking line one verbatim disclosed that warning as
 * the cause of a relaxed sandbox, which is noise presented as a reason.
 * Errors are preferred, and the first non-empty line is only the fallback.
 */
function significantLine(stderr: string): string {
	const error = findLine(stderr, line => line.includes('ERROR'));
	if (error) {
		return error;
	}

	const meaningful = findLine(stderr, line => !line.includes('WARNING'));
	return meaningful ?? stderr.trim();
}
