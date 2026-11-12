/**
 * `uxlint sign-in`
 *
 * Checks that the configured sign-in works, and which configured pages show
 * the signed-in sign, without reviewing anything: no model is called, nothing
 * is measured and no report is written.
 *
 * @packageDocumentation
 */

import process from 'node:process';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {capturePage, checkBrowser} from './delegate/capture-pass.js';
import {writeTerminalMessage} from './infrastructure/console-output.js';
import {logger} from './infrastructure/logger.js';
import type {Page, UxLintConfig} from './models/config.js';
import {
	describeSignInFailure,
	type SignInDescription,
	type SignInFailure,
} from './models/sign-in.js';
import {runPreflight as defaultRunPreflight} from './services/browser-preflight.js';
import {
	getMCPClient,
	redactingClient,
	requireSignInTools,
	resetMCPClient,
} from './services/mcp-client.js';
import {
	checkSignInSecrets,
	createSignedInSession,
	type SignedInSession,
} from './services/sign-in.js';
import {runSequentially} from './utils/run-sequentially.js';

/**
 * Collaborators the check needs, injectable so it can be driven without a
 * browser.
 */
export type SignInCheckDependencies = {
	/** Browser connection; defaults to one built from the preflight verdict */
	client?: MCPClient;

	/** Checks the environment can run a browser */
	runPreflight?: typeof defaultRunPreflight;

	/** Where each line of the result goes */
	emitMessage?: (message: string) => void;

	/** Where secrets are read from */
	environment?: Readonly<Record<string, string | undefined>>;

	/** The clock sign-in is timed by */
	now?: () => number;
};

/** What the check found: the lines to print, and the exit status. */
type CheckResult = {lines: string[]; exitCode: number};

/**
 * The line for a sign-in that failed.
 *
 * A failed step is named in the line itself, since which step failed is what
 * the developer came to find out.
 *
 * @param failure - Why signing in failed
 * @param description - The description that was carried out
 * @returns The line
 */
function failureLine(
	failure: SignInFailure,
	description: SignInDescription,
): string {
	const reason = describeSignInFailure(failure, description);

	return failure.kind === 'step-failed'
		? `uxlint: s${reason.slice(1)}`
		: `uxlint: sign-in failed — ${reason}`;
}

/**
 * Open one configured page and say whether a signed-in visitor reached it.
 *
 * The same capture and the same admission a review applies, so the check
 * cannot pass a page a review would refuse.
 *
 * @param client - The browser client
 * @param page - The page to open
 * @param session - The signed-in session
 * @param description - The description, for naming the sign
 * @returns The page's line, and whether it counts against the check
 */
async function checkPage(
	client: MCPClient,
	page: Page,
	session: SignedInSession,
	description: SignInDescription,
): Promise<{line: string; refused: boolean}> {
	const result = await capturePage(client, page, session);

	if (result.notReached === 'sign-missing') {
		return {
			line: `  ✗ ${page.url} — signed in, but this page did not show the signed-in sign "${description.signedIn.name}"`,
			refused: true,
		};
	}

	if (result.failureReason !== undefined) {
		return {line: `  ✗ ${page.url} — ${result.failureReason}`, refused: true};
	}

	return {
		line:
			result.reachedUrl === undefined
				? `  ✓ ${page.url}`
				: `  → ${page.url} — reached ${result.reachedUrl}`,
		refused: false,
	};
}

/**
 * Sign in, and say how long it took.
 *
 * @param session - The session to establish
 * @param now - The clock
 * @returns The outcome and the time it took
 */
async function timedSignIn(session: SignedInSession, now: () => number) {
	const startedAt = now();
	const outcome = await session.establish();
	return {outcome, elapsedMs: now() - startedAt};
}

/**
 * Sign in and try every configured page.
 *
 * @param config - Validated configuration
 * @param description - Its sign-in description
 * @param client - A connected browser client
 * @param dependencies - Where secrets and the time come from
 * @returns What to print and the exit status
 */
async function check(
	config: UxLintConfig,
	description: SignInDescription,
	client: MCPClient,
	dependencies: Required<Pick<SignInCheckDependencies, 'environment' | 'now'>>,
): Promise<CheckResult> {
	const {environment, now} = dependencies;

	requireSignInTools(await client.tools());
	const session = createSignedInSession(description, client, environment);

	// As a review does: nothing the browser returns from here on, and nothing
	// logged, carries a secret.
	logger.setRedactor(session.redact);

	const {outcome, elapsedMs} = await timedSignIn(session, now);

	if (outcome.kind === 'failed') {
		return {lines: [failureLine(outcome.failure, description)], exitCode: 1};
	}

	// One browser, one page at a time.
	const guarded = redactingClient(client, session.redact);
	const pages = await runSequentially(config.pages, async page =>
		checkPage(guarded, page, session, description),
	);

	const {name, role} = description.signedIn;
	const sign = role === undefined ? `"${name}"` : `${role} "${name}"`;
	const steps = `${description.steps.length} step${
		description.steps.length === 1 ? '' : 's'
	}`;

	return {
		lines: [
			`uxlint: signed in — found ${sign} after ${steps} (${(elapsedMs / 1000).toFixed(1)} s)`,
			...pages.map(page => page.line),
		],
		exitCode: pages.some(page => page.refused) ? 1 : 0,
	};
}

/**
 * Sign in, then say which configured pages a signed-in visitor reaches.
 *
 * Nothing is printed until the browser has been closed: stdout belongs to the
 * browser server's transport while it is open (see `console-output.ts`).
 *
 * @param config - Validated configuration
 * @param dependencies - Collaborators, all optional in production
 * @returns `0` when sign-in worked and every page showed the sign, `1` otherwise
 */
export async function runSignInCheck(
	config: UxLintConfig,
	dependencies: SignInCheckDependencies = {},
): Promise<number> {
	const {
		client,
		runPreflight = defaultRunPreflight,
		emitMessage = writeTerminalMessage,
		environment = process.env,
		now = Date.now,
	} = dependencies;
	const description = config.signIn;

	if (!description) {
		emitMessage('uxlint: this configuration has no signIn block');
		return 1;
	}

	const secretProblem = checkSignInSecrets(config, environment);
	if (secretProblem !== undefined) {
		emitMessage(`uxlint: ${secretProblem}`);
		return 1;
	}

	const preflight = await checkBrowser(config, runPreflight, emitMessage);
	if (!preflight) {
		return 1;
	}

	let browser: MCPClient | undefined;
	let result: CheckResult;

	try {
		browser = client ?? (await getMCPClient(preflight, config.browser));
		result = await check(config, description, browser, {environment, now});
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'Unknown error';
		logger.error('Sign-in check failed', {error: reason});
		result = {lines: [`uxlint: ${reason}`], exitCode: 1};
	} finally {
		if (browser) {
			try {
				await browser.close();
			} catch (closeError) {
				logger.error('Failed to close the browser client', {
					error:
						closeError instanceof Error
							? closeError.message
							: String(closeError),
				});
			}

			resetMCPClient(browser);
		}
	}

	for (const line of result.lines) {
		emitMessage(line);
	}

	return result.exitCode;
}
