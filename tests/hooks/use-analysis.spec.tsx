/**
 * Tests for useAnalysis hook
 * Verifies state updates for multiple pages and iterations
 */

import {promises as fsPromises} from 'node:fs';
import process from 'node:process';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {act, renderHook, type RenderHookResult} from '@testing-library/react';
import {MockLanguageModelV4} from 'ai/test';
import test from 'ava';
import sinon from 'sinon';
import {
	useAnalysis,
	type UseAnalysisResult,
} from '../../source/hooks/use-analysis.js';
import type {
	AnalysisStage,
	AnalysisState,
	PageAnalysis,
} from '../../source/models/analysis.js';
import type {UxLintConfig} from '../../source/models/config.js';
import type {LLMResponseData} from '../../source/models/llm-response.js';
import {
	describeSignInFailure,
	missingSecretText,
	type SignInFailure,
} from '../../source/models/sign-in.js';
import {AIService} from '../../source/services/ai-service.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import type {SignedInSession} from '../../source/services/sign-in.js';
import {createMockMCPClient} from '../utils.js';

/**
 * Preflight stubbed ready: these tests exercise the analysis flow, not the
 * environment, and the real probe spawns a browser.
 */
const stubPreflight = async () =>
	({
		kind: 'ready',
		browser: {
			executablePath: '/opt/google/chrome/chrome',
			version: 'Google Chrome 151.0.7922.137',
			majorVersion: 151,
		},
	}) as const;

test.serial(
	'useAnalysis updates iteration number within same page',
	async t => {
		const sandbox = sinon.createSandbox();

		// Create mock MCP client
		const mockMCPClient = createMockMCPClient();

		// Create mock language model that requires multiple iterations
		let callCount = 0;
		const mockModel = new MockLanguageModelV4({
			async doGenerate() {
				callCount++;
				if (callCount === 1) {
					// First iteration: navigate. This used to stop without a tool
					// call and rely on the reminder message to keep the loop
					// going; a model that stops now ends the page.
					return {
						content: [
							{
								type: 'tool-call',
								toolCallId: 'call-nav',
								toolName: 'navigate_page',
								input: '{"url":"https://example.com"}',
							},
						],
						finishReason: {unified: 'tool-calls', raw: undefined},
						usage: {
							inputTokens: {
								total: 10,
								noCache: 10,
								cacheRead: undefined,
								cacheWrite: undefined,
							},
							outputTokens: {total: 20, text: 20, reasoning: undefined},
						},
						warnings: [],
					};
				}

				// Second iteration: complete the analysis
				return {
					content: [
						{
							type: 'tool-call',
							toolCallId: 'call-1',
							toolName: 'completePageAnalysis',
							input: '{}',
						},
					],
					finishReason: {unified: 'tool-calls', raw: undefined},
					usage: {
						inputTokens: {
							total: 10,
							noCache: 10,
							cacheRead: undefined,
							cacheWrite: undefined,
						},
						outputTokens: {total: 20, text: 20, reasoning: undefined},
					},
					warnings: [],
				};
			},
		});

		const mockFsAsync = {
			...fsPromises,
			writeFile: sandbox.stub().resolves(),
		};
		const reportBuilder = new ReportBuilder(mockFsAsync);
		const aiService = new AIService(mockModel, mockMCPClient, reportBuilder);

		// Create a mock run factory: one isolated pair per call.
		const mockCreateRun = async () => ({aiService, reportBuilder});

		const config: UxLintConfig = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [
				{
					url: 'https://example.com',
					features: 'Test page features',
				},
			],
			persona: 'Test persona',
			report: {
				output: './test-report.md',
			},
		};

		// Track state changes
		const stateChanges: Array<{
			currentPageIndex: number;
			currentIteration?: number;
			lastLLMResponse?: LLMResponseData;
			currentStage: AnalysisStage;
		}> = [];

		const {result}: RenderHookResult<UseAnalysisResult, unknown> = renderHook(
			() => useAnalysis(config, mockCreateRun, stubPreflight),
		);

		// Subscribe to state changes - must be done before runAnalysis
		act(() => {
			result.current.onAnalysisStateChange(state => {
				stateChanges.push({
					currentPageIndex: state.currentPageIndex,
					currentIteration: state.currentIteration,
					lastLLMResponse: state.lastLLMResponse,
					currentStage: state.currentStage,
				});
			});
		});

		// Start analysis - analyzePage will initialize page analysis internally
		await act(async () => {
			await result.current.runAnalysis();
		});

		// Wait a bit for all state updates to be collected
		// State changes are collected synchronously via callback, but we need to ensure
		// all async operations complete
		await new Promise(resolve => {
			setTimeout(resolve, 100);
		});

		// Find states with LLM responses (iterations) during analyzing stage only
		const iterationStates = stateChanges.filter(
			state =>
				state.lastLLMResponse !== undefined &&
				state.currentStage === 'analyzing',
		);

		// Group by distinct iteration number to avoid counting intermediate "waiting" states
		const iterationsByNumber = new Map<
			number,
			(typeof iterationStates)[number]
		>();
		for (const state of iterationStates) {
			const iterationNumber = state.lastLLMResponse?.iteration;
			if (iterationNumber === undefined) {
				continue;
			}

			if (!iterationsByNumber.has(iterationNumber)) {
				iterationsByNumber.set(iterationNumber, state);
			}
		}

		const firstIteration = iterationsByNumber.get(1);
		const secondIteration = iterationsByNumber.get(2);

		// Verify that we received at least 2 distinct iterations
		t.truthy(firstIteration, 'Should have first iteration state');
		t.truthy(secondIteration, 'Should have second iteration state');

		t.is(
			firstIteration?.lastLLMResponse?.iteration,
			1,
			'First iteration should be 1',
		);
		t.is(
			secondIteration?.lastLLMResponse?.iteration,
			2,
			'Second iteration should be 2',
		);

		// Verify that currentIteration is updated
		t.is(
			firstIteration?.currentIteration,
			1,
			'currentIteration should be 1 for first iteration',
		);
		t.is(
			secondIteration?.currentIteration,
			2,
			'currentIteration should be 2 for second iteration',
		);

		// Verify page index doesn't change within same page
		t.is(
			firstIteration?.currentPageIndex,
			0,
			'Page index should be 0 for first page',
		);
		t.is(
			secondIteration?.currentPageIndex,
			0,
			'Page index should remain 0 within the same page',
		);

		await aiService.close();
		sandbox.restore();
	},
);

