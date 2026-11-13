/**
 * Signed-in session
 *
 * Signs a run in before it reviews anything and decides, page by page,
 * whether the page captured is one a signed-in visitor reached. See
 * `specs/011-authenticated-pages/research.md` (R3-R5).
 *
 * @packageDocumentation
 */

import process from 'node:process';
import {logger} from '../infrastructure/logger.js';
import type {RunProvenance} from '../models/analysis.js';
import type {UxLintConfig} from '../models/config.js';
import {
	createRedactor,
	resolveSecrets,
	type Redactor,
} from '../models/secret-redaction.js';
import {
	clickableRoles,
	describeNotReached,
	describeShown,
	describeSignInFailure,
	describeStep,
	fillableRoles,
	hasSignedInSign,
	missingSecretText,
	reachedUrlOf,
	resolveTarget,
	sameAddress,
	unusableSecretText,
	type NotReachedReason,
	type PageAdmission,
	type SignInDescription,
	type SignInFailure,
	type SignInOutcome,
	type SignInStep,
	type TargetResolution,
} from '../models/sign-in.js';
import {readToolOutcome, type ToolOutcome} from '../models/tool-output.js';
import {DeadlineExpired, withDeadline} from './deadline.js';
import type {ReportBuilder} from './report-builder.js';

/** Bound on one sign-in when the description gives none. */
export const defaultSignInTimeoutMs = 30_000;

/** How long an absent target or sign is re-checked before it counts as absent. */
export const signWaitWindowMs = 5000;

/** Pause between two re-checks inside the window. */
const recheckIntervalMs = 500;

/** The one browser capability the session needs: calling a tool by name. */
export type SignInBrowser = {
	callTool(request: {
		name: string;
		arguments?: Record<string, unknown>;
	}): Promise<unknown>;
};

/** What a session is built from. */
export type SignedInSessionOptions = {
	client: SignInBrowser;
	description: SignInDescription;
	secrets: ReadonlyMap<string, string>;
	redact: Redactor;

	/** Pause between re-checks; injectable so tests need not wait */
	wait?: (ms: number) => Promise<void>;
};

/** What an abandoned sign-in or admission is said to have failed with. */
const abandonedText = 'the page stopped waiting for it';

const realWait = async (ms: number): Promise<void> =>
	new Promise(resolve => {
		setTimeout(resolve, ms);
	});

/**
 * Signs a run in, and decides whether each captured page was reached signed in.
 *
 * Every text that leaves this class has passed through the run's redactor,
 * and no tool argument is ever handed to the logger: the `value` of a `fill`
 * is the one place a secret is used.
 */
export class SignedInSession {
	readonly redact: Redactor;
	private readonly client: SignInBrowser;
	private readonly description: SignInDescription;
	private readonly secrets: ReadonlyMap<string, string>;
	private readonly wait: (ms: number) => Promise<void>;

	constructor(options: SignedInSessionOptions) {
		this.redact = options.redact;
		this.client = options.client;
		this.description = options.description;
		this.secrets = options.secrets;
		this.wait = options.wait ?? realWait;
	}

	/**
	 * Sign in: open the sign-in address, carry the steps out, find the sign.
	 *
	 * @param abandoned - Aborted when nobody is waiting for this sign-in any more
	 * @returns Whether the run is signed in, and if not, why
	 */
	async establish(abandoned?: AbortSignal): Promise<SignInOutcome> {
		const timeoutMs = this.description.timeoutMs ?? defaultSignInTimeoutMs;
		let outcome: SignInOutcome;

		try {
			outcome = await withDeadline(timeoutMs, async expired =>
				this.signIn(
					abandoned ? AbortSignal.any([expired, abandoned]) : expired,
				),
			);
		} catch (error) {
			if (!(error instanceof DeadlineExpired)) {
				throw error;
			}

			outcome = {
				kind: 'failed',
				failure: {kind: 'timed-out', afterMs: timeoutMs},
			};
		}

		logger.info('Sign-in finished', {
			outcome: outcome.kind,
			...(outcome.kind === 'failed' && {failure: outcome.failure.kind}),
		});
		return outcome;
	}

