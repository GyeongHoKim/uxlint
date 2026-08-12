/**
 * Mock-based tests for AIService LLM response callback and ReportBuilder
 * Uses MockLanguageModelV4 from ai/test as required by Constitution II (Test-First Development)
 */

import {promises as fsPromises} from 'node:fs';
import {MockLanguageModelV4} from 'ai/test';
import test from 'ava';
import sinon from 'sinon';
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
		if (llmResponse) {
			t.truthy(llmResponse.iteration);
			t.truthy(llmResponse.timestamp);
		}
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
	t.is(pageAnalysis.status, 'complete');

	// Set persona for report generation
	reportBuilder.setPersona(config.persona);

	// Generate final report
	const report = reportBuilder.generateFinalReport();

	// Verify report is not empty and contains expected data
	t.truthy(report);
	t.is(report.metadata.persona, config.persona);
	t.is(report.pages.length, 1);
	t.is(report.pages[0]?.pageUrl, 'https://example.com');
	t.is(report.pages[0]?.status, 'complete');
	t.truthy(report.summary);
	t.true(Array.isArray(report.prioritizedFindings));
	t.is(report.metadata.analyzedPages.length, 1);
	t.is(report.metadata.analyzedPages[0], 'https://example.com');

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

	// Create mock language model that requires multiple iterations
	// First iteration: returns 'stop' (no tool calls) - should trigger reminder
	// Second iteration: returns 'tool-calls' with completePageAnalysis
	let callCount = 0;
	const mockModel = new MockLanguageModelV4({
		async doGenerate() {
			callCount++;
			if (callCount === 1) {
				// First iteration: stop without tool calls (triggers reminder)
				return {
					finishReason: {unified: 'stop', raw: undefined},
					usage: {
						inputTokens: {
							total: 10,
							noCache: 10,
							cacheRead: undefined,
							cacheWrite: undefined,
						},
						outputTokens: {total: 20, text: 20, reasoning: undefined},
					},
					content: [],
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
		if (llmResponse) {
			receivedIterations.push(llmResponse.iteration);
			receivedLLMResponses.push(llmResponse);
		}
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

	const addFindingCall = receivedLLMResponses
		.flatMap(response => response.toolCalls ?? [])
		.find(toolCall => toolCall.toolName === 'addFinding');

	t.truthy(addFindingCall, 'Should report the addFinding tool call to the UI');
	t.deepEqual(
		addFindingCall?.args,
		finding,
		'Tool call arguments should reach the UI instead of an empty object',
	);

	await aiService.close();
	sandbox.restore();
});
