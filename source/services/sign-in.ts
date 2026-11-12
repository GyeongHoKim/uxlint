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
import type {UxLintConfig} from '../models/config.js';
import {resolveSecrets, type Redactor} from '../models/secret-redaction.js';
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
	type PageAdmission,
	type SignInDescription,
	type SignInFailure,
	type SignInOutcome,
	type SignInStep,
	type TargetResolution,
} from '../models/sign-in.js';
import {readToolOutcome, type ToolOutcome} from '../models/tool-output.js';
import {DeadlineExpired, withDeadline} from './deadline.js';

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
	 * @returns Whether the run is signed in, and if not, why
	 */
	async establish(): Promise<SignInOutcome> {
		const timeoutMs = this.description.timeoutMs ?? defaultSignInTimeoutMs;
		let outcome: SignInOutcome;

		try {
			outcome = await withDeadline(timeoutMs, async signal =>
				this.signIn(signal),
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
	 * @returns The capture to review, or why the page was refused
	 */
	async admit(pageUrl: string, snapshot: string): Promise<PageAdmission> {
		const shown = await this.awaitSign(snapshot);
		if (shown !== undefined) {
			return this.admitted(pageUrl, shown);
		}

		logger.warn('Signed-in sign absent, signing in again', {pageUrl});
		const again = await this.establish();
		if (again.kind === 'failed') {
			return {
				kind: 'refused',
				reason: 'session-lost',
				detail: describeNotReached(
					'session-lost',
					this.description,
					describeSignInFailure(again.failure, this.description),
				),
			};
		}

		await this.call('navigate_page', {url: pageUrl});
		const reopened = await this.awaitSign(await this.capture());
		if (reopened !== undefined) {
			return this.admitted(pageUrl, reopened);
		}

		return {
			kind: 'refused',
			reason: 'sign-missing',
			detail: describeNotReached('sign-missing', this.description),
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
	 */
	private async call(
		name: string,
		toolArguments: Record<string, unknown>,
	): Promise<ToolOutcome> {
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
	private async capture(): Promise<string> {
		const outcome = await this.call('take_snapshot', {});
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
			await this.capture(),
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
	private async awaitSign(first: string): Promise<string | undefined> {
		const shows = (snapshot: string) =>
			hasSignedInSign(snapshot, this.description.signedIn);
		const snapshot = await this.recheck(first, shows);

		return shows(snapshot) ? snapshot : undefined;
	}

	private failed(failure: SignInFailure): SignInOutcome {
		return {kind: 'failed', failure};
	}

	private async signIn(signal: AbortSignal): Promise<SignInOutcome> {
		const opened = await this.call('navigate_page', {
			url: this.description.url,
		});
		if (opened.failed) {
			return this.failed({
				kind: 'not-opened',
				detail: this.redact(opened.text),
			});
		}

		const failure = await this.carryOutFrom(0, signal);
		if (failure) {
			return this.failed(failure);
		}

		const shows = (snapshot: string) =>
			hasSignedInSign(snapshot, this.description.signedIn);
		const last = await this.recheck(await this.capture(), shows, signal);

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
	): Promise<SignInFailure | undefined> {
		const step = this.description.steps[stepIndex];

		// Once the deadline has answered for this attempt, carrying on would
		// type into whatever page the next attempt has open.
		if (!step || signal.aborted) {
			return undefined;
		}

		return (
			(await this.carryOut(step, stepIndex, signal)) ??
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
		const snapshot = await this.recheck(
			await this.capture(),
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

		const outcome = filling
			? await this.call('fill', {
					uid: resolution.uid,
					value: this.valueOf(step),
				})
			: await this.call('click', {uid: resolution.uid});

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