test.serial(
	'useAnalysis publishes an advisory gate result without changing the flow',
	async t => {
		// Interactive mode shows the verdict but never blocks on it. The value of
		// showing it is that a threshold reads the same here as it does in CI.
		const sandbox = sinon.createSandbox();
		const mockModel = new MockLanguageModelV4({
			async doGenerate() {
				return {
					content: [
						{
							type: 'tool-call' as const,
							toolCallId: 'call-complete',
							toolName: 'completePageAnalysis',
							input: '{}',
						},
					],
					finishReason: {unified: 'tool-calls' as const, raw: undefined},
					usage: {
						inputTokens: {
							total: 10,
							noCache: 10,
							cacheRead: undefined,
							cacheWrite: undefined,
						},
						outputTokens: {total: 20, text: 20, reasoning: undefined},
					},
					warnings: [],
				};
			},
		});

		const reportBuilder = new ReportBuilder({
			...fsPromises,
			writeFile: sandbox.stub().resolves(),
		});
		const aiService = new AIService(
			mockModel,
			createMockMCPClient(),
			reportBuilder,
		);

		const config: UxLintConfig = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Test page features'}],
			persona: 'Test persona',
			report: {output: './test-report.md'},
			thresholds: {maxCritical: 0},
		};

		const {result}: RenderHookResult<UseAnalysisResult, unknown> = renderHook(
			() =>
				useAnalysis(
					config,
					async () => ({aiService, reportBuilder}),
					stubPreflight,
				),
		);

		await act(async () => {
			await result.current.runAnalysis();
		});

		const {gateResult, currentStage} = result.current.analysisState;

		t.truthy(gateResult, 'the verdict must reach the UI state');
		t.deepEqual(gateResult?.evaluated, [
			{severity: 'critical', limit: 0, count: 0},
		]);
		t.is(
			currentStage,
			'complete',
			'the gate must not divert the interactive flow',
		);

		sandbox.restore();
	},
);

