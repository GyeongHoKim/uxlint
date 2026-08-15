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

/**
 * Oldest Chrome major version this project accepts.
 *
 * The pinned server states its requirement as "Chrome current stable version
 * or newer" -- a moving target with no number in it. 144 is the oldest
 * numbered Chrome its own documentation acknowledges (for `--autoConnect`,
 * which this project does not use), so it is the least invented floor
 * available rather than a quoted requirement. See
 * `specs/005-devtools-mcp-swap/baseline.md` (T005) for the reasoning and its
 * known consequence.
 */
export const minimumChromeMajorVersion = 144;

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
 * The three kinds are kept apart because their remedies are different:
 * install a browser, upgrade one, or fix the environment that stops the one
 * you have from starting. Collapsing them would produce a message that is
 * true and useless.
 */
export type UnmetRequirement =
	| {
			kind: 'browser-absent';
			searchedPaths: string[];
			configuredPath?: string;
	  }
	| {
			kind: 'browser-too-old';
			detectedVersion: string;
			detectedMajorVersion: number;
			requiredMajorVersion: number;
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

		case 'browser-too-old': {
			return [
				`The browser found is too old: detected ${requirement.detectedVersion}`,
				`(major version ${requirement.detectedMajorVersion}),`,
				`but version ${requirement.requiredMajorVersion} or newer is required.`,
				'Upgrade Chrome, or point uxlint at a newer installation.',
			].join(' ');
		}

		case 'browser-unstartable': {
			return [
				'A browser was found but would not start.',
				`The browser reported: ${requirement.cause}`,
				'This is an environment problem rather than a missing install -- the executable exists but cannot run here.',
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