	/**
	 * Decide whether a captured page may be reviewed.
	 *
	 * A capture showing the sign is admitted as it is. One that does not is
	 * re-captured for a short while, since a sign can render late; after that
	 * the session signs in again, once, and re-opens the page.
	 *
	 * @param pageUrl - The configured address of the page
	 * @param snapshot - The structure captured for it
	 * @param abandoned - Aborted when the page stops waiting, as when its time
	 * runs out. Recovery drives the browser for seconds, and past that point it
	 * would be driving it under the page reviewed next.
	 * @returns The capture to review, or why the page was refused
	 */
	async admit(
		pageUrl: string,
		snapshot: string,
		abandoned?: AbortSignal,
	): Promise<PageAdmission> {
		const shown = await this.awaitSign(snapshot, abandoned);
		if (shown !== undefined) {
			return this.admitted(pageUrl, shown);
		}

		if (abandoned?.aborted) {
			return this.refused('session-lost', abandonedText);
		}

		logger.warn('Signed-in sign absent, signing in again', {pageUrl});
		const again = await this.establish(abandoned);
		if (abandoned?.aborted) {
			return this.refused('session-lost', abandonedText);
		}

		if (again.kind === 'failed') {
			return this.refused(
				'session-lost',
				describeSignInFailure(again.failure, this.description),
			);
		}

		// Signing in again lands on a page that shows the sign. Were the page
		// asked for not opened, that one would be captured in its place.
		const reopening = await this.call(
			'navigate_page',
			{url: pageUrl},
			abandoned,
		);
		if (reopening.failed) {
			return this.refused('not-reopened', reopening.text);
		}

		const reopened = await this.awaitSign(
			await this.capture(abandoned),
			abandoned,
		);
		if (reopened !== undefined) {
			return this.admitted(pageUrl, reopened);
		}

		return this.refused('sign-missing');
	}

	/**
	 * Refuse a page. The text names the sign, which may itself spell a secret.
	 */
	private refused(reason: NotReachedReason, detail?: string): PageAdmission {
		return {
			kind: 'refused',
			reason,
			detail: this.redact(describeNotReached(reason, this.description, detail)),
		};
	}

	private admitted(pageUrl: string, snapshot: string): PageAdmission {
		const reachedUrl = reachedUrlOf(snapshot);

		return {
			kind: 'admitted',
			snapshot: this.redact(snapshot),
			...(reachedUrl !== undefined &&
				!sameAddress(reachedUrl, pageUrl) && {
					reachedUrl: this.redact(reachedUrl),
				}),
		};
	}

	/**
	 * Call a browser tool, treating a transport failure as a failed call.
	 *
	 * Nothing is asked of the browser once the work has been abandoned: a
	 * deadline stops the waiting, not the code that was waited for, and that
	 * code would otherwise go on to type into whatever page is open by then.
	 * A call already under way cannot be recalled; no further one is made.
	 */
	private async call(
		name: string,
		toolArguments: Record<string, unknown>,
		abandoned?: AbortSignal,
	): Promise<ToolOutcome> {
		if (abandoned?.aborted) {
			return {text: abandonedText, failed: true};
		}

		try {
			return readToolOutcome(
				await this.client.callTool({name, arguments: toolArguments}),
			);
		} catch (error) {
			return {
				text: error instanceof Error ? error.message : String(error),
				failed: true,
			};
		}
	}

	/**
	 * Capture the open page. A capture that failed reads as an empty page,
	 * which shows neither a target nor the sign.
	 */
	private async capture(abandoned?: AbortSignal): Promise<string> {
		const outcome = await this.call('take_snapshot', {}, abandoned);
		return outcome.failed ? '' : outcome.text;
	}

	/**
	 * Re-capture until a condition holds or the window closes.
	 *
	 * @returns The last capture taken; the caller asks it the question again
	 */
	private async recheck(
		snapshot: string,
		settled: (snapshot: string) => boolean,
		signal?: AbortSignal,
		waited = 0,
	): Promise<string> {
		if (settled(snapshot) || waited >= signWaitWindowMs || signal?.aborted) {
			return snapshot;
		}

		await this.wait(recheckIntervalMs);
		return this.recheck(
			await this.capture(signal),
			settled,
			signal,
			waited + recheckIntervalMs,
		);
	}

	/**
	 * Wait for the sign on the open page.
	 *
	 * @returns The capture that shows it, or undefined when it never appeared
	 */
	private async awaitSign(
		first: string,
		abandoned?: AbortSignal,
	): Promise<string | undefined> {
		const shows = (snapshot: string) => this.showsSign(snapshot);
		const snapshot = await this.recheck(first, shows, abandoned);

		return shows(snapshot) ? snapshot : undefined;
	}