test.serial(
	'useAnalysis leaves the gate result unset when nothing is configured',
	async t => {
		const sandbox = sinon.createSandbox();
		const mockModel = new MockLanguageModelV4({
			async doGenerate() {
				return {
					content: [
						{
							type: 'tool-call' as const,
							toolCallId: 'call-complete',
							toolName: 'completePageAnalysis',
							input: '{}',
						},
					],
					finishReason: {unified: 'tool-calls' as const, raw: undefined},
					usage: {
						inputTokens: {
							total: 10,
							noCache: 10,
							cacheRead: undefined,
							cacheWrite: undefined,
						},
						outputTokens: {total: 20, text: 20, reasoning: undefined},
					},
					warnings: [],
				};
			},
		});

		const reportBuilder = new ReportBuilder({
			...fsPromises,
			writeFile: sandbox.stub().resolves(),
		});
		const aiService = new AIService(
			mockModel,
			createMockMCPClient(),
			reportBuilder,
		);

		const config: UxLintConfig = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Test page features'}],
			persona: 'Test persona',
			report: {output: './test-report.md'},
		};

		const {result}: RenderHookResult<UseAnalysisResult, unknown> = renderHook(
			() =>
				useAnalysis(
					config,
					async () => ({aiService, reportBuilder}),
					stubPreflight,
				),
		);

		await act(async () => {
			await result.current.runAnalysis();
		});

		t.deepEqual(
			result.current.analysisState.gateResult?.evaluated,
			[],
			'an unconfigured gate must render nothing',
		);

		sandbox.restore();
	},
);

test.serial(
	'a failing close is attempted once and settles as the published error state',
	async t => {
		// The CI runner guards its happy-path close so a rejected teardown can
		// never reach the fallback cleanup a second time. Interactive mode
		// must hold to the same contract: when close() rejects, the finally
		// below must not close the torn-down instance again and let whatever
		// that throws escape runAnalysis -- which its caller invokes as void.
		const sandbox = sinon.createSandbox();

		const mockModel = new MockLanguageModelV4({
			async doGenerate() {
				return {
					content: [
						{
							type: 'tool-call' as const,
							toolCallId: 'call-complete',
							toolName: 'completePageAnalysis',
							input: '{}',
						},
					],
					finishReason: {unified: 'tool-calls' as const, raw: undefined},
					usage: {
						inputTokens: {
							total: 10,
							noCache: 10,
							cacheRead: undefined,
							cacheWrite: undefined,
						},
						outputTokens: {total: 20, text: 20, reasoning: undefined},
					},
					warnings: [],
				};
			},
		});

		const workingClient = createMockMCPClient();
		let closeAttempts = 0;
		const failingCloseClient = {
			async tools() {
				return workingClient.tools();
			},
			async close() {
				closeAttempts++;
				throw new Error('transport teardown exploded');
			},
		} as unknown as MCPClient;

		const reportBuilder = new ReportBuilder({
			...fsPromises,
			writeFile: sandbox.stub().resolves(),
		});
		const aiService = new AIService(
			mockModel,
			failingCloseClient,
			reportBuilder,
		);

		const config: UxLintConfig = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Test page features'}],
			persona: 'Test persona',
			report: {output: './test-report.md'},
		};

		const {result}: RenderHookResult<UseAnalysisResult, unknown> = renderHook(
			() =>
				useAnalysis(
					config,
					async () => ({aiService, reportBuilder}),
					stubPreflight,
				),
		);

		await act(async () => {
			await t.notThrowsAsync(
				result.current.runAnalysis(),
				'a failing close must settle runAnalysis rather than reject out of cleanup',
			);
		});

		t.is(
			closeAttempts,
			1,
			'the torn-down service must not be closed a second time',
		);

		const {currentStage, error} = result.current.analysisState;
		t.is(currentStage, 'error');
		t.regex(
			error?.message ?? '',
			/transport teardown exploded/,
			'the close failure itself is what reaches the UI state',
		);

		sandbox.restore();
	},
);

/**
 * Signing in (011). A run whose configuration describes a sign-in carries a
 * session, and the hook establishes it once before any page is analysed,
 * publishing a stage of its own while it does. A run without one must be
 * left exactly as it was.
 */
