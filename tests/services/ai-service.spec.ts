/**
 * Mock-based tests for AIService LLM response callback and ReportBuilder
 * Uses MockLanguageModelV4 from ai/test as required by Constitution II (Test-First Development)
 */

import {Buffer} from 'node:buffer';
import {promises as fsPromises} from 'node:fs';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {tool} from 'ai';
import {MockLanguageModelV4} from 'ai/test';
import test from 'ava';
import sinon from 'sinon';
import {z} from 'zod/v4';
import type {UxFinding} from '../../source/models/analysis.js';
import type {UxLintConfig} from '../../source/models/config.js';
import type {LLMResponseData} from '../../source/models/llm-response.js';
import {
	AIService,
	type AnalysisProgressCallback,
} from '../../source/services/ai-service.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import {createMockMCPClient} from '../utils.js';

test('onProgress callback type accepts llmResponse parameter', t => {
	const onProgress: AnalysisProgressCallback = (
		_stage,
		_message,
		llmResponse,
	) => {
		// Verify callback accepts llmResponse parameter
		if (!llmResponse) {
			return;
		}

		t.truthy(llmResponse.iteration);
		t.truthy(llmResponse.timestamp);
	};

	t.truthy(onProgress);
	t.is(typeof onProgress, 'function');
});

test('llmResponse contains text, toolCalls, iteration, timestamp', t => {
	const llmResponse: LLMResponseData = {
		text: 'Test response',
		toolCalls: [
			{
				toolName: 'test_tool',
				args: {param: 'value'},
			},
		],
		finishReason: 'stop',
		iteration: 1,
		timestamp: Date.now(),
	};

	t.is(llmResponse.text, 'Test response');
	t.truthy(llmResponse.toolCalls);
	t.is(llmResponse.toolCalls?.length, 1);
	t.is(llmResponse.toolCalls?.[0]?.toolName, 'test_tool');
	t.is(llmResponse.finishReason, 'stop');
	t.is(llmResponse.iteration, 1);
	t.truthy(llmResponse.timestamp);
});

test('generateFinalReport creates valid report when page analysis is completed', t => {
	const sandbox = sinon.createSandbox();
	const mockFsAsync = {
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	};
	const reportBuilder = new ReportBuilder(mockFsAsync);
	const pageUrl = 'https://example.com';
	const features = 'Test page features';
	const persona = 'Test persona';

	// Initialize and complete a page analysis (simulating LLM completing analysis)
	reportBuilder.initializePageAnalysis(pageUrl, features);

	// Add a finding (simulating LLM finding an issue)
	const finding: UxFinding = {
		severity: 'high',
		category: 'Accessibility',
		description: 'Missing alt text on image',
		personaRelevance: ['Visual impairment'],
		recommendation: 'Add descriptive alt text',
		pageUrl,
	};
	reportBuilder.addFinding(finding);

	// Complete the page analysis (simulating LLM calling completePageAnalysis)
	reportBuilder.completePageAnalysis();

	// Set persona for report generation
	reportBuilder.setPersona(persona);

	// Generate final report
	const report = reportBuilder.generateFinalReport();

	// Verify report is not empty and contains expected data
	t.truthy(report);
	t.is(report.metadata.persona, persona);
	t.is(report.pages.length, 1);
	t.is(report.pages[0]?.pageUrl, pageUrl);
	t.is(report.pages[0]?.status, 'complete');
	t.is(report.pages[0]?.findings.length, 1);
	t.is(report.pages[0]?.findings[0]?.severity, 'high');
	t.truthy(report.summary);
	t.true(Array.isArray(report.prioritizedFindings));
	t.is(report.prioritizedFindings.length, 1);
	t.is(report.metadata.totalFindings, 1);
	t.is(report.metadata.analyzedPages.length, 1);
	t.is(report.metadata.analyzedPages[0], pageUrl);

	sandbox.restore();
});

