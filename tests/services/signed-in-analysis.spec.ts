/**
 * The provider route when a run is signed in (011 T018 · FR-007, FR-008, FR-023).
 *
 * On this route the model itself asks for the page structure, so the session's
 * decision has to sit inside the capture tool the model is handed: what the
 * model reads is what the session admitted, and a capture the session refused
 * is one no request to the model ever carries.
 *
 * The session is a double here. What it decides is tested with the session
 * itself (`sign-in.spec.ts`); this file tests what the analysis does with the
 * decision.
 */

import {promises as fsPromises} from 'node:fs';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {tool} from 'ai';
import {MockLanguageModelV4} from 'ai/test';
import test from 'ava';
import sinon from 'sinon';
import {z} from 'zod/v4';
import type {PreflightVerdict} from '../../source/models/browser-preflight.js';
import type {UxLintConfig} from '../../source/models/config.js';
import type {
	PageAdmission,
	SignInDescription,
} from '../../source/models/sign-in.js';
import {
	AIService,
	createAIService,
	createDelegatedRun,
} from '../../source/services/ai-service.js';
import type {MeasurementService} from '../../source/services/measurement.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import type {SignedInSession} from '../../source/services/sign-in.js';
import {mcpResult} from '../fixtures/mcp-result.js';
import {
	scriptedBrowser,
	simulatedLoginSite,
} from '../fixtures/sign-in-browser.js';

const origin = 'https://app.example.com';

/** What the browser returns for a capture, before the session has seen it. */
const rawCapture = 'uid=1_0 RootWebArea "Sign in" url="RAW-CAPTURE-MARKER"';

/** What the session hands on in its place when it admits the page. */
const admittedCapture =
	'uid=1_0 RootWebArea "Dashboard" url="ADMITTED-CAPTURE-MARKER"';

const config = (urls: string[] = [`${origin}/dashboard`]): UxLintConfig => ({
	mainPageUrl: urls[0]!,
	subPageUrls: urls.slice(1),
	pages: urls.map(url => ({url, features: `features of ${url}`})),
	persona: 'An operations lead',
	report: {output: './signed-in-report.md'},
});

/**
 * A browser server offering everything the real one offers that matters here,
 * including the two tools only sign-in may use.
 */
const browser = (capture: string = rawCapture): MCPClient => {
	const answering = (text: string) =>
		tool({
			description: text,
			inputSchema: z.object({}).loose(),
			async execute() {
				return mcpResult(text);
			},
		});

	return {
		async tools() {
			return {
				navigate_page: answering('navigated'),
				take_snapshot: answering(capture),
				fill: answering('filled'),
				click: answering('clicked'),
			};
		},
		async close() {
			// No transport to close
		},
	} as unknown as MCPClient;
};

const usage = {
	inputTokens: {
		total: 1,
		noCache: 1,
		cacheRead: undefined,
		cacheWrite: undefined,
	},
	outputTokens: {total: 1, text: 1, reasoning: undefined},
};

/**
 * A model that navigates, captures, then completes, one tool per turn, and
 * repeats that for every page it is given. It records every request it was
 * sent: the whole point of these tests is what a request does and does not
 * contain.
 */
const recordingModel = () => {
	const requests: Array<{prompt: string; tools: string[]}> = [];
	const turns = ['navigate_page', 'take_snapshot', 'completePageAnalysis'];
	let turn = 0;

	const model = new MockLanguageModelV4({
		async doGenerate(options) {
			requests.push({
				prompt: JSON.stringify(options.prompt),
				tools: (options.tools ?? []).map(offered => offered.name).sort(),
			});

			// A request holding only the instructions and the page's prompt is
			// the first one of a page.
			if (options.prompt.length <= 2) {
				turn = 0;
			}

			const name = turns[Math.min(turn, turns.length - 1)]!;
			turn++;

			return {
				finishReason: {unified: 'tool-calls', raw: undefined},
				usage,
				content: [
					{
						type: 'tool-call' as const,
						toolCallId: `call-${requests.length}`,
						toolName: name,
						input: name === 'navigate_page' ? `{"url":"${origin}"}` : '{}',
					},
				],
				warnings: [],
			};
		},
	});

	return {model, requests};
};

