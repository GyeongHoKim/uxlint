/**
 * Signing in with a real browser (011 T025 · SC-001, SC-006).
 *
 * Every other sign-in test drives a scripted client. This one starts the
 * fixture site, the pinned browser server and a real headless Chrome, because
 * the properties it checks are the ones a script cannot confirm: that the
 * server's `fill` and `click` really submit a form, that the session cookie
 * really persists from one navigation to the next, and how long it all takes.
 *
 * Skipped where no browser is installed, by the same convention as
 * `browser-preflight.spec.ts`.
 */

import {randomUUID} from 'node:crypto';
import * as fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';
import process from 'node:process';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {MockLanguageModelV4} from 'ai/test';
import test, {type ExecutionContext} from 'ava';
import {runCIAnalysis} from '../../source/ci-runner.js';
import {captureForAgent} from '../../source/delegate/driven/capture.js';
import {serveEvidence} from '../../source/delegate/driven/evidence.js';
import {submitJudgement} from '../../source/delegate/driven/submit.js';
import {claudeCode} from '../../source/delegate/host/claude-code.js';
import type {HostAgentAdapter} from '../../source/delegate/host/types.js';
import {runDelegatedAnalysis} from '../../source/delegate/runner.js';
import {getLogFilePath, logger} from '../../source/infrastructure/logger.js';
import type {UxLintConfig} from '../../source/models/config.js';
import {createRedactor} from '../../source/models/secret-redaction.js';
import type {SignInDescription} from '../../source/models/sign-in.js';
import {readToolOutcome} from '../../source/models/tool-output.js';
import {
	defaultChromePaths,
	runPreflight,
} from '../../source/services/browser-preflight.js';
import {
	getMCPClient,
	resetMCPClient,
} from '../../source/services/mcp-client.js';
import {createAIService} from '../../source/services/ai-service.js';
import {
	SignedInSession,
	type SignInBrowser,
} from '../../source/services/sign-in.js';
import {runSequentially} from '../../source/utils/run-sequentially.js';
import {installFakeHosts} from '../delegate/host/fake-hosts.js';
import {
	loginSiteEmail,
	startLoginSite,
	type LoginSite,
} from '../fixtures/login-site.js';

