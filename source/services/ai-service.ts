/**
 * AI Service
 * Handles AI-powered UX analysis using MCP tools and Manual Agent Loop pattern
 * Implements singleton pattern for global instance management
 *
 * @packageDocumentation
 */

import {type experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {type LanguageModelV4} from '@ai-sdk/provider';
import {generateText, tool, type ModelMessage} from 'ai';
import {z} from 'zod/v4';
import {getRandomWaitingMessage} from '../constants/waiting-messages.js';
import {logger} from '../infrastructure/logger.js';
import type {AnalysisStage, PageAnalysis} from '../models/analysis.js';
import type {Page, UxLintConfig} from '../models/config.js';
import type {LLMResponseData} from '../models/llm-response.js';
import {getLanguageModel} from './llm-provider.js';
import {getMCPClient} from './mcp-client.js';
import {reportBuilder, type ReportBuilder} from './report-builder.js';

/**
 * Maximum iterations for the agent loop to prevent infinite loops
 */
const MAX_AGENT_ITERATIONS = 20;

/**
 * The shape `generateText` actually returns.
 *
 * Derived from the SDK rather than hand-written: the helpers below used to
 * declare their own all-optional structural type, which is why reading the
 * pre-v5 `toolCalls[].args` kept compiling and shipped empty tool-call
 * arguments to the UI for a whole major version. Anchoring to the SDK turns
 * the next rename into a compile error.
 */
type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;

/**
 * Analysis progress callback type
 * Extended to support LLM response data display
 */
export type AnalysisProgressCallback = (
	stage: AnalysisStage,
	message?: string,
	llmResponse?: LLMResponseData,
) => void;

/**
 * UX Finding schema for structured output
 */
const UxFindingSchema = z.object({
	severity: z.enum(['critical', 'high', 'medium', 'low']),
	category: z.string(),
	description: z.string(),
	personaRelevance: z.array(z.string()),
	recommendation: z.string(),
	pageUrl: z.string(),
});

/**
 * AI Service
 * Orchestrates AI-powered UX analysis using MCP tools
 */
export class AIService {
	private readonly model: LanguageModelV4;
	private readonly mcpClient: MCPClient;
	private readonly reportBuilder: ReportBuilder;

	constructor(
		model: LanguageModelV4,
		mcpClient: MCPClient,
		builder: ReportBuilder,
	) {
		this.model = model;
		this.mcpClient = mcpClient;
		this.reportBuilder = builder;
	}

	/**
	 * Close the MCP client connection and reset state
	 */
	async close(): Promise<void> {
		if (this.mcpClient) {
			await this.mcpClient.close();
		}

		this.reportBuilder.reset();
	}

	/**
	 * Analyze a single page using Manual Agent Loop pattern
	 */
	async analyzePage(
		config: UxLintConfig,
		page: Page,
		onProgress?: AnalysisProgressCallback,
	): Promise<PageAnalysis> {
		if (!this.model || !this.mcpClient) {
			throw new Error('AIService not initialized');
		}

		try {
			// Initialize page analysis in report builder
			this.reportBuilder.initializePageAnalysis(page.url, page.features);

			// Get MCP tools from Playwright
			onProgress?.('navigating', `Navigating to ${page.url}`);
			const mcpTools = await this.mcpClient.tools();

			// Build system prompt
			const systemPrompt = this.buildSystemPrompt(config);

			// Build user prompt for this page
			const userPrompt = this.buildUserPrompt(page);

			// Create report building tools
			const reportTools = this.createReportTools();

			// Combine MCP tools with report tools
			const tools = {
				...mcpTools,
				...reportTools,
			};

			// Initialize messages
			const messages: ModelMessage[] = [
				{
					role: 'user',
					content: userPrompt,
				},
			];

			let iterations = 0;
			let isAnalysisCompleted = false;

			// Manual Agent Loop - await in loop is intentional for sequential LLM calls
			while (iterations < MAX_AGENT_ITERATIONS && !isAnalysisCompleted) {
				iterations++;

				// Show waiting message before LLM call
				onProgress?.('analyzing', getRandomWaitingMessage(), undefined);

				// Log AI request
				logger.info('AI Request', {
					context: `Page Analysis - ${page.url} - Iteration ${iterations}`,
					request: {systemPrompt, messages},
				});

				// No `stopWhen`, so generateText performs exactly one step per
				// call and this loop drives the agent itself. That assumption is
				// load-bearing: in AI SDK 7 the top-level `toolCalls`, `content`
				// and `usage` accumulate across *all* steps, so adding a
				// multi-step stop condition would make processAgentResult see
				// tool calls from earlier steps. If multi-step is ever wanted,
				// switch processAgentResult to read `result.finalStep`.
				// eslint-disable-next-line no-await-in-loop
				const result = await generateText({
					model: this.model,
					instructions: systemPrompt,
					messages,
					tools,
				});

				// Log AI response
				logger.info('AI Response', {
					context: `Page Analysis - ${page.url} - Iteration ${iterations}`,
					response: {
						text: result.text,
						finishReason: result.finishReason,
						toolCalls: result.toolCalls,
						usage: result.usage,
					},
				});

				// Create and send LLM response to UI
				const llmResponse = this.createLLMResponseData(result, iterations);
				onProgress?.('analyzing', undefined, llmResponse);

				// Add response messages to history.
				// `result.response` is deprecated in AI SDK 7 in favour of
				// `finalStep.response`; `responseMessages` is the accumulated
				// assistant/tool message list this loop needs.
				messages.push(...result.responseMessages);

				// Process result and check if analysis is complete
				const shouldContinue = this.processAgentResult(
					result,
					messages,
					iterations,
				);

				if (shouldContinue === false) {
					break;
				}

				if (shouldContinue === 'completed') {
					isAnalysisCompleted = true;
				}
			}

			// If analysis was not completed properly, complete it now
			if (!isAnalysisCompleted) {
				const state = this.reportBuilder.getCurrentState();
				if (state.currentPageAnalysis) {
					this.reportBuilder.completePageAnalysis();
				}
			}

			// Get the completed analysis from report builder
			const state = this.reportBuilder.getCurrentState();
			const completedAnalysis =
				// eslint-disable-next-line unicorn/prefer-at
				state.completedAnalyses[state.completedAnalyses.length - 1];

			if (!completedAnalysis) {
				throw new Error('Failed to complete page analysis');
			}

			onProgress?.('page-complete', `Finished analyzing ${page.url}`);

			return completedAnalysis;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';

			// Log the error for debugging
			logger.error('Page analysis failed', {
				pageUrl: page.url,
				error: errorMessage,
				errorName: error instanceof Error ? error.name : 'Unknown',
				stack: error instanceof Error ? error.stack : undefined,
			});

			// Record the failure and drop only this page. Calling reset() here
			// emptied the whole run, so a single failing page erased every page
			// already analysed -- and the hand-built result below was returned to
			// a caller that discards it, leaving the failure out of the report.
			return this.reportBuilder.failCurrentPage(errorMessage, page);
		}
	}

	/**
	 * Create LLM response data for UI display
	 */
	private createLLMResponseData(
		result: Pick<GenerateTextResult, 'text' | 'toolCalls' | 'finishReason'>,
		iteration: number,
	): LLMResponseData {
		const emptyArgs: Record<string, unknown> = {};
		return {
			text: result.text,
			toolCalls: result.toolCalls?.map((tc, index) => ({
				id: tc.toolCallId ?? `${tc.toolName}-${iteration}-${index}`,
				toolName: tc.toolName,
				// The SDK has called this `input` since v5; this code read the
				// pre-v5 `args`, so every tool call silently rendered as {}.
				args:
					typeof tc.input === 'object' &&
					tc.input !== null &&
					!Array.isArray(tc.input)
						? (tc.input as Record<string, unknown>)
						: emptyArgs,
			})),
			finishReason: result.finishReason,
			iteration,
			timestamp: Date.now(),
		};
	}

	/**
	 * Process agent loop result and determine next action
	 * @returns false to break loop, true to continue, 'completed' if analysis done
	 */
	private processAgentResult(
		result: Pick<GenerateTextResult, 'finishReason' | 'toolCalls'>,
		messages: ModelMessage[],
		iterations: number,
	): boolean | 'completed' {
		if (result.finishReason === 'tool-calls' && result.toolCalls) {
			const isComplete = result.toolCalls.some(
				tc => tc.toolName === 'completePageAnalysis',
			);

			if (isComplete) {
				return 'completed';
			}

			return true;
		}

		if (result.finishReason === 'stop') {
			const state = this.reportBuilder.getCurrentState();
			const shouldRemind =
				state.currentPageAnalysis && iterations < MAX_AGENT_ITERATIONS;

			if (shouldRemind) {
				messages.push({
					role: 'user',
					content:
						'Please complete your analysis by calling addFinding for any UX issues you identified, then call completePageAnalysis to finish.',
				});
				return true;
			}
		}

		return false;
	}

	/**
	 * Create report building tools for LLM
	 */
	private createReportTools() {
		const builder = this.reportBuilder;

		return {
			addFinding: tool({
				description: `Add a UX finding to the current page analysis. Call this once for each UX issue you identify (typically 3-10 issues per page).

Usage: Call this tool multiple times, once per issue. Do not batch findings together.`,
				inputSchema: UxFindingSchema,
				async execute(input) {
					builder.addFinding(input);
					return {
						success: true,
						message: 'Finding added successfully',
						currentFindingsCount:
							builder.getCurrentState().currentPageAnalysis?.findings?.length ??
							0,
					};
				},
			}),

			setPageSnapshot: tool({
				description:
					'Save the page snapshot data. Call this once per page after using browser_snapshot to capture the page structure.',
				inputSchema: z.object({
					snapshot: z.string(),
				}),
				async execute({snapshot}) {
					builder.setPageSnapshot(snapshot);
					return {
						success: true,
						message: 'Snapshot saved successfully',
					};
				},
			}),

			completePageAnalysis: tool({
				description:
					'Mark the current page analysis as complete. REQUIRED: You MUST call this tool when you have finished analyzing all UX aspects and reporting findings. The analysis is not complete until you call this.',
				inputSchema: z.object({}),
				async execute() {
					const completedAnalysis = builder.completePageAnalysis();
					return {
						success: true,
						message: 'Page analysis completed',
						pageUrl: completedAnalysis.pageUrl,
						findingsCount: completedAnalysis.findings.length,
					};
				},
			}),
		};
	}

	/**
	 * Build system prompt for UX analysis
	 */
	private buildSystemPrompt(config: UxLintConfig): string {
		return `You are an expert UX analyst specializing in comprehensive web usability analysis.

## Target Persona
${config.persona}

Analyze pages from this persona's perspective, identifying usability issues across: Accessibility, Navigation, Visual Design, Content, Interaction, Performance, and Mobile Responsiveness.`;
	}

	/**
	 * Build user prompt for a specific page
	 */
	private buildUserPrompt(page: Page): string {
		return `Analyze this page for UX issues:

URL: ${page.url}

Page Features/Context:
${page.features}

## Workflow - Complete ALL Steps

**Step 1: Navigate and Capture**
1. Call browser_navigate to load the page
2. Call browser_snapshot to capture the page structure
3. Call setPageSnapshot with the snapshot data

**Step 2: Analyze and Document**
4. Thoroughly analyze the page from the persona's perspective
5. For EACH UX issue found, immediately call addFinding
   - Report 3-10 issues per page typically
   - Call addFinding once per issue (do not batch)
   - Cover multiple UX categories

**Step 3: Complete**
6. Call completePageAnalysis when finished
   - This is REQUIRED to complete the analysis
   - Do not stop until you call this tool

IMPORTANT: You MUST call completePageAnalysis before finishing. The analysis is not complete until this tool is called.`;
	}
}

/**
 * Singleton instance of AIService (per config)
 */
const aiServiceInstances = new Map<string, AIService>();

/**
 * Get or create AIService instance for a given configuration
 */
export async function getAIService(config: UxLintConfig): Promise<AIService> {
	// Import envIO dynamically to get AI config for cache key
	const {envIO} = await import('../infrastructure/config/env-io.js');
	const aiConfig = envIO.loadAiConfig();

	// Create a cache key from AI environment config
	const cacheKey = `${aiConfig.provider}-${aiConfig.model ?? 'default'}`;

	if (!aiServiceInstances.has(cacheKey)) {
		const model = await getLanguageModel(config);
		const client = await getMCPClient();
		const service = new AIService(model, client, reportBuilder);
		aiServiceInstances.set(cacheKey, service);
	}

	return aiServiceInstances.get(cacheKey)!;
}

/**
 * Reset AIService instance (useful for testing)
 */
export function resetAIService(): void {
	aiServiceInstances.clear();
}