/** A session whose admission decisions are scripted, one per capture. */
const sessionDeciding = (...decisions: PageAdmission[]) => {
	const admit = sinon.stub();
	for (const [index, decision] of decisions.entries()) {
		admit.onCall(index).resolves(decision);
	}

	return {
		admit,
		session: {
			admit,
			establish: sinon.stub().resolves({kind: 'signed-in'}),
			redact: (text: string) => text,
		} as unknown as SignedInSession,
	};
};

const measurementSpy = () => {
	const measure = sinon.stub().resolves({
		audit: {state: 'not-taken', reason: 'tool-failed'},
		trace: {state: 'not-taken', reason: 'tool-failed'},
	});

	return {measure, service: {measure} as unknown as MeasurementService};
};

const builder = () =>
	new ReportBuilder({...fsPromises, writeFile: sinon.stub().resolves()});

const refusal: PageAdmission = {
	kind: 'refused',
	reason: 'sign-missing',
	detail:
		'Signed in, but this page did not show the signed-in sign "Sign out". The account may not have access to it, or the page may not carry the sign',
};

// --- an admitted page -------------------------------------------------------

test.serial(
	'the session is asked about the capture, for the configured address',
	async t => {
		const {model} = recordingModel();
		const {admit, session} = sessionDeciding({
			kind: 'admitted',
			snapshot: admittedCapture,
		});
		const service = new AIService(model, browser(), builder(), {session});
		const cfg = config();

		await service.analyzePage(cfg, cfg.pages[0]!);

		t.is(admit.callCount, 1);
		t.deepEqual(admit.firstCall.args, [`${origin}/dashboard`, rawCapture]);
		await service.close();
	},
);

test.serial(
	'the model reads the capture the session admitted, not the one the browser returned',
	async t => {
		const {model, requests} = recordingModel();
		const {session} = sessionDeciding({
			kind: 'admitted',
			snapshot: admittedCapture,
		});
		const service = new AIService(model, browser(), builder(), {session});
		const cfg = config();

		const analysis = await service.analyzePage(cfg, cfg.pages[0]!);

		// The third request is the first one sent after the capture.
		t.is(requests.length, 3);
		t.true(requests[2]!.prompt.includes('ADMITTED-CAPTURE-MARKER'));
		t.false(
			requests.some(request => request.prompt.includes('RAW-CAPTURE-MARKER')),
			'what the browser returned must not reach the model unadmitted',
		);
		t.is(analysis.status, 'complete');
		t.is(analysis.snapshot, admittedCapture);
		await service.close();
	},
);

test.serial(
	'an admitted page records the address it was reached at when that differs',
	async t => {
		const {model} = recordingModel();
		const {session} = sessionDeciding({
			kind: 'admitted',
			snapshot: admittedCapture,
			reachedUrl: `${origin}/home`,
		});
		const service = new AIService(model, browser(), builder(), {session});
		const cfg = config();

		const analysis = await service.analyzePage(cfg, cfg.pages[0]!);

		t.is(analysis.reachedUrl, `${origin}/home`);
		await service.close();
	},
);

test.serial(
	'an admitted page reached at its own address records no other address',
	async t => {
		const {model} = recordingModel();
		const {session} = sessionDeciding({
			kind: 'admitted',
			snapshot: admittedCapture,
		});
		const service = new AIService(model, browser(), builder(), {session});
		const cfg = config();

		const analysis = await service.analyzePage(cfg, cfg.pages[0]!);

		t.is(analysis.status, 'complete');
		t.false(Object.hasOwn(analysis, 'reachedUrl'));
		await service.close();
	},
);

// --- a refused page ---------------------------------------------------------

test.serial(
	'a refused page is failed with the reason the session gave',
	async t => {
		const {model} = recordingModel();
		const {session} = sessionDeciding(refusal);
		const service = new AIService(model, browser(), builder(), {session});
		const cfg = config();

		const analysis = await service.analyzePage(cfg, cfg.pages[0]!);

		t.is(analysis.status, 'failed');
		t.is(analysis.error, refusal.kind === 'refused' ? refusal.detail : '');
		await service.close();
	},
);

