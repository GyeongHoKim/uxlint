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
import type {
	AnalysisStage as ProgressStage,
	PageAnalysis,
} from '../models/analysis.js';
import {
	advanceStage,
	initialStage,
	toolsForStage,
	type ObservedToolResult,
} from '../models/analysis-stage.js';
import type {PreflightVerdict} from '../models/browser-preflight.js';
import type {Page, UxLintConfig} from '../models/config.js';
import type {LLMResponseData} from '../models/llm-response.js';
import {getLanguageModel} from './llm-provider.js';
import {
	getMCPClient,
	narrowBrowserTools,
	resetMCPClient,
} from './mcp-client.js';
import {reportBuilder, type ReportBuilder} from './report-builder.js';

/**
 * Maximum iterations for the agent loop to prevent infinite loops
 */
const MAX_AGENT_ITERATIONS = 20;

/**
 * The browser tool whose result is the page structure.
 */
const captureToolName = 'take_snapshot';

/**
 * Reduce a tool execution event to what the stage machine needs.
 *
 * The event's output field only exists on the success variant, so the
 * discriminant is checked before reading it rather than after.
 *
 * @param event - A tool execution end event
 * @returns The result as the loop observed it
 */
function observeTool(event: ToolExecutionEndEvent): ObservedToolResult {
	const succeeded = event.toolOutput.type === 'tool-result';
	const output =
		succeeded && typeof event.toolOutput.output === 'string'
			? event.toolOutput.output
			: '';

	return {toolName: event.toolCall.toolName, succeeded, output};
}

/**
 * The shape `onToolExecutionEnd` receives.
 *
 * Narrowed to the fields this code reads. Note `toolCall.toolName` rather than
 * a top-level `toolName`, which is undefined on this event.
 */