test('generateFinalReport creates empty report when no page analysis is completed', t => {
	const sandbox = sinon.createSandbox();
	const mockFsAsync = {
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	};
	const reportBuilder = new ReportBuilder(mockFsAsync);
	const persona = 'Test persona';

	// Set persona without completing any page analysis
	reportBuilder.setPersona(persona);

	// Generate final report
	const report = reportBuilder.generateFinalReport();

	// Verify report structure exists but is empty
	t.truthy(report);
	t.is(report.metadata.persona, persona);
	t.is(report.pages.length, 0);
	t.is(report.metadata.totalFindings, 0);
	t.is(report.metadata.analyzedPages.length, 0);
	t.truthy(report.summary);
	t.true(Array.isArray(report.prioritizedFindings));
	t.is(report.prioritizedFindings.length, 0);

	sandbox.restore();
});

test('AIService generates valid report when LLM completes page analysis using MockLanguageModelV4', async t => {
	const sandbox = sinon.createSandbox();

	// Create mock MCP client
	const mockMCPClient = createMockMCPClient();

	// Create mock language model using MockLanguageModelV4 (Constitution requirement)
	// Reference: https://ai-sdk.dev/docs/ai-sdk-core/testing#testing
	const mockModel = new MockLanguageModelV4({
		doGenerate: async () => ({
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
			content: [
				{
					type: 'tool-call',
					toolCallId: 'call-1',
					toolName: 'completePageAnalysis',
					input: '{}',
				},
			],
			warnings: [],
		}),
	});

	const mockFsAsync = {
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	};
	const reportBuilder = new ReportBuilder(mockFsAsync);
	const aiService = new AIService(mockModel, mockMCPClient, reportBuilder);

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

	const page = config.pages[0];

	if (!page) {
		t.fail('Page is undefined');
		return;
	}

	// Analyze page - this should trigger completePageAnalysis tool call
	const pageAnalysis = await aiService.analyzePage(config, page);

	// Verify page analysis was completed
	t.is(pageAnalysis.pageUrl, 'https://example.com');
	// `partial`, not `complete`: this scripted model calls
	// completePageAnalysis without ever capturing the page, and a judgement
	// resting on no page structure is what `partial` now records.
	t.is(pageAnalysis.status, 'partial');

	// Deliberately no setPersona call: analyzePage owns that now. Calling it
	// from the test is what hid the fact that the production success path
	// never set it at all.
	const report = reportBuilder.generateFinalReport();

	// Verify report is not empty and contains expected data
	t.truthy(report);
	t.is(report.metadata.persona, config.persona);
	t.is(report.pages.length, 1);
	t.is(report.pages[0]?.pageUrl, 'https://example.com');
	// Partial for the same reason as above: nothing captured the page.
	t.is(report.pages[0]?.status, 'partial');
	t.truthy(report.summary);
	t.true(Array.isArray(report.prioritizedFindings));
	t.deepEqual(report.metadata.partialPages, ['https://example.com']);
	t.is(report.metadata.analyzedPages.length, 0);

	await aiService.close();
	sandbox.restore();
});