const threePagesConfig: UxLintConfig = {
	mainPageUrl: 'https://example.com',
	subPageUrls: ['https://example.com/billing', 'https://example.com/team'],
	pages: [
		{url: 'https://example.com', features: 'Overview'},
		{url: 'https://example.com/billing', features: 'Invoices'},
		{url: 'https://example.com/team', features: 'Members'},
	],
	persona: 'Test persona',
	report: {output: './test-report.md'},
};

const signedInConfig: UxLintConfig = {
	...threePagesConfig,
	signIn: {
		url: 'https://example.com/login',
		steps: [{fill: 'Email', value: 'reviewer@example.com'}, {click: 'Sign in'}],
		signedIn: {name: 'Account menu', role: 'button'},
	},
};

/**
 * Run the hook to completion over a run that may carry a session.
 *
 * Page analysis is replaced by one that completes each page on the builder:
 * these tests are about what happens around the pages, and `order` records
 * the sign-in against each analysis so a test can assert which came first.
 */
const runWithSession = async (
	sandbox: sinon.SinonSandbox,
	config: UxLintConfig,
	options: {
		signedIn: boolean;
		failure?: SignInFailure;
		/** How a page's analysis ends, when it is not by completing */
		analysePage?: (
			page: UxLintConfig['pages'][number],
			builder: ReportBuilder,
		) => PageAnalysis;
	},
) => {
	const order: string[] = [];
	const states: AnalysisState[] = [];

	const reportBuilder = new ReportBuilder({
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	});
	const aiService = new AIService(
		new MockLanguageModelV4(),
		createMockMCPClient(),
		reportBuilder,
	);
	sandbox.stub(aiService, 'analyzePage').callsFake(async (_config, page) => {
		order.push(`analyse ${page.url}`);
		if (options.analysePage) {
			return options.analysePage(page, reportBuilder);
		}

		reportBuilder.initializePageAnalysis(page.url, page.features);
		return reportBuilder.completePageAnalysis();
	});
	const close = sandbox.spy(aiService, 'close');
	const saveReport = sandbox.spy(reportBuilder, 'saveReport');

	const establish = sandbox.stub().callsFake(async () => {
		order.push('establish');
		return options.failure
			? {kind: 'failed', failure: options.failure}
			: {kind: 'signed-in'};
	});
	const session = {
		establish,
		redact: (text: string) => text,
	} as unknown as SignedInSession;

	// Counted, because a run that must not start is one that called neither.
	const createRun = sandbox
		.stub()
		.callsFake(async () =>
			options.signedIn
				? {aiService, reportBuilder, session}
				: {aiService, reportBuilder},
		);
	const preflight = sandbox.stub().callsFake(stubPreflight);

	const {result}: RenderHookResult<UseAnalysisResult, unknown> = renderHook(
		() => useAnalysis(config, createRun, preflight),
	);

	// Subscribe to state changes - must be done before runAnalysis
	act(() => {
		result.current.onAnalysisStateChange(state => {
			states.push(state);
		});
	});

	await act(async () => {
		await result.current.runAnalysis();
	});

	return {
		result,
		reportBuilder,
		establish,
		order,
		states,
		close,
		saveReport,
		createRun,
		preflight,
	};
};

test.serial(
	'useAnalysis signs in once, before the first page is analysed',
	async t => {
		// One sign-in serves the whole run: the pages share a browser, so
		// signing in again per page would only repeat work already done.
		const sandbox = sinon.createSandbox();

		const {result, establish, order} = await runWithSession(
			sandbox,
			signedInConfig,
			{signedIn: true},
		);

		t.is(establish.callCount, 1, 'three pages must cost exactly one sign-in');
		t.deepEqual(order, [
			'establish',
			'analyse https://example.com',
			'analyse https://example.com/billing',
			'analyse https://example.com/team',
		]);
		t.is(result.current.analysisState.currentStage, 'complete');

		sandbox.restore();
	},
);