test.serial('no request to the model carries a refused capture', async t => {
	const {model, requests} = recordingModel();
	const {session} = sessionDeciding(refusal);
	const service = new AIService(model, browser(), builder(), {session});
	const cfg = config();

	await service.analyzePage(cfg, cfg.pages[0]!);

	t.false(
		requests.some(request => request.prompt.includes('RAW-CAPTURE-MARKER')),
		'a page the session refused must never be sent to the provider',
	);
	// Navigate, capture, and nothing after: the page stops at the refusal
	// rather than asking the model what to make of an empty capture.
	t.is(requests.length, 2);
	await service.close();
});

test.serial(
	'a refused page records no snapshot and is not measured',
	async t => {
		const {model} = recordingModel();
		const {session} = sessionDeciding(refusal);
		const measurement = measurementSpy();
		const service = new AIService(model, browser(), builder(), {
			session,
			measurement: measurement.service,
		});
		const cfg = config();

		const analysis = await service.analyzePage(cfg, cfg.pages[0]!);

		t.is(analysis.snapshot, '');
		t.is(analysis.findings.length, 0);
		t.false(
			measurement.measure.calledWith('analysable'),
			'the stage must not advance on a capture that was refused',
		);
		await service.close();
	},
);

test.serial('the page after a refused one is analysed normally', async t => {
	const {model} = recordingModel();
	const {session} = sessionDeciding(refusal, {
		kind: 'admitted',
		snapshot: admittedCapture,
	});
	const service = new AIService(model, browser(), builder(), {session});
	const cfg = config([`${origin}/admin`, `${origin}/dashboard`]);

	const refused = await service.analyzePage(cfg, cfg.pages[0]!);
	const admitted = await service.analyzePage(cfg, cfg.pages[1]!);

	t.is(refused.status, 'failed');
	t.is(admitted.status, 'complete');
	t.is(admitted.snapshot, admittedCapture);
	await service.close();
});

// --- what the model is offered (FR-007) -------------------------------------

test.serial(
	'a signed-in run offers the model exactly the tools an unsigned run does',
	async t => {
		const without = recordingModel();
		const withSession = recordingModel();
		const {session} = sessionDeciding({
			kind: 'admitted',
			snapshot: admittedCapture,
		});
		const cfg = config();

		const plain = new AIService(without.model, browser(), builder());
		await plain.analyzePage(cfg, cfg.pages[0]!);
		const signedIn = new AIService(withSession.model, browser(), builder(), {
			session,
		});
		await signedIn.analyzePage(cfg, cfg.pages[0]!);

		t.deepEqual(
			withSession.requests.map(request => request.tools),
			without.requests.map(request => request.tools),
		);

		// The browser server offers both; the model is never handed either.
		// Sign-in is something uxlint does, not something a model may do.
		for (const request of withSession.requests) {
			t.false(request.tools.includes('fill'));
			t.false(request.tools.includes('click'));
		}

		await plain.close();
		await signedIn.close();
	},
);

// --- a run without a session (FR-023) ---------------------------------------

test.serial(
	'without a session a capture reaches the model as the browser returned it',
	async t => {
		const {model, requests} = recordingModel();
		const service = new AIService(model, browser(), builder());
		const cfg = config();

		const analysis = await service.analyzePage(cfg, cfg.pages[0]!);

		t.is(analysis.status, 'complete');
		t.is(analysis.snapshot, rawCapture);
		t.true(requests[2]!.prompt.includes('RAW-CAPTURE-MARKER'));
		await service.close();
	},
);

test.serial(
	'without a session a page that forwards elsewhere records where it was reviewed',
	async t => {
		// FR-014: applies to every run. A redirect is not a failure and not
		// something uxlint may second-guess; it is something a reader of the
		// report needs to be told.
		const {model} = recordingModel();
		const forwarded = `uid=1_0 RootWebArea "Dashboard" url="${origin}/dashboard"`;
		const service = new AIService(model, browser(forwarded), builder());
		const cfg = config([`${origin}/home`]);

		const analysis = await service.analyzePage(cfg, cfg.pages[0]!);

		t.is(analysis.reachedUrl, `${origin}/dashboard`);
		t.is(analysis.status, 'complete');
		t.is(analysis.snapshot, forwarded);
		t.is(analysis.findings.length, 0);
		await service.close();
	},
);