type ToolExecutionEndEvent = {
	toolCall: {toolName: string};
	toolOutput: {type: string; output?: unknown};
};

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
	stage: ProgressStage,
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
	private readonly cacheKey: string | undefined;
	private isClosed = false;

	/**
	 * Create an analysis service bound to one model and MCP connection.
	 *
	 * `cacheKey` is the key this instance is filed under in the module cache,
	 * which lets `close()` evict itself. It is omitted when the service is
	 * constructed directly, as tests do.
	 *
	 * @param model - Language model backing the analysis
	 * @param mcpClient - Connected MCP client providing browser tools
	 * @param builder - Report builder collecting findings
	 * @param cacheKey - Module cache key for this instance
	 */
	constructor(
		model: LanguageModelV4,
		mcpClient: MCPClient,
		builder: ReportBuilder,
		cacheKey?: string,
	) {
		this.model = model;
		this.mcpClient = mcpClient;
		this.reportBuilder = builder;
		this.cacheKey = cacheKey;
	}

	/**
	 * Close the MCP client connection and reset state
	 *
	 * Both caches in front of this object have to be cleared, not just one.
	 * `getAIService` memoises the service and `getMCPClient` memoises the
	 * transport at module scope, so dropping only the service handed the next
	 * run a brand new AIService wrapped around the same closed client -- and
	 * because that instance is not itself closed, the guard in `analyzePage`
	 * would not catch it either.
	 */
	async close(): Promise<void> {
		try {
			if (this.mcpClient) {
				await this.mcpClient.close();
			}
		} finally {
			// A transport that throws on the way down is still down. Leaving the
			// caches populated because its close() failed reproduces the exact
			// symptom this teardown exists to prevent.
			this.reportBuilder.reset();
			this.isClosed = true;

			// Only a cache-managed instance owns the module-level caches. A
			// service constructed directly (tests) brings its own client and
			// must not clobber them.
			if (this.cacheKey) {
				aiServiceInstances.delete(this.cacheKey);
				resetMCPClient();
			}
		}
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

		if (this.isClosed) {
			// Name the real cause instead of letting the closed transport raise
			// whatever it raises. Reported straight to the caller and not through
			// the builder: close() reset that builder, and it is the process-wide
			// singleton the *next* run will use, so writing here would plant a
			// phantom failed page in a report for a run that never saw this page.
			return {
				pageUrl: page.url,
				features: page.features,
				snapshot: '',
				findings: [],
				analysisTimestamp: Date.now(),
				status: 'failed',
				error:
					'AIService has been closed; create a new instance before analyzing again',
			};
		}

		try {
			// The persona belongs to the run, not to a page, but nothing else
			// records it: this used to live only in the error path, so a run
			// where every page succeeded produced a report with a blank
			// persona. Setting it here is idempotent.
			this.reportBuilder.setPersona(config.persona);

			// Initialize page analysis in report builder
			this.reportBuilder.initializePageAnalysis(page.url, page.features);

			// Get browser tools from the MCP server, narrowed to the ones the
			// analysis uses. Everything else the server offers would be re-sent,
			// in full, on every request.
			onProgress?.('navigating', `Navigating to ${page.url}`);
			const mcpTools = narrowBrowserTools(await this.mcpClient.tools());

			// Build system prompt
			const systemPrompt = this.buildSystemPrompt(config);

			// Build user prompt for this page
			const userPrompt = this.buildUserPrompt(page);

			// Create report building tools
			const reportTools = this.createReportTools();

			// Every tool the analysis could use at some point. Which of them is
			// offered is decided per iteration, by stage.
			const allTools = {
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
			let stage = initialStage;

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
				// Only this stage's tools. The sequence is enforced by what is
				// available rather than by asking and then reminding: an unloaded
				// page has no capture tool to call.
				const tools = Object.fromEntries(
					toolsForStage(stage)
						.filter(name => Object.hasOwn(allTools, name))
						.map(name => [name, allTools[name as keyof typeof allTools]]),
				);

				// Observations are collected here and applied after the call, so
				// the callback does not close over the loop's mutable stage.
				const observed: ObservedToolResult[] = [];

				// eslint-disable-next-line no-await-in-loop
				const result = await generateText({
					model: this.model,
					instructions: systemPrompt,
					messages,
					tools,
					onToolExecutionEnd: event => {
						this.recordCapture(event);
						observed.push(observeTool(event));
					},
				});

				for (const observation of observed) {
					stage = advanceStage(stage, observation);
				}

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
				const shouldContinue = this.processAgentResult(result);

				if (shouldContinue === false) {
					break;
				}

				if (shouldContinue === 'completed') {
					isAnalysisCompleted = true;
				}
			}

			// The loop ended without the model calling completePageAnalysis --
			// it exhausted MAX_AGENT_ITERATIONS or stopped early. Close the page
			// out as `partial`: recording it as `complete` made a truncated
			// sweep indistinguishable from a finished one, which is exactly the
			// distinction a CI gate has to be able to make.
			if (!isAnalysisCompleted) {
				const state = this.reportBuilder.getCurrentState();
				if (state.currentPageAnalysis) {
					this.reportBuilder.completePageAnalysis('partial');
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
	 * Record a page structure capture as the browser produced it.
	 *
	 * The model is shown the capture as a tool result and is not asked to
	 * repeat it. Recording here rather than through a tool the model calls is
	 * what makes the stored snapshot byte-identical to the browser's output:
	 * there is no step in which it is re-encoded, shortened, or paraphrased.
	 *
	 * Only successful results are recorded. `toolOutput.type` distinguishes
	 * `tool-result` from `tool-error`, so an errored capture is skipped rather
	 * than stored as though the page had been read.
	 *
	 * @param event - A tool execution end event from the agent loop
	 */
	private recordCapture(event: ToolExecutionEndEvent): void {
		if (event.toolCall.toolName !== captureToolName) {
			return;
		}

		if (event.toolOutput.type !== 'tool-result') {
			logger.warn('Page capture failed; nothing recorded', {
				toolName: event.toolCall.toolName,
			});
			return;
		}

		const {output} = event.toolOutput;
		if (typeof output !== 'string') {
			return;
		}

		this.reportBuilder.setPageSnapshot(output);
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
	 *
	 * @param result - What the model returned this iteration
	 * @returns false to break loop, true to continue, 'completed' if analysis done
	 */
	private processAgentResult(
		result: Pick<GenerateTextResult, 'finishReason' | 'toolCalls'>,
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

		// A model that stops has stopped. The loop used to push a "Please
		// complete your analysis..." message back into the conversation and
		// carry on, which spent tokens precisely when the context was already
		// under strain, and which only ever existed because the sequence was
		// requested in prose rather than enforced by what was offered. Now that
		// each stage exposes only what it can act on -- and completion is
		// always available -- there is nothing to nag about: a page that ends
		// early ends as `partial`, which is what it is.
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

			completePageAnalysis: tool({
				description:
					'Mark the current page analysis as complete. REQUIRED: You MUST call this tool when you have finished analyzing all UX aspects and reporting findings. The analysis is not complete until you call this.',
				inputSchema: z.object({}),
				async execute() {
					// A page whose structure was never captured has not been
					// analysed, whatever the model concluded about it. Recording
					// that as `complete` would make a judgement resting on nothing
					// indistinguishable from one resting on the page -- the same
					// distinction 004 needed to gate a pipeline on.
					const captured =
						(builder.getCurrentState().currentPageAnalysis?.snapshot ?? '')
							.length > 0;
					const completedAnalysis = builder.completePageAnalysis(
						captured ? 'complete' : 'partial',
					);
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
1. Call navigate_page to load the page
2. Call take_snapshot to capture the page structure

**Step 2: Analyze and Document**
3. Thoroughly analyze the page from the persona's perspective
4. For EACH UX issue found, immediately call addFinding
   - Report 3-10 issues per page typically
   - Call addFinding once per issue (do not batch)
   - Cover multiple UX categories

**Step 3: Complete**
5. Call completePageAnalysis when finished
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
export async function getAIService(
	config: UxLintConfig,
	verdict: PreflightVerdict,
): Promise<AIService> {
	// Import envIO dynamically to get AI config for cache key
	const {envIO} = await import('../infrastructure/config/env-io.js');
	const aiConfig = envIO.loadAiConfig();

	// Create a cache key from AI environment config
	const cacheKey = `${aiConfig.provider}-${aiConfig.model ?? 'default'}`;

	if (!aiServiceInstances.has(cacheKey)) {
		const model = await getLanguageModel(config);
		const client = await getMCPClient(verdict, config.browser);
		const service = new AIService(model, client, reportBuilder, cacheKey);
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