	/**
	 * Whether a capture shows the signed-in sign.
	 *
	 * A capture a run hands over has already been redacted, so a sign that
	 * spells a secret -- an account name supplied as one -- is looked for in
	 * its redacted spelling as well.
	 */
	private showsSign(snapshot: string): boolean {
		const sign = this.description.signedIn;

		return (
			hasSignedInSign(snapshot, sign) ||
			hasSignedInSign(snapshot, {...sign, name: this.redact(sign.name)})
		);
	}

	private failed(failure: SignInFailure): SignInOutcome {
		return {kind: 'failed', failure};
	}

	private async signIn(signal: AbortSignal): Promise<SignInOutcome> {
		const opened = await this.call(
			'navigate_page',
			{url: this.description.url},
			signal,
		);
		if (opened.failed) {
			return this.failed({
				kind: 'not-opened',
				detail: this.redact(opened.text),
			});
		}

		const shows = (snapshot: string) => this.showsSign(snapshot);

		// A product may send a visitor who is already signed in away from its
		// login page. There is then no form to fill, and nothing to do.
		const arrival = await this.capture(signal);
		if (shows(arrival)) {
			return {kind: 'signed-in'};
		}

		const failure = await this.carryOutFrom(0, signal, arrival);
		if (failure) {
			return this.failed(failure);
		}

		const last = await this.recheck(await this.capture(signal), shows, signal);

		return shows(last)
			? {kind: 'signed-in'}
			: this.failed({
					kind: 'sign-absent',
					shown: this.redact(describeShown(last)),
				});
	}

	/**
	 * Carry out the steps from one position on, in order.
	 *
	 * @returns The first failure, or undefined when every step was carried out
	 */
	private async carryOutFrom(
		stepIndex: number,
		signal: AbortSignal,
		arrival?: string,
	): Promise<SignInFailure | undefined> {
		const step = this.description.steps[stepIndex];

		// Once the deadline has answered for this attempt, carrying on would
		// type into whatever page the next attempt has open.
		if (!step || signal.aborted) {
			return undefined;
		}

		return (
			(await this.carryOut(step, stepIndex, signal, arrival)) ??
			this.carryOutFrom(stepIndex + 1, signal)
		);
	}

	/**
	 * Carry one step out against a fresh capture of the page.
	 *
	 * @returns Why the step failed, or undefined when it was carried out
	 */
	private async carryOut(
		step: SignInStep,
		stepIndex: number,
		signal: AbortSignal,
		arrival?: string,
	): Promise<SignInFailure | undefined> {
		const filling = 'fill' in step;
		const target = {
			name: filling ? step.fill : step.click,
			...(step.role !== undefined && {role: step.role}),
		};
		const resolve = (snapshot: string): TargetResolution =>
			resolveTarget(snapshot, target, filling ? fillableRoles : clickableRoles);

		// Only an absent target is waited for: a form can render late, but two
		// matching elements do not become one by waiting.
		// The first step reads the capture sign-in arrived on; every later one
		// captures afresh, because the step before it changed the page.
		const snapshot = await this.recheck(
			arrival ?? (await this.capture(signal)),
			candidate => resolve(candidate).kind !== 'not-found',
			signal,
		);
		const resolution = resolve(snapshot);

		const failure = (
			problem: 'not-found' | 'ambiguous' | 'tool-error',
		): SignInFailure => ({
			kind: 'step-failed',
			stepIndex,
			step: describeStep(step),
			problem,
			shown: this.redact(describeShown(snapshot)),
		});

		if (resolution.kind !== 'found') {
			return failure(resolution.kind);
		}

		// The capture above may have been answered after the deadline had
		// already answered for this attempt; `call` then asks for nothing.
		const outcome = filling
			? await this.call(
					'fill',
					{uid: resolution.uid, value: this.valueOf(step)},
					signal,
				)
			: await this.call('click', {uid: resolution.uid}, signal);

		return outcome.failed ? failure('tool-error') : undefined;
	}

	private valueOf(step: Extract<SignInStep, {fill: string}>): string {
		if ('value' in step) {
			return step.value;
		}

		// Checked before any browser started; absent here only if the session
		// was built by hand without the secrets its description names.
		const value = this.secrets.get(step.secret);
		if (value === undefined) {
			throw new Error(`Sign-in was not given the secret ${step.secret}`);
		}

		return value;
	}
}

