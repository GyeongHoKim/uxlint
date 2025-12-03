/**
 * Mock-based tests for AIService LLM response callback and ReportBuilder
 * Uses MockLanguageModelV2 from ai/test as required by Constitution II (Test-First Development)
 */

import {MockLanguageModelV2} from 'ai/test';
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
	const reportBuilder = new ReportBuilder();
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
});

test('generateFinalReport creates empty report when no page analysis is completed', t => {
	const reportBuilder = new ReportBuilder();
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
});

test('AIService generates valid report when LLM completes page analysis using MockLanguageModelV2', async t => {
	const sandbox = sinon.createSandbox();

	// Create mock MCP client
	const mockMCPClient = createMockMCPClient();

	// Create mock language model using MockLanguageModelV2 (Constitution requirement)
	// Reference: https://ai-sdk.dev/docs/ai-sdk-core/testing#testing
	const mockModel = new MockLanguageModelV2({
		doGenerate: async () => ({
			finishReason: 'tool-calls',
			usage: {inputTokens: 10, outputTokens: 20, totalTokens: 30},
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
			warnings: [],
		}),
	});

	const reportBuilder = new ReportBuilder();
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
	const mockModel = new MockLanguageModelV2({
		async doGenerate() {
			callCount++;
			if (callCount === 1) {
				// First iteration: stop without tool calls (triggers reminder)
				return {
					finishReason: 'stop',
					usage: {inputTokens: 10, outputTokens: 20, totalTokens: 30},
					content: [],
					warnings: [],
				};
			}

			// Second iteration: complete the analysis
			return {
				finishReason: 'tool-calls',
				usage: {inputTokens: 10, outputTokens: 20, totalTokens: 30},
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
				warnings: [],
			};
		},
	});

	const reportBuilder = new ReportBuilder();
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
