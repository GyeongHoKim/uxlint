/**
 * AI Service
 * Handles AI-powered UX analysis using MCP tools and Manual Agent Loop pattern
 * Implements singleton pattern for global instance management
 *
 * @packageDocumentation
 */

import {type experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {type LanguageModelV2} from '@ai-sdk/provider';
import {generateText, tool, type ModelMessage} from 'ai';
import {z} from 'zod/v4';
import type {AnalysisStage, PageAnalysis} from '../models/analysis.js';
import type {LLMResponseData} from '../models/llm-response.js';
import {getRandomWaitingMessage} from '../constants/waiting-messages.js';
import type {Page, UxLintConfig} from '../models/config.js';
import {logger} from '../infrastructure/logger.js';
import {getLanguageModel} from './llm-provider.js';
import {getMCPClient} from './mcp-client.js';
import {reportBuilder, type ReportBuilder} from './report-builder.js';

/**
 * Maximum iterations for the agent loop to prevent infinite loops
 */
const MAX_AGENT_ITERATIONS = 20;

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
	private readonly model: LanguageModelV2;
	private readonly mcpClient: MCPClient;
	private readonly reportBuilder: ReportBuilder;

	constructor(
		model: LanguageModelV2,
		mcpClient: MCPClient,
		reportBuilder: ReportBuilder,
	) {
		this.model = model;
		this.mcpClient = mcpClient;
		this.reportBuilder = reportBuilder;
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
	 * Get the report builder instance
	 */
	getReportBuilder(): ReportBuilder {
		return this.reportBuilder;
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

		const startTime = Date.now();

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
			let analysisCompleted = false;

			// Manual Agent Loop - await in loop is intentional for sequential LLM calls
			while (iterations < MAX_AGENT_ITERATIONS && !analysisCompleted) {
				iterations++;

				// Show waiting message before LLM call
				onProgress?.('analyzing', getRandomWaitingMessage(), undefined);

				// Log AI request
				logger.info('AI Request', {
					context: `Page Analysis - ${page.url} - Iteration ${iterations}`,
					request: {systemPrompt, messages},
				});

				// eslint-disable-next-line no-await-in-loop
				const result = await generateText({
					model: this.model,
					system: systemPrompt,
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

				// Add response messages to history
				const responseMessages = result.response.messages;
				messages.push(...responseMessages);

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
					analysisCompleted = true;
				}
			}

			// If analysis was not completed properly, complete it now
			if (!analysisCompleted) {
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

			// Reset current page analysis on error
			this.reportBuilder.reset();
			this.reportBuilder.setPersona(config.persona);

			return {
				pageUrl: page.url,
				features: page.features,
				snapshot: '',
				findings: [],
				analysisTimestamp: startTime,
				status: 'failed',
				error: errorMessage,
			};
		}
	}

	/**
	 * Create LLM response data for UI display
	 */
	private createLLMResponseData(
		result: {
			text: string;
			toolCalls?: Array<{
				toolName: string;
				toolCallId?: string;
				args?: unknown;
			}>;
			finishReason?: string;
		},
		iteration: number,
	): LLMResponseData {
		return {
			text: result.text,
			toolCalls: result.toolCalls?.map((tc, index) => ({
				id: tc.toolCallId ?? `${tc.toolName}-${iteration}-${index}`,
				toolName: tc.toolName,
				args:
					typeof tc.args === 'object' &&
					tc.args !== null &&
					!Array.isArray(tc.args)
						? tc.args
						: {},
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
		result: {
			finishReason?: string;
			toolCalls?: Array<{toolName: string}>;
		},
		messages: ModelMessage[],
		iterations: number,
	): boolean | 'completed' {
		if (result.finishReason === 'tool-calls' && result.toolCalls) {
			const completeCall = result.toolCalls.find(
				tc => tc.toolName === 'completePageAnalysis',
			);

			if (completeCall) {
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
		const {reportBuilder} = this;

		return {
			addFinding: tool({
				description: `Add a UX finding to the current page analysis. Call this once for each UX issue you identify (typically 3-10 issues per page).

Usage: Call this tool multiple times, once per issue. Do not batch findings together.`,
				inputSchema: UxFindingSchema,
				async execute(input) {
					reportBuilder.addFinding(input);
					return {
						success: true,
						message: 'Finding added successfully',
						currentFindingsCount:
							reportBuilder.getCurrentState().currentPageAnalysis?.findings
								?.length ?? 0,
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
					reportBuilder.setPageSnapshot(snapshot);
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
					const completedAnalysis = reportBuilder.completePageAnalysis();
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
 * Singleton instance of AIService
 */
let aiServiceInstance: AIService | undefined;

/**
 * Get or create AIService instance (lazy initialization)
 */
export async function getAIService(): Promise<AIService> {
	if (!aiServiceInstance) {
		const model = await getLanguageModel();
		const client = await getMCPClient();
		aiServiceInstance = new AIService(model, client, reportBuilder);
	}

	return aiServiceInstance;
}

/**
 * Reset AIService instance (useful for testing)
 */
export function resetAIService(): void {
	aiServiceInstance = undefined;
}