test.serial(
	'without a session a page reviewed at its own address records no other',
	async t => {
		const {model} = recordingModel();
		// Differs from the configured address only by a trailing slash.
		const direct = `uid=1_0 RootWebArea "Dashboard" url="${origin}/dashboard/"`;
		const service = new AIService(model, browser(direct), builder());
		const cfg = config([`${origin}/dashboard`]);

		const analysis = await service.analyzePage(cfg, cfg.pages[0]!);

		t.is(analysis.status, 'complete');
		t.false(Object.hasOwn(analysis, 'reachedUrl'));
		await service.close();
	},
);

// --- assembling a run -------------------------------------------------------

const verdict: PreflightVerdict = {
	kind: 'ready',
	browser: {
		executablePath: '/opt/google/chrome/chrome',
		version: 'Google Chrome 151.0.7922.137',
		majorVersion: 151,
	},
};

// Literal values only, so that assembling the run needs nothing from the
// environment.
const signIn: SignInDescription = {
	url: `${origin}/login`,
	steps: [
		{fill: 'Email', value: 'qa@example.com'},
		{fill: 'Password', value: 'correct-horse-battery'},
		{click: 'Sign in'},
	],
	signedIn: {name: 'Sign out', role: 'button'},
};

const loginSiteBrowser = (withoutTools: string[] = []) =>
	scriptedBrowser({
		...simulatedLoginSite({origin, password: 'correct-horse-battery'}).script,
		withoutTools,
	});

test('a configuration without sign-in assembles a run without a session', async t => {
	const {client} = loginSiteBrowser();

	const run = await createAIService(config(), verdict, {
		model: new MockLanguageModelV4(),
		client,
		builder: builder(),
	});
	const delegated = await createDelegatedRun(config(), verdict, {
		client,
		builder: builder(),
	});

	t.is(run.session, undefined);
	t.is(delegated.session, undefined);
});

test('a configuration with sign-in assembles a run with a session', async t => {
	const {client} = loginSiteBrowser();

	const run = await createAIService({...config(), signIn}, verdict, {
		model: new MockLanguageModelV4(),
		client,
		builder: builder(),
	});
	const delegated = await createDelegatedRun({...config(), signIn}, verdict, {
		client,
		builder: builder(),
	});

	t.truthy(run.session);
	t.truthy(delegated.session);
});

test('assembling a signed-in run does not sign in', async t => {
	// Signing in is a step of the run with its own place in the order of
	// things and its own failure path, not a side effect of construction.
	const {client, calls} = loginSiteBrowser();

	await createAIService({...config(), signIn}, verdict, {
		model: new MockLanguageModelV4(),
		client,
		builder: builder(),
	});

	t.deepEqual(calls, []);
});

test('the session a run was assembled with can sign in', async t => {
	const site = simulatedLoginSite({origin, password: 'correct-horse-battery'});
	const {client} = scriptedBrowser(site.script);

	const run = await createAIService({...config(), signIn}, verdict, {
		model: new MockLanguageModelV4(),
		client,
		builder: builder(),
	});

	t.deepEqual(await run.session?.establish(), {kind: 'signed-in'});
	t.is(site.signInCount(), 1);
});

test('a browser server that cannot fill is refused only when the run signs in', async t => {
	const {client} = loginSiteBrowser(['fill']);
	const overrides = () => ({
		model: new MockLanguageModelV4(),
		client,
		builder: builder(),
	});

	await t.throwsAsync(
		createAIService({...config(), signIn}, verdict, overrides()),
		{message: /fill, which sign-in requires/},
	);
	await t.throwsAsync(
		createDelegatedRun({...config(), signIn}, verdict, {
			client,
			builder: builder(),
		}),
		{message: /fill, which sign-in requires/},
	);
	await t.notThrowsAsync(createAIService(config(), verdict, overrides()));
});

test('an injected session is used as given', async t => {
	const {client} = loginSiteBrowser();
	const {session} = sessionDeciding();

	const run = await createAIService(config(), verdict, {
		model: new MockLanguageModelV4(),
		client,
		builder: builder(),
		session,
	});

	t.is(run.session, session);
});