test.serial(
	'useAnalysis publishes a signing-in stage before the first page starts',
	async t => {
		// Signing in can take as long as a page does. Without a stage of its
		// own the UI would sit on whatever it showed last and look stalled.
		const sandbox = sinon.createSandbox();

		const {states} = await runWithSession(sandbox, signedInConfig, {
			signedIn: true,
		});

		const signingIn = states.findIndex(
			state => state.currentStage === 'signing-in',
		);
		const navigating = states.findIndex(
			state => state.currentStage === 'navigating',
		);

		t.not(signingIn, -1, 'a signing-in state must be published');
		t.is(states[signingIn]?.waitingMessage, 'Signing in…');
		t.not(navigating, -1, 'the pages must still be reached');
		t.true(
			signingIn < navigating,
			'signing in is shown before the first page, not during it',
		);

		sandbox.restore();
	},
);

test.serial(
	'useAnalysis records on the report that the run signed in',
	async t => {
		const sandbox = sinon.createSandbox();

		const {reportBuilder} = await runWithSession(sandbox, signedInConfig, {
			signedIn: true,
		});

		const {tooling} = reportBuilder.generateFinalReport().metadata;
		t.true(
			tooling.signedIn,
			'a reader of the report must be able to tell the pages were reviewed signed in',
		);
		// Signing in adds to the provenance; it must not replace what was there.
		t.is(tooling.browserServer, 'chrome-devtools-mcp');

		sandbox.restore();
	},
);

test.serial(
	'useAnalysis with no session never signs in or says that it did',
	async t => {
		// A configuration without `signIn` is every configuration that existed
		// before this feature. `signedIn: false` would claim a sign-in was
		// attempted and failed, so the key has to be absent, not falsy.
		const sandbox = sinon.createSandbox();

		const {result, reportBuilder, establish, order, states} =
			await runWithSession(sandbox, threePagesConfig, {signedIn: false});

		t.false(establish.called);
		t.deepEqual(order, [
			'analyse https://example.com',
			'analyse https://example.com/billing',
			'analyse https://example.com/team',
		]);
		t.false(
			states.some(state => state.currentStage === 'signing-in'),
			'a run that does not sign in must never show that it is',
		);
		t.false('signedIn' in reportBuilder.generateFinalReport().metadata.tooling);
		t.is(result.current.analysisState.currentStage, 'complete');

		sandbox.restore();
	},
);

/**
 * A failed sign-in (011, FR-009). No page is reviewed, but the run still
 * leaves a report: every configured page is recorded as failed with the
 * reason. The hook has nothing to emit, so the reason reaches the person
 * through the error state it already ends in.
 */
const rejected: SignInFailure = {
	kind: 'sign-absent',
	shown:
		'"Sign in" at https://example.com/login?error=1 — alert: "Invalid email or password"',
};

test.serial(
	'useAnalysis analyses no page after a failed sign-in, and saves a report with every page failed',
	async t => {
		const sandbox = sinon.createSandbox();
		const reason = describeSignInFailure(rejected, signedInConfig.signIn!);

		const {reportBuilder, order, saveReport} = await runWithSession(
			sandbox,
			signedInConfig,
			{signedIn: true, failure: rejected},
		);

		t.deepEqual(order, ['establish'], 'a page must not be reviewed signed out');
		t.true(
			saveReport.calledOnceWith('./test-report.md'),
			'the report is the only place the unreviewed pages are listed',
		);

		const report = reportBuilder.generateFinalReport();
		t.deepEqual(report.metadata.failedPages, [
			'https://example.com',
			'https://example.com/billing',
			'https://example.com/team',
		]);
		t.deepEqual(
			report.pages.map(page => page.error),
			[reason, reason, reason],
		);
		// False rather than absent: a sign-in was described, attempted, and
		// failed.
		t.false(report.metadata.tooling.signedIn);
		// The failure adds to the provenance; it must not replace what was there.
		t.is(report.metadata.tooling.browserServer, 'chrome-devtools-mcp');

		sandbox.restore();
	},
);

test.serial(
	'useAnalysis ends a failed sign-in in the error state, with the reason and the service closed',
	async t => {
		const sandbox = sinon.createSandbox();
		const reason = describeSignInFailure(rejected, signedInConfig.signIn!);

		const {result, states, close} = await runWithSession(
			sandbox,
			signedInConfig,
			{signedIn: true, failure: rejected},
		);

		const {currentStage, error} = result.current.analysisState;
		t.is(currentStage, 'error');
		t.true(
			error?.message.includes(reason),
			'the person watching is told why nothing was reviewed',
		);
		t.false(
			states.some(state => state.currentStage === 'navigating'),
			'no page may be shown as started',
		);
		t.true(close.calledOnce, 'the browser is released on this path too');

		sandbox.restore();
	},
);