/**
 * Build the session a configuration's sign-in describes.
 *
 * Signs nothing in: that is a step of the run, with its own place in the
 * order of things.
 *
 * @param description - The configuration's sign-in description
 * @param client - The run's browser client
 * @param environment - Where secrets are read from
 * @returns The session
 * @throws When a named secret is missing or unusable
 */
export function createSignedInSession(
	description: SignInDescription,
	client: SignInBrowser,
	environment: Readonly<Record<string, string | undefined>> = process.env,
): SignedInSession {
	const resolved = resolveSecrets(description, environment);

	if (resolved.kind === 'missing') {
		throw new Error(missingSecretText(resolved.names));
	}

	if (resolved.kind === 'unusable') {
		throw new Error(unusableSecretText(resolved.name, resolved.reason));
	}

	return new SignedInSession({
		client,
		description,
		secrets: resolved.values,
		redact: createRedactor(resolved.values.values()),
	});
}

/**
 * Raised when a run could not sign in.
 *
 * Its own class because every entry point answers it differently from any
 * other failure: no page is attempted, and the report still gets written.
 */
export class SignInFailed extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'SignInFailed';
	}
}

/**
 * Sign a run in before its first page, when it has a session.
 *
 * @param session - The run's session, if its configuration describes a sign-in
 * @param description - That description, for wording a failure
 * @returns True when the run signed in, false when it has no session
 * @throws SignInFailed with the failure's reason when signing in failed
 */
export async function signRunIn(
	session: SignedInSession | undefined,
	description: SignInDescription | undefined,
): Promise<boolean> {
	if (!session) {
		return false;
	}

	const outcome = await session.establish();
	if (outcome.kind === 'failed') {
		// The text names the sign, which may itself spell a secret.
		throw new SignInFailed(
			description
				? session.redact(describeSignInFailure(outcome.failure, description))
				: `Sign-in failed (${outcome.failure.kind})`,
		);
	}

	return true;
}

/**
 * Write the report of a run that could not sign in.
 *
 * No page was reviewed, so every configured page is recorded as failed with
 * the reason: without that, a pipeline that failed would leave nothing saying
 * which pages went unreviewed. A report that cannot be written is logged and
 * not raised, because the sign-in failure is what the caller has to report.
 *
 * @param builder - The run's report accumulator
 * @param config - The run's configuration
 * @param provenance - The tooling behind the run
 * @param reason - Why signing in failed
 */
export async function reportFailedSignIn(
	builder: ReportBuilder,
	config: UxLintConfig,
	provenance: RunProvenance,
	reason: string,
): Promise<void> {
	builder.setProvenance({...provenance, signedIn: false});
	builder.setPersona(config.persona);
	builder.failEveryPage(config.pages, reason);

	try {
		await builder.saveReport(config.report.output);
	} catch (error) {
		logger.error('The report of a failed sign-in could not be written', {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Word a run's failure for the terminal, writing the report first when the
 * failure was the sign-in.
 *
 * A failed sign-in is reported under its own name and still leaves a report;
 * anything else is a failed analysis and leaves none.
 *
 * @param error - What ended the run
 * @param config - The run's configuration
 * @param provenance - The tooling behind the run
 * @param run - The run, when it got as far as being assembled
 * @returns The message, without the `uxlint:` prefix
 */
export async function settleRunFailure(
	error: unknown,
	config: UxLintConfig,
	provenance: RunProvenance,
	run: {reportBuilder: ReportBuilder} | undefined,
): Promise<string> {
	const reason = error instanceof Error ? error.message : 'Unknown error';

	if (error instanceof SignInFailed && run) {
		await reportFailedSignIn(run.reportBuilder, config, provenance, reason);
		return `sign-in failed — ${reason}`;
	}

	return `analysis failed — ${reason}`;
}

/**
 * Check that every secret a configuration's sign-in names can be used.
 *
 * Runs before any browser starts, so that a pipeline missing a secret says so
 * at once rather than after opening the login page.
 *
 * @param config - The run's configuration
 * @param environment - Where secrets are read from
 * @returns The message to stop with, or undefined when nothing is wrong
 */
export function checkSignInSecrets(
	config: UxLintConfig,
	environment: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
	if (!config.signIn) {
		return undefined;
	}

	const resolved = resolveSecrets(config.signIn, environment);

	if (resolved.kind === 'missing') {
		return missingSecretText(resolved.names);
	}

	return resolved.kind === 'unusable'
		? unusableSecretText(resolved.name, resolved.reason)
		: undefined;
}