test('AIService calls onProgress with increasing iteration numbers for multiple iterations', async t => {
	const sandbox = sinon.createSandbox();

	// Create mock MCP client
	const mockMCPClient = createMockMCPClient();

	// Track iteration numbers from onProgress callbacks
	const receivedIterations: number[] = [];
	const receivedLLMResponses: LLMResponseData[] = [];

	// Create mock language model that requires multiple iterations.
	// First iteration navigates, second completes. It used to stop without a
	// tool call on the first pass, relying on the reminder message to keep the
	// loop alive; a model that stops now simply ends the page, so the loop is
	// driven by tool calls as a real run is.
	let callCount = 0;
	const mockModel = new MockLanguageModelV4({
		async doGenerate() {
			callCount++;
			if (callCount === 1) {
				// First iteration: navigate, which keeps the analysis going.
				return {
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
					content: [
						{
							type: 'tool-call',
							toolCallId: 'call-nav',
							toolName: 'navigate_page',
							input: '{"url":"https://example.com"}',
						},
					],
					warnings: [],
				};
			}

			// Second iteration: complete the analysis
			return {
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
				content: [
					{
						type: 'tool-call',
						toolCallId: 'call-1',
						toolName: 'completePageAnalysis',
						input: '{}',
					},
				],
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

	const page = config.pages[0];

	if (!page) {
		t.fail('Page is undefined');
		return;
	}

	// Track onProgress callbacks
	const onProgress: AnalysisProgressCallback = (
		_stage,
		_message,
		llmResponse,
	) => {
		if (!llmResponse) {
			return;
		}

		receivedIterations.push(llmResponse.iteration);
		receivedLLMResponses.push(llmResponse);
	};

	// Initialize page analysis before calling analyzePage
	reportBuilder.initializePageAnalysis(page.url, page.features);

	// Analyze page with progress callback
	await aiService.analyzePage(config, page, onProgress);

	// Verify that onProgress was called with increasing iteration numbers
	t.true(
		receivedIterations.length >= 2,
		'Should receive at least 2 iterations',
	);
	t.is(receivedIterations[0], 1, 'First iteration should be 1');
	t.is(receivedIterations[1], 2, 'Second iteration should be 2');

	// Verify that each LLM response has correct iteration number
	for (const [index, response] of receivedLLMResponses.entries()) {
		t.is(
			response?.iteration,
			index + 1,
			`LLM response ${index} should have iteration ${index + 1}`,
		);
	}

	await aiService.close();
	sandbox.restore();
});

test('AIService surfaces tool call arguments in the LLM response sent to the UI', async t => {
	const sandbox = sinon.createSandbox();
	const mockMCPClient = createMockMCPClient();
	const receivedLLMResponses: LLMResponseData[] = [];

	// Regression guard: the SDK renamed the tool-call payload from `args` to
	// `input` in v5, and this service kept reading `args`. Because the result
	// type was declared structurally, the compiler never caught it and every
	// tool call rendered with empty arguments in the UI.
	const finding = {
		severity: 'high' as const,
		title: 'Primary CTA is not discoverable',
		description: 'The call to action sits below the fold.',
		recommendation: 'Move the CTA above the fold.',
		affectedElements: ['button.cta'],
	};

	let callCount = 0;
	const mockModel = new MockLanguageModelV4({
		async doGenerate() {
			callCount++;
			const usage = {
				inputTokens: {
					total: 10,
					noCache: 10,
					cacheRead: undefined,
					cacheWrite: undefined,
				},
				outputTokens: {total: 20, text: 20, reasoning: undefined},
			};

			if (callCount === 1) {
				return {
					finishReason: {unified: 'tool-calls' as const, raw: undefined},
					usage,
					content: [
						{
							type: 'tool-call' as const,
							toolCallId: 'call-finding',
							toolName: 'addFinding',
							input: JSON.stringify(finding),
						},
					],
					warnings: [],
				};
			}

			return {
				finishReason: {unified: 'tool-calls' as const, raw: undefined},
				usage,
				content: [
					{
						type: 'tool-call' as const,
						toolCallId: 'call-complete',
						toolName: 'completePageAnalysis',
						input: '{}',
					},
				],
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

	const config: UxLintConfig = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [{url: 'https://example.com', features: 'Test page features'}],
		persona: 'Test persona',
		report: {output: './test-report.md'},
	};

	const page = config.pages[0];

	if (!page) {
		t.fail('Page is undefined');
		return;
	}

	const onProgress: AnalysisProgressCallback = (
		_stage,
		_message,
		llmResponse,
	) => {
		if (llmResponse) {
			receivedLLMResponses.push(llmResponse);
		}
	};

	reportBuilder.initializePageAnalysis(page.url, page.features);
	await aiService.analyzePage(config, page, onProgress);

	const findingToolCall = receivedLLMResponses
		.flatMap(response => response.toolCalls ?? [])
		.find(toolCall => toolCall.toolName === 'addFinding');

	t.truthy(findingToolCall, 'Should report the addFinding tool call to the UI');
	t.deepEqual(
		findingToolCall?.args,
		finding,
		'Tool call arguments should reach the UI instead of an empty object',
	);

	await aiService.close();
	sandbox.restore();
});

const mockUsage = {
	inputTokens: {
		total: 10,
		noCache: 10,
		cacheRead: undefined,
		cacheWrite: undefined,
	},
	outputTokens: {total: 20, text: 20, reasoning: undefined},
} as const;

/** A step that calls one report tool with the given JSON input. */
const toolCallStep = (toolName: string, input = '{}') => ({
	finishReason: {unified: 'tool-calls' as const, raw: undefined},
	usage: mockUsage,
	content: [
		{
			type: 'tool-call' as const,
			toolCallId: `call-${toolName}`,
			toolName,
			input,
		},
	],
	warnings: [],
});

/** A step that stops with plain text and no tool calls. */
const stopStep = () => ({
	finishReason: {unified: 'stop' as const, raw: undefined},
	usage: mockUsage,
	content: [],
	warnings: [],
});

const multiPageConfig = (urls: string[]): UxLintConfig => ({
	mainPageUrl: urls[0] ?? 'https://example.com',
	subPageUrls: urls.slice(1),
	pages: urls.map(url => ({url, features: `Features for ${url}`})),
	persona: 'Test persona',
	report: {output: './test-report.md'},
});

const createBuilder = (sandbox: sinon.SinonSandbox) =>
	new ReportBuilder({
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	});

test('AIService keeps earlier page findings when a later page throws', async t => {
	const sandbox = sinon.createSandbox();
	const config = multiPageConfig([
		'https://example.com/one',
		'https://example.com/two',
		'https://example.com/three',
	]);

	// The failing page is the second of three, so the assertion can tell
	// "prior work survived" apart from "nothing ran".
	let pageIndex = 0;
	let stepInPage = 0;
	const mockModel = new MockLanguageModelV4({
		async doGenerate() {
			if (pageIndex === 1) {
				throw new Error('navigation timed out');
			}

			// Walks the sequence the analysis now enforces: a finding is only
			// reachable once the page has been loaded and captured.
			stepInPage++;
			if (stepInPage === 1) {
				return toolCallStep('navigate_page', '{"url":"https://example.com"}');
			}

			if (stepInPage === 2) {
				return toolCallStep('take_snapshot', '{}');
			}

			return toolCallStep(
				'addFinding',
				JSON.stringify({
					severity: 'high',
					category: 'Accessibility',
					description: `Issue on page ${pageIndex}`,
					personaRelevance: ['Test persona'],
					recommendation: 'Fix it',
					pageUrl: config.pages[pageIndex]?.url ?? '',
				}),
			);
		},
	});

	const reportBuilder = createBuilder(sandbox);
	const aiService = new AIService(
		mockModel,
		createMockMCPClient(),
		reportBuilder,
	);

	const results = [];
	for (const [index, page] of config.pages.entries()) {
		pageIndex = index;
		stepInPage = 0;
		// eslint-disable-next-line no-await-in-loop -- pages are analysed in order
		results.push(await aiService.analyzePage(config, page));
	}

	t.is(results[1]?.status, 'failed');

	const report = reportBuilder.generateFinalReport();
	const recordedUrls = new Set(report.pages.map(page => page.pageUrl));

	t.true(
		recordedUrls.has('https://example.com/one'),
		'a mid-run failure must not erase the pages already analysed',
	);
	t.true(recordedUrls.has('https://example.com/three'));
	t.true(
		report.metadata.totalFindings > 0,
		'findings collected before the failure must survive',
	);

	sandbox.restore();
});

test('AIService records a failed page in the report metadata', async t => {
	const sandbox = sinon.createSandbox();
	const config = multiPageConfig(['https://example.com/broken']);
	const mockModel = new MockLanguageModelV4({
		async doGenerate() {
			throw new Error('navigation timed out');
		},
	});

	const reportBuilder = createBuilder(sandbox);
	const aiService = new AIService(
		mockModel,
		createMockMCPClient(),
		reportBuilder,
	);

	const page = config.pages[0]!;
	const analysis = await aiService.analyzePage(config, page);

	t.is(analysis.status, 'failed');
	t.is(analysis.error, 'navigation timed out');

	const report = reportBuilder.generateFinalReport();
	t.deepEqual(
		report.metadata.failedPages,
		['https://example.com/broken'],
		'a failed page has to leave a trace in the report',
	);

	sandbox.restore();
});

test('AIService marks an iteration-exhausted analysis as partial', async t => {
	const sandbox = sinon.createSandbox();
	const config = multiPageConfig(['https://example.com/loops']);

	// Never calls completePageAnalysis, so the loop runs to
	// MAX_AGENT_ITERATIONS and falls through to the terminal path.
	const mockModel = new MockLanguageModelV4({
		async doGenerate() {
			return stopStep();
		},
	});

	const reportBuilder = createBuilder(sandbox);
	const aiService = new AIService(
		mockModel,
		createMockMCPClient(),
		reportBuilder,
	);

	const page = config.pages[0];

	if (!page) {
		t.fail('Page is undefined');
		return;
	}

	const analysis = await aiService.analyzePage(config, page);

	t.is(
		analysis.status,
		'partial',
		'a truncated analysis must not be indistinguishable from a finished one',
	);

	const report = reportBuilder.generateFinalReport();
	t.deepEqual(report.metadata.partialPages, ['https://example.com/loops']);
	t.deepEqual(report.metadata.analyzedPages, []);

	sandbox.restore();
});

test('AIService sets the report persona without the caller doing it', async t => {
	const sandbox = sinon.createSandbox();
	const config = multiPageConfig(['https://example.com/one']);
	const mockModel = new MockLanguageModelV4({
		async doGenerate() {
			return toolCallStep('completePageAnalysis');
		},
	});

	const reportBuilder = createBuilder(sandbox);
	const aiService = new AIService(
		mockModel,
		createMockMCPClient(),
		reportBuilder,
	);

	const page = config.pages[0];

	if (!page) {
		t.fail('Page is undefined');
		return;
	}

	await aiService.analyzePage(config, page);

	const report = reportBuilder.generateFinalReport();
	t.is(
		report.metadata.persona,
		'Test persona',
		'persona must be recorded on the success path, not only when a page fails',
	);

	sandbox.restore();
});

test('AIService refuses to analyse after close instead of using a dead client', async t => {
	const sandbox = sinon.createSandbox();
	const config = multiPageConfig(['https://example.com/one']);
	const mockModel = new MockLanguageModelV4({
		async doGenerate() {
			return toolCallStep('completePageAnalysis');
		},
	});

	const reportBuilder = createBuilder(sandbox);
	const aiService = new AIService(
		mockModel,
		createMockMCPClient(),
		reportBuilder,
	);

	const page = config.pages[0];

	if (!page) {
		t.fail('Page is undefined');
		return;
	}

	await aiService.close();
	const analysis = await aiService.analyzePage(config, page);

	t.is(analysis.status, 'failed');
	t.regex(
		analysis.error ?? '',
		/closed/i,
		'the error should name the real cause instead of surfacing an MCP failure',
	);

	sandbox.restore();
});

test('a browser lost mid-run fails only the affected page (FR-016)', async t => {
	const builder = new ReportBuilder({
		...fsPromises,
		writeFile: sinon.stub().resolves(),
	});

	// The first page completes; the second loses the browser. A browser that
	// dies partway through is a page failure, not a run failure -- the pages
	// already analysed are real observations and must survive.
	let pagesSeen = 0;
	const dyingClient = {
		async tools() {
			pagesSeen++;
			if (pagesSeen > 1) {
				throw new Error('Protocol error (Target.closeTarget): Target closed');
			}

			return {
				navigate_page: tool({
					description: 'Navigate to a URL',
					inputSchema: z.object({url: z.string()}),
					async execute() {
						return 'Successfully navigated.';
					},
				}),
				take_snapshot: tool({
					description: 'Capture the accessibility tree',
					inputSchema: z.object({}),
					async execute() {
						return 'button "Sign up"';
					},
				}),
			};
		},
		async close() {
			// No-op
		},
	} as unknown as MCPClient;

	const completing = new MockLanguageModelV4({
		doGenerate: async () => ({
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
			content: [
				{
					type: 'tool-call',
					toolCallId: 'call-1',
					toolName: 'completePageAnalysis',
					input: '{}',
				},
			],
			warnings: [],
		}),
	});

	const service = new AIService(completing, dyingClient, builder);
	const config: UxLintConfig = {
		mainPageUrl: 'https://example.com',
		subPageUrls: ['https://example.com/second'],
		pages: [
			{url: 'https://example.com', features: 'first'},
			{url: 'https://example.com/second', features: 'second'},
		],
		persona: 'Test persona',
		report: {output: './report.md'},
	};

	const first = await service.analyzePage(config, config.pages[0]!);
	const second = await service.analyzePage(config, config.pages[1]!);

	// `partial` rather than `complete`: this scripted model never captures the
	// page. What this test is about is that the first page survives the second
	// page's browser loss, which it does either way.
	t.is(first.status, 'partial');
	t.is(second.status, 'failed');
	t.true(second.error?.includes('Target closed'));

	const report = builder.generateFinalReport();
	t.deepEqual(
		report.metadata.partialPages,
		['https://example.com'],
		'the page analysed before the browser died must still be in the report',
	);
	t.deepEqual(report.metadata.failedPages, ['https://example.com/second']);
});

/**
 * Drive one page analysis with a scripted sequence of tool calls.
 *
 * The browser server is stubbed so the capture result is known exactly, which
 * is what lets byte-identity be asserted rather than approximated.
 */
const analyseWithCapture = async (options: {
	captureOutput?: string;
	captureThrows?: boolean;
	captureTwice?: boolean;
	skipCapture?: boolean;
}) => {
	const builder = new ReportBuilder({
		...fsPromises,
		writeFile: sinon.stub().resolves(),
	});
	let captureCount = 0;

	const mcpClient = {
		async tools() {
			return {
				navigate_page: tool({
					description: 'Navigate to a URL',
					inputSchema: z.object({url: z.string()}),
					async execute() {
						return 'Successfully navigated.';
					},
				}),
				take_snapshot: tool({
					description: 'Capture the accessibility tree',
					inputSchema: z.object({}),
					async execute() {
						if (options.captureThrows) {
							throw new Error('the page was not ready');
						}

						captureCount++;
						// Distinct per execution, so a test about replacement can
						// tell a replaced snapshot from an unchanged one.
						return options.captureTwice
							? `capture ${captureCount}`
							: (options.captureOutput ?? 'button "Sign up"');
					},
				}),
			};
		},
		async close() {
			// Nothing to tear down.
		},
	} as unknown as MCPClient;

	const script = [
		'navigate_page',
		...(options.skipCapture ? [] : ['take_snapshot']),
		'completePageAnalysis',
	];
	let call = 0;

	const model = new MockLanguageModelV4({
		async doGenerate() {
			const toolName = script[Math.min(call, script.length - 1)]!;
			call++;

			// Two captures in a single step. Once a capture succeeds the stage
			// moves on and the tool is no longer offered, so replacement is only
			// reachable within one response -- which a model can produce.
			const repeat = options.captureTwice && toolName === 'take_snapshot';

			return {
				finishReason: {unified: 'tool-calls', raw: undefined},
				usage: {
					inputTokens: {
						total: 1,
						noCache: 1,
						cacheRead: undefined,
						cacheWrite: undefined,
					},
					outputTokens: {total: 1, text: 1, reasoning: undefined},
				},
				content: [
					{
						type: 'tool-call',
						toolCallId: `c${call}`,
						toolName,
						input:
							toolName === 'navigate_page'
								? '{"url":"https://example.com"}'
								: '{}',
					},
					...(repeat
						? [
								{
									type: 'tool-call' as const,
									toolCallId: `c${call}b`,
									toolName,
									input: '{}',
								},
							]
						: []),
				],
				warnings: [],
			};
		},
	});

	const config: UxLintConfig = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [{url: 'https://example.com', features: 'Landing'}],
		persona: 'Test persona',
		report: {output: './report.md'},
	};

	const service = new AIService(model, mcpClient, builder);
	const analysis = await service.analyzePage(config, config.pages[0]!);

	return {analysis, builder};
};

test('the recorded snapshot is byte-identical to the capture result', async t => {
	const captureOutput =
		'link "Home" [ref=e1]\n  text "Welcome, 안녕하세요 \\"quoted\\""';

	const {analysis} = await analyseWithCapture({captureOutput});

	// Recorded by the system from the tool result, so there is no re-encoding
	// step in which a quote, a newline or a non-ASCII character could shift.
	t.is(analysis.snapshot, captureOutput);
});

test('a very large capture is recorded whole (SC-001)', async t => {
	const captureOutput = 'link "Product" [ref=e0]\n'.repeat(4500);
	t.true(
		Buffer.byteLength(captureOutput) > 100_000,
		'fixture must exceed 100 KB',
	);

	const {analysis} = await analyseWithCapture({captureOutput});

	// Size must not silently truncate the record: a shortened snapshot reads
	// as a faithful one.
	t.is(analysis.snapshot, captureOutput);
});

test('a failed capture is not recorded as a snapshot', async t => {
	const {analysis} = await analyseWithCapture({captureThrows: true});

	t.is(analysis.snapshot, '', 'an error is not a page structure');
});

test('a second capture replaces the first rather than accumulating', async t => {
	const {analysis} = await analyseWithCapture({captureTwice: true});

	// The captures return different text, so this can distinguish a replaced
	// snapshot from one that never changed. It previously could not: both
	// executions returned the same string, and the second never ran at all.
	t.is(analysis.snapshot, 'capture 2');
	t.false(
		analysis.snapshot.includes('capture 1'),
		'copies must not accumulate',
	);
});

test('a page that was never captured does not read as fully analysed', async t => {
	const {analysis} = await analyseWithCapture({skipCapture: true});

	t.is(analysis.snapshot, '');
	t.not(
		analysis.status,
		'complete',
		'a page whose structure was never read is not a completed analysis',
	);
});

test('a capture and a completion in one step still record the capture first', async t => {
	// Both tools are offered at the `loaded` stage, so a model can call them
	// together. completePageAnalysis decides complete-versus-partial by reading
	// the snapshot that recordCapture writes from the sibling call's
	// onToolExecutionEnd firing. If the SDK resolved same-step tool calls in an
	// order that let completion read first, a fully captured page would be
	// recorded as partial -- so the ordering is asserted rather than assumed.
	const builder = new ReportBuilder({
		...fsPromises,
		writeFile: sinon.stub().resolves(),
	});

	const mcpClient = {
		async tools() {
			return {
				navigate_page: tool({
					description: 'Navigate to a URL',
					inputSchema: z.object({url: z.string()}),
					async execute() {
						return 'Successfully navigated.';
					},
				}),
				take_snapshot: tool({
					description: 'Capture the accessibility tree',
					inputSchema: z.object({}),
					async execute() {
						return 'button "Sign up"';
					},
				}),
			};
		},
		async close() {
			// Nothing to tear down.
		},
	} as unknown as MCPClient;

	let call = 0;
	const model = new MockLanguageModelV4({
		async doGenerate() {
			call++;
			const usage = {
				inputTokens: {
					total: 1,
					noCache: 1,
					cacheRead: undefined,
					cacheWrite: undefined,
				},
				outputTokens: {total: 1, text: 1, reasoning: undefined},
			};

			if (call === 1) {
				return {
					finishReason: {unified: 'tool-calls', raw: undefined},
					usage,
					content: [
						{
							type: 'tool-call',
							toolCallId: 'nav',
							toolName: 'navigate_page',
							input: '{"url":"https://example.com"}',
						},
					],
					warnings: [],
				};
			}

			// Capture and completion together, in one response.
			return {
				finishReason: {unified: 'tool-calls', raw: undefined},
				usage,
				content: [
					{
						type: 'tool-call',
						toolCallId: 'cap',
						toolName: 'take_snapshot',
						input: '{}',
					},
					{
						type: 'tool-call',
						toolCallId: 'done',
						toolName: 'completePageAnalysis',
						input: '{}',
					},
				],
				warnings: [],
			};
		},
	});

	const config: UxLintConfig = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [{url: 'https://example.com', features: 'Landing'}],
		persona: 'Test persona',
		report: {output: './report.md'},
	};

	const service = new AIService(model, mcpClient, builder);
	const analysis = await service.analyzePage(config, config.pages[0]!);

	t.is(analysis.snapshot, 'button "Sign up"');
	t.is(
		analysis.status,
		'complete',
		'a page captured in the same step must not be recorded as partial',
	);
});