const hasBrowser = defaultChromePaths().some(path => {
	try {
		fs.accessSync(path, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
});

const realBrowser = hasBrowser ? test.serial : test.serial.skip;

const password = 'correct-horse-battery-staple';

/** The single-screen form at `/login`. */
const oneScreen = (site: LoginSite): SignInDescription => ({
	url: `${site.baseUrl}/login`,
	steps: [
		{fill: 'Email', value: loginSiteEmail},
		{fill: 'Password', secret: 'QA_PASSWORD'},
		{click: 'Sign in'},
	],
	signedIn: {name: 'Sign out', role: 'button'},
});

/** The form at `/login-2step`: the email on one screen, the password on the next. */
const twoScreens = (site: LoginSite): SignInDescription => ({
	url: `${site.baseUrl}/login-2step`,
	steps: [
		{fill: 'Email', value: loginSiteEmail},
		{click: 'Next'},
		{fill: 'Password', secret: 'QA_PASSWORD'},
		{click: 'Sign in'},
	],
	signedIn: {name: 'Sign out', role: 'button'},
});

/**
 * A fixture site and a real browser, torn down with the test.
 */
async function startRun(t: {
	teardown(fn: () => Promise<void>): void;
	timeout(ms: number): void;
}) {
	// A real browser, and waits measured in seconds: the suite's idle limit is
	// sized for tests that spawn nothing.
	t.timeout(120_000);

	const site = await startLoginSite({password});
	const verdict = await runPreflight(undefined);
	if (verdict.kind === 'unmet') {
		await site.close();
		throw new Error('a browser was found but preflight says it cannot run');
	}

	const client = await getMCPClient(verdict, undefined);
	t.teardown(async () => {
		await client.close();
		resetMCPClient();
		await site.close();
	});

	return {site, client};
}

const sessionFor = (client: MCPClient, description: SignInDescription) =>
	new SignedInSession({
		client,
		description,
		secrets: new Map([['QA_PASSWORD', password]]),
		redact: createRedactor([password]),
	});

/** Open a page and capture it, as each route does before asking the session. */
async function capture(client: MCPClient, url: string): Promise<string> {
	const browser = client as unknown as SignInBrowser;
	await browser.callTool({name: 'navigate_page', arguments: {url}});
	return readToolOutcome(
		await browser.callTool({name: 'take_snapshot', arguments: {}}),
	).text;
}

realBrowser(
	'a real browser signs in through the form and keeps its session across pages',
	async t => {
		const {site, client} = await startRun(t);
		const session = sessionFor(client, oneScreen(site));

		const startedAt = Date.now();
		const outcome = await session.establish();
		const signInMs = Date.now() - startedAt;

		t.deepEqual(outcome, {kind: 'signed-in'});

		// The feature's baseline (SC-006): recorded so a regression has a
		// number to be measured against, and bounded so one cannot hide.
		t.log(`sign-in against the fixture site took ${signInMs} ms`);
		t.true(signInMs < 5000, `sign-in took ${signInMs} ms`);

		// One browser, one page at a time.
		const admissions = await runSequentially(
			['/dashboard', '/settings', '/billing'],
			async path => {
				const url = `${site.baseUrl}${path}`;
				return {
					url,
					admission: await session.admit(url, await capture(client, url)),
				};
			},
		);

		for (const {url, admission} of admissions) {
			t.is(admission.kind, 'admitted', `${url} was not admitted`);
			if (admission.kind === 'admitted') {
				t.true(admission.snapshot.includes(`url="${url}"`));
				t.is(admission.reachedUrl, undefined);
			}
		}

		t.is(site.signInCount(), 1, 'the run signed in once for all its pages');
	},
);

realBrowser(
	'a real browser signs in through a form that spans two screens',
	async t => {
		const {site, client} = await startRun(t);
		const session = sessionFor(client, twoScreens(site));

		t.deepEqual(await session.establish(), {kind: 'signed-in'});
		t.is(site.signInCount(), 1);
	},
);

realBrowser(
	'a page that prints the password is admitted without it',
	async t => {
		const {site, client} = await startRun(t);
		const session = sessionFor(client, oneScreen(site));
		await session.establish();

		const url = `${site.baseUrl}/secret`;
		const raw = await capture(client, url);
		const admission = await session.admit(url, raw);

		// The premise first: the browser really does hand the value back.
		t.true(raw.includes(password));
		t.is(admission.kind, 'admitted');
		if (admission.kind === 'admitted') {
			t.false(admission.snapshot.includes(password));
			t.true(admission.snapshot.includes('[redacted]'));
		}
	},
);

realBrowser('a real browser reports a rejected password', async t => {
	const {site, client} = await startRun(t);
	site.setPassword('changed-since-the-run-was-configured');
	const session = sessionFor(client, oneScreen(site));

	const outcome = await session.establish();

	t.is(outcome.kind, 'failed');
	if (outcome.kind === 'failed' && outcome.failure.kind === 'sign-absent') {
		t.regex(outcome.failure.shown, /Invalid email or password/);
	} else {
		t.fail(`expected sign-absent, got ${JSON.stringify(outcome)}`);
	}

	t.is(site.signInCount(), 0);
});

// --- a session that does not last (011 T041) --------------------------------

realBrowser(
	'a session that expires between two pages is re-established once',
	async t => {
		const {site, client} = await startRun(t);
		const session = sessionFor(client, oneScreen(site));
		await session.establish();

		const first = `${site.baseUrl}/dashboard`;
		const before = await session.admit(first, await capture(client, first));
		t.is(before.kind, 'admitted');

		site.expireSessions();
		const second = `${site.baseUrl}/settings`;
		const admission = await session.admit(
			second,
			await capture(client, second),
		);

		t.is(admission.kind, 'admitted');
		if (admission.kind === 'admitted') {
			t.true(admission.snapshot.includes(`url="${second}"`));
		}

		t.is(site.signInCount(), 2, 'exactly one further sign-in');
	},
);

realBrowser(
	'a session that cannot be re-established fails its page, and the next is still attempted',
	async t => {
		const {site, client} = await startRun(t);
		const session = sessionFor(client, oneScreen(site));
		await session.establish();

		site.expireSessions();
		site.setPassword('changed-since-the-run-began');

		const first = `${site.baseUrl}/settings`;
		const lost = await session.admit(first, await capture(client, first));
		const second = `${site.baseUrl}/billing`;
		const next = await session.admit(second, await capture(client, second));

		t.is(lost.kind, 'refused');
		if (lost.kind === 'refused') {
			t.is(lost.reason, 'session-lost');
			t.regex(lost.detail, /Invalid email or password/);
			t.false(lost.detail.includes(password));
		}

		// Attempted, and answered: one page's failure does not end the run.
		t.is(next.kind, 'refused');
		t.is(site.signInCount(), 1);
	},
);

realBrowser(
	'a page that does not carry the sign is refused as such, not as a lost session',
	async t => {
		const {site, client} = await startRun(t);
		const session = sessionFor(client, oneScreen(site));
		await session.establish();

		const url = `${site.baseUrl}/no-sign`;
		const admission = await session.admit(url, await capture(client, url));

		t.is(admission.kind, 'refused');
		if (admission.kind === 'refused') {
			t.is(admission.reason, 'sign-missing');
		}
	},
);

// --- the secret sweep (011 T056 · SC-005, FR-019, FR-021, FR-022) -----------
//
// Each route reviews `/secret`, a page that prints the account's password, and
// is then searched: everything it sent, printed, wrote or left behind. The
// password is drawn fresh for every test, so a value found in the day's log
// file was put there by this run and by nothing before it.

const secretName = 'UXLINT_SWEEP_PASSWORD';

/** What the page prints its key after, and so what a redacted key follows. */
const redactedKey = 'Your key: [redacted]';

type Sink = {label: string; text: string};

/** Every file under a directory, read whole. A directory that is gone has none. */
async function filesUnder(directory: string): Promise<Sink[]> {
	const entries = await fs.promises
		.readdir(directory, {recursive: true, withFileTypes: true})
		.catch(() => []);

	return Promise.all(
		entries
			.filter(entry => entry.isFile())
			.map(async entry => {
				const file = nodePath.join(entry.parentPath, entry.name);
				return {
					label: file,
					text: await fs.promises.readFile(file, 'latin1'),
				};
			}),
	);
}

/** The sinks a value turned up in. Empty is the only acceptable answer. */
const holding = (value: string, sinks: readonly Sink[]): string[] =>
	sinks.filter(sink => sink.text.includes(value)).map(sink => sink.label);

/**
 * The log file as it stands once everything logged so far has reached it.
 *
 * The transport writes asynchronously, so a marker is logged and waited for:
 * a log read before its last entries landed would pass for the wrong reason.
 *
 * @param logFile - Where this process logs
 * @returns The file's contents
 */
async function settledLog(logFile: string): Promise<string> {
	const marker = `sweep-marker-${randomUUID()}`;
	logger.info(marker);

	const read = async (attemptsLeft: number): Promise<string> => {
		const contents = await fs.promises
			.readFile(logFile, 'utf8')
			.catch(() => '');
		if (contents.includes(marker) || attemptsLeft === 0) {
			return contents;
		}

		await new Promise(resolve => {
			setTimeout(resolve, 50);
		});
		return read(attemptsLeft - 1);
	};

	return read(100);
}

/**
 * A fixture site with a password nobody has seen before, a place for the
 * route to write, and the values that must not turn up anywhere.
 */
async function startSweep(t: ExecutionContext) {
	// Signing in, an audit and a trace, all in a real browser.
	t.timeout(240_000);

	const sweepPassword = `sweep-${randomUUID()}`;
	process.env[secretName] = sweepPassword;

	// Resolved before anything moves HOME: the fake host agents do.
	const logFile = getLogFilePath();
	const site = await startLoginSite({password: sweepPassword});
	const work = await fs.promises.mkdtemp(
		nodePath.join(os.tmpdir(), 'uxlint-sweep-'),
	);
	const runs = nodePath.join(work, 'runs');
	await fs.promises.mkdir(runs);

	t.teardown(async () => {
		Reflect.deleteProperty(process.env, secretName);
		resetMCPClient();
		await site.close();
		await fs.promises.rm(work, {recursive: true, force: true});
	});

	const url = `${site.baseUrl}/secret`;
	const output = nodePath.join(work, 'report.md');
	const config: UxLintConfig = {
		mainPageUrl: url,
		subPageUrls: [],
		pages: [{url, features: 'Lists the account API keys'}],
		persona: 'An operations lead rotating a key',
		report: {output},
		signIn: {
			url: `${site.baseUrl}/login`,
			steps: [
				{fill: 'Email', value: loginSiteEmail},
				{fill: 'Password', secret: secretName},
				{click: 'Sign in'},
			],
			signedIn: {name: 'Sign out', role: 'button'},
		},
	};

	return {
		site,
		url,
		work,
		runs,
		output,
		config,
		logFile,

		/** Every value that may appear in nothing the route produced. */
		forbidden: () => [sweepPassword, ...site.sessionIds()],
	};
}

/**
 * Assert that none of the forbidden values is in any sink.
 */
function assertSwept(
	t: ExecutionContext,
	forbidden: readonly string[],
	sinks: readonly Sink[],
): void {
	t.true(forbidden.length >= 2, 'a password and at least one session');

	for (const value of forbidden) {
		t.deepEqual(holding(value, sinks), []);
	}
}

const tokenUsage = {
	inputTokens: {
		total: 1,
		noCache: 1,
		cacheRead: undefined,
		cacheWrite: undefined,
	},
	outputTokens: {total: 1, text: 1, reasoning: undefined},
};

/**
 * A model that opens the page, reads it, reports the line holding the key
 * exactly as it was shown it, and finishes. Every request is kept whole.
 */
const echoingModel = (pageUrl: string) => {
	const requests: string[] = [];
	const turns = [
		'navigate_page',
		'take_snapshot',
		'addFinding',
		'completePageAnalysis',
	];

	const inputFor = (name: string, request: string): string => {
		if (name === 'navigate_page') {
			return JSON.stringify({url: pageUrl});
		}

		if (name !== 'addFinding') {
			return '{}';
		}

		const shown = /Your key: [^"\\]*/.exec(request)?.[0] ?? 'no key shown';
		return JSON.stringify({
			severity: 'high',
			category: 'content',
			description: `The page prints a credential in full — ${shown}`,
			personaRelevance: ['An operations lead rotating a key'],
			recommendation: 'Mask the key until it is asked for.',
			pageUrl,
		});
	};

	const model = new MockLanguageModelV4({
		async doGenerate(options) {
			const request = JSON.stringify(options.prompt);
			const name = turns[Math.min(requests.length, turns.length - 1)]!;
			requests.push(request);

			return {
				finishReason: {unified: 'tool-calls', raw: undefined},
				usage: tokenUsage,
				content: [
					{
						type: 'tool-call' as const,
						toolCallId: `call-${requests.length}`,
						toolName: name,
						input: inputFor(name, request),
					},
				],
				warnings: [],
			};
		},
	});

	return {model, requests};
};

realBrowser(
	'the provider route leaves the password in nothing it sends, prints or writes',
	async t => {
		const sweep = await startSweep(t);
		const {model, requests} = echoingModel(sweep.url);
		const printed: string[] = [];

		const exitCode = await runCIAnalysis(sweep.config, {
			createRun: async (config, verdict) =>
				createAIService(config, verdict, {model}),
			emitVerdict(message) {
				printed.push(message);
			},
		});

		const report = await fs.promises.readFile(sweep.output, 'utf8');

		// The premise first: the run did read the page, and the page's key
		// line did reach the model and the report — without the key.
		t.is(exitCode, 0);
		t.true(requests.some(request => request.includes(redactedKey)));
		t.true(report.includes(redactedKey));
		t.true(
			report.includes('**Signed in**: yes — reviewed as a signed-in visitor'),
		);

		assertSwept(t, sweep.forbidden(), [
			...requests.map((text, index) => ({
				label: `model request ${index + 1}`,
				text,
			})),
			{label: 'terminal', text: printed.join('\n')},
			{label: 'report', text: report},
			{label: 'log file', text: await settledLog(sweep.logFile)},
			...(await filesUnder(sweep.work)),
		]);
	},
);

realBrowser(
	'the launcher route leaves the password in nothing a host agent is handed',
	async t => {
		const sweep = await startSweep(t);

		// Connected before the fake agents replace PATH and HOME, so the
		// browser server starts in the environment a real run gives it.
		const verdict = await runPreflight(undefined);
		if (verdict.kind === 'unmet') {
			throw new Error('a browser was found but preflight says it cannot run');
		}

		const client = await getMCPClient(verdict, undefined);
		const hosts = installFakeHosts(t, {
			installed: ['claude-code'],
			script: {default: {findings: 1, note: true, complete: true}},
		});

		// The run's directory is removed when the run ends, so it is read at
		// the last moment it exists: when the agent's session has finished.
		const handed: Sink[] = [];
		const adapter: HostAgentAdapter = {
			...claudeCode,
			async run(launch, options) {
				const outcome = await claudeCode.run(launch, options);
				handed.push(...(await filesUnder(sweep.runs)));
				return outcome;
			},
		};
		const printed: string[] = [];

		const exitCode = await runDelegatedAnalysis(sweep.config, {
			adapter,
			client,
			sessionParentDirectory: sweep.runs,
			async runPreflight() {
				return verdict;
			},
			emitVerdict(message) {
				printed.push(message);
			},
		});

		const trace = hosts.trace();
		const report = await fs.promises.readFile(sweep.output, 'utf8');

		// The premise: the agent was handed the page, key line and all.
		t.is(exitCode, 0);
		t.true(handed.some(file => file.text.includes(redactedKey)));
		t.true(trace.calls.some(call => call.name === 'getPageEvidence'));

		assertSwept(t, sweep.forbidden(), [
			...handed,
			{label: 'agent trace', text: JSON.stringify(trace)},
			{label: 'terminal', text: printed.join('\n')},
			{label: 'report', text: report},
			{label: 'log file', text: await settledLog(sweep.logFile)},
			// The judgement server is the agent's child and logs under the
			// HOME the agent was given.
			...(await filesUnder(nodePath.dirname(hosts.binDirectory))),
			...(await filesUnder(sweep.work)),
		]);

		t.deepEqual(
			await fs.promises.readdir(sweep.runs),
			[],
			'no run directory outlives the run',
		);
	},
);

realBrowser(
	'the agent-driven route leaves the password in nothing an agent can read back',
	async t => {
		const sweep = await startSweep(t);
		const printed: string[] = [];
		const payloads: unknown[] = [];
		const emitMessage = (message: string) => {
			printed.push(message);
		};

		const emitPayload = (payload: unknown) => {
			payloads.push(payload);
		};

		const captured = await captureForAgent(sweep.config, {
			parentDirectory: sweep.runs,
			emitMessage,
			emitPayload,
		});
		const {run} = payloads[0] as {run: string};

		const served = await serveEvidence({
			run,
			parentDirectory: sweep.runs,
			emitMessage,
			emitPayload,
		});

		// Read while the run is still on disk, which is how an agent finds it.
		const stored = await filesUnder(sweep.runs);

		const submitted = await submitJudgement(sweep.config, {
			run,
			parentDirectory: sweep.runs,
			document: {
				run,
				pages: [
					{
						pageUrl: sweep.url,
						findings: [
							{
								severity: 'high',
								category: 'content',
								description: 'The page prints a credential in full.',
								personaRelevance: ['An operations lead rotating a key'],
								recommendation: 'Mask the key until it is asked for.',
								pageUrl: sweep.url,
							},
						],
						finished: true,
					},
				],
			},
			emitMessage,
		});

		const evidence = JSON.stringify(payloads);
		const report = await fs.promises.readFile(sweep.output, 'utf8');

		// The premise: the evidence carries the page, key line and all.
		t.deepEqual([captured, served, submitted], [0, 0, 0]);
		t.true(evidence.includes(redactedKey));
		t.true(stored.some(file => file.text.includes(redactedKey)));

		assertSwept(t, sweep.forbidden(), [
			{label: 'evidence payloads', text: evidence},
			...stored,
			{label: 'terminal', text: printed.join('\n')},
			{label: 'report', text: report},
			{label: 'log file', text: await settledLog(sweep.logFile)},
			...(await filesUnder(sweep.work)),
		]);
	},
);
