/**
 * Tests for useAnalysis hook
 * Verifies state updates for multiple pages and iterations
 */

import {promises as fsPromises} from 'node:fs';
import {act, renderHook, type RenderHookResult} from '@testing-library/react';
import {MockLanguageModelV4} from 'ai/test';
import test from 'ava';
import sinon from 'sinon';
import {
	useAnalysis,
	type UseAnalysisResult,
} from '../../source/hooks/use-analysis.js';
import type {AnalysisStage} from '../../source/models/analysis.js';
import type {UxLintConfig} from '../../source/models/config.js';
import type {LLMResponseData} from '../../source/models/llm-response.js';
import {AIService} from '../../source/services/ai-service.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
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

		// Create mock getAIService function for dependency injection
		const mockGetAIService = async (_config: UxLintConfig) => aiService;

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
			() => useAnalysis(config, mockGetAIService, reportBuilder, stubPreflight),
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
					async () => aiService,
					reportBuilder,
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
					async () => aiService,
					reportBuilder,
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