/**
 * A missing secret (011, FR-010). Found out before anything is started, so a
 * person who forgot to set one is told at once and has spent nothing.
 */
const neverSetSecret = 'UXLINT_TEST_SECRET_THAT_IS_NEVER_SET';

test.serial(
	'useAnalysis stops before anything is started when a sign-in secret is not set',
	async t => {
		const sandbox = sinon.createSandbox();
		Reflect.deleteProperty(process.env, neverSetSecret);

		const {result, establish, order, saveReport, createRun, preflight} =
			await runWithSession(
				sandbox,
				{
					...signedInConfig,
					signIn: {
						...signedInConfig.signIn!,
						steps: [
							{fill: 'Email', value: 'reviewer@example.com'},
							{fill: 'Password', secret: neverSetSecret},
							{click: 'Sign in'},
						],
					},
				},
				{signedIn: true},
			);

		const {currentStage, error} = result.current.analysisState;
		t.is(currentStage, 'error');
		t.true(error?.message.includes(missingSecretText([neverSetSecret])));
		t.true(
			error?.message.includes(
				`Sign-in needs ${neverSetSecret}, which is not set in the environment`,
			),
		);
		t.false(
			preflight.called,
			'no browser is probed for a run that cannot sign in',
		);
		t.false(createRun.called, 'no run is assembled, so no model is reached');
		t.false(establish.called);
		t.deepEqual(order, []);
		t.false(saveReport.called, 'nothing was reviewed, so nothing is reported');

		sandbox.restore();
	},
);

/**
 * Releasing the browser (011, FR-022). The signed-in session lives only in the
 * browser's throwaway profile, which is discarded when the browser closes, so
 * a run that signed in must close it exactly once however it ends: not at all
 * leaves a signed-in browser behind, and twice closes a torn-down instance.
 *
 * A failed sign-in is the fourth ending, and "useAnalysis ends a failed
 * sign-in in the error state" above already holds it to one close.
 */
const billingUrl = 'https://example.com/billing';

const completePage = (
	page: UxLintConfig['pages'][number],
	builder: ReportBuilder,
): PageAnalysis => {
	builder.initializePageAnalysis(page.url, page.features);
	return builder.completePageAnalysis();
};

// The session admitted the first page and refused this one. `analyzePage`
// settles that as a failed page and returns; the run carries on.
const refusedAtBilling = (
	page: UxLintConfig['pages'][number],
	builder: ReportBuilder,
): PageAnalysis => {
	builder.initializePageAnalysis(page.url, page.features);
	return page.url === billingUrl
		? builder.failCurrentPage(
				`${billingUrl} was not reached signed in: the session was lost and signing in again failed`,
				page,
			)
		: builder.completePageAnalysis();
};

const throwingAtBilling = (
	page: UxLintConfig['pages'][number],
	builder: ReportBuilder,
): PageAnalysis => {
	if (page.url === billingUrl) {
		throw new Error('transport died mid-run');
	}

	return completePage(page, builder);
};

for (const [label, analysePage, expectedStage, pagesAttempted] of [
	['completes', completePage, 'complete', 3],
	['has a page refused part-way through', refusedAtBilling, 'complete', 3],
	['throws after signing in', throwingAtBilling, 'error', 2],
] as const) {
	test.serial(
		`useAnalysis closes the browser exactly once when a signed-in run ${label}`,
		async t => {
			const sandbox = sinon.createSandbox();

			const {result, establish, order, close} = await runWithSession(
				sandbox,
				signedInConfig,
				{signedIn: true, analysePage},
			);

			t.is(result.current.analysisState.currentStage, expectedStage);
			t.is(establish.callCount, 1, 'the run did sign in');
			t.is(
				order.length - 1,
				pagesAttempted,
				'the ending under test is the one that was reached',
			);
			t.is(
				close.callCount,
				1,
				'the signed-in browser is released once, not twice',
			);

			sandbox.restore();
		},
	);
}
