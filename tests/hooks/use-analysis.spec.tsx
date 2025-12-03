/**
 * Tests for useAnalysis hook
 * Verifies state updates for multiple pages and iterations
 */

import {act, renderHook, type RenderHookResult} from '@testing-library/react';
import test from 'ava';
import sinon from 'sinon';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {MockLanguageModelV2} from 'ai/test';
import {
	useAnalysis,
	type UseAnalysisResult,
} from '../../source/hooks/use-analysis.js';
import {AIService} from '../../source/services/ai-service.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import type {UxLintConfig} from '../../source/models/config.js';
import type {LLMResponseData} from '../../source/models/llm-response.js';
import type {AnalysisStage} from '../../source/models/analysis.js';

test('useAnalysis updates iteration number within same page', async t => {
	const sandbox = sinon.createSandbox();

	// Create mock MCP client
	const mockMCPClient: MCPClient = {
		tools: sandbox.stub().resolves({}),
		close: sandbox.stub().resolves(),
		listResources: sandbox.stub().resolves([]),
		readResource: sandbox.stub().resolves({}),
		listResourceTemplates: sandbox.stub().resolves([]),
		listPrompts: sandbox.stub().resolves([]),
		getPrompt: sandbox.stub().resolves({}),
	};

	// Create mock language model that requires multiple iterations
	let callCount = 0;
	const mockModel = new MockLanguageModelV2({
		async doGenerate() {
			callCount++;
			if (callCount === 1) {
				// First iteration: stop without tool calls (triggers reminder)
				return {
					content: [],
					finishReason: 'stop',
					usage: {inputTokens: 10, outputTokens: 20, totalTokens: 30},
					warnings: [],
				};
			}

			// Second iteration: complete the analysis
			return {
				content: [
					{
						type: 'tool-call',
						toolCallType: 'function',
						toolCallId: 'call-1',
						toolName: 'completePageAnalysis',
						args: '{}',
						input: '{}',
					},
				],
				finishReason: 'tool-calls',
				usage: {inputTokens: 10, outputTokens: 20, totalTokens: 30},
				warnings: [],
			};
		},
	});

	const reportBuilder = new ReportBuilder();
	const aiService = new AIService(mockModel, mockMCPClient, reportBuilder);

	// Create mock getAIService function for dependency injection
	const mockGetAIService = async () => aiService;

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
		() => useAnalysis(config, mockGetAIService),
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
			state.lastLLMResponse !== undefined && state.currentStage === 'analyzing',
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
});
