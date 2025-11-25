/**
 * AI Service
 * Handles AI-powered UX analysis using MCP tools and Manual Agent Loop pattern
 *
 * @packageDocumentation
 */

import {
	type experimental_createMCPClient,
	type experimental_MCPClient,
} from '@ai-sdk/mcp';
import {type Experimental_StdioMCPTransport} from '@ai-sdk/mcp/mcp-stdio';
import {type LanguageModelV2} from '@ai-sdk/provider';
import {type ModelMessage, generateText, tool, stepCountIs} from 'ai';
import {z} from 'zod/v4';
import type {
	AnalysisStage,
	PageAnalysis,
	UxFinding,
} from '../models/analysis.js';
import type {Page, UxLintConfig} from '../models/config.js';
import type {EnvConfig} from '../infrastructure/config/env-config.js';

/**
 * Maximum iterations for the agent loop to prevent infinite loops
 */
const MAX_AGENT_ITERATIONS = 20;

/**
 * Analysis progress callback type
 */
export type AnalysisProgressCallback = (
	stage: AnalysisStage,
	message?: string,
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
 * Analysis result schema for structured output
 */
const AnalysisResultSchema = z.object({
	findings: z.array(UxFindingSchema),
	snapshot: z.string(),
});

/**
 * Create language model based on environment configuration
 */
export async function createLanguageModel(
	envConfig: EnvConfig,
): Promise<LanguageModelV2> {
	switch (envConfig.provider) {
		case 'anthropic': {
			const {createAnthropic} = await import('@ai-sdk/anthropic');
			const anthropic = createAnthropic({apiKey: envConfig.apiKey});
			return anthropic(envConfig.model);
		}

		case 'openai': {
			const {createOpenAI} = await import('@ai-sdk/openai');
			const openai = createOpenAI({apiKey: envConfig.apiKey});
			return openai(envConfig.model);
		}

		case 'ollama': {
			const {createOllama} = await import('ollama-ai-provider-v2');
			const ollama = createOllama({baseURL: envConfig.baseUrl});
			return ollama(envConfig.model);
		}

		case 'xai': {
			const {createXai} = await import('@ai-sdk/xai');
			const xai = createXai({apiKey: envConfig.apiKey});
			return xai(envConfig.model);
		}

		case 'google': {
			const {createGoogleGenerativeAI} = await import('@ai-sdk/google');
			const google = createGoogleGenerativeAI({apiKey: envConfig.apiKey});
			return google(envConfig.model);
		}
	}
}

/**
 * Create Playwright MCP client
 */
export async function createPlaywrightMCPClient(
	createMCPClient: typeof experimental_createMCPClient,
	StdioMCPTransport: typeof Experimental_StdioMCPTransport,
): Promise<experimental_MCPClient> {
	const transport = new StdioMCPTransport({
		command: 'npx',
		args: ['@playwright/mcp@latest'],
	});

	return createMCPClient({transport});
}

/**
 * AI Service
 * Orchestrates AI-powered UX analysis using MCP tools
 */
export class AIService {
	private readonly model: LanguageModelV2;
	private readonly mcpClient: experimental_MCPClient;
	private readonly config: UxLintConfig;

	constructor(
		model: LanguageModelV2,
		mcpClient: experimental_MCPClient,
		config: UxLintConfig,
	) {
		this.model = model;
		this.mcpClient = mcpClient;
		this.config = config;
	}

	/**
	 * Close the MCP client connection
	 */
	async close(): Promise<void> {
		await this.mcpClient.close();
	}

	/**
	 * Analyze a single page using Manual Agent Loop pattern
	 */
	async analyzePage(
		page: Page,
		onProgress?: AnalysisProgressCallback,
	): Promise<PageAnalysis> {
		const startTime = Date.now();

		try {
			// Get MCP tools from Playwright
			onProgress?.('navigating', `Navigating to ${page.url}`);
			const mcpTools = await this.mcpClient.tools();

			// Build system prompt
			const systemPrompt = this.buildSystemPrompt();

			// Build user prompt for this page
			const userPrompt = this.buildUserPrompt(page);

			// Define the analysis completion tool (no execute - manual handling)
			const completeAnalysisTool = tool({
				description:
					'Call this tool when you have completed the UX analysis and are ready to submit your findings.',
				inputSchema: AnalysisResultSchema,
			});

			// Combine MCP tools with completion tool
			const tools = {
				...mcpTools,
				completeAnalysis: completeAnalysisTool,
			};

			// Initialize messages
			const messages: ModelMessage[] = [
				{
					role: 'user',
					content: userPrompt,
				},
			];

			let iterations = 0;
			let analysisResult: z.infer<typeof AnalysisResultSchema> | undefined;

			// Manual Agent Loop - await in loop is intentional for sequential LLM calls
			while (iterations < MAX_AGENT_ITERATIONS) {
				iterations++;

				onProgress?.('analyzing', `Analysis iteration ${iterations}`);

				// eslint-disable-next-line no-await-in-loop
				const result = await generateText({
					model: this.model,
					system: systemPrompt,
					messages,
					tools,
					stopWhen: stepCountIs(1),
				});

				// Add response messages to history
				const responseMessages = result.response.messages;
				messages.push(...responseMessages);

				// Check if analysis is complete
				if (result.finishReason === 'tool-calls') {
					const {toolCalls} = result;

					// Find completeAnalysis tool call to extract results
					const completeAnalysisCall = toolCalls.find(
						tc => tc.toolName === 'completeAnalysis',
					);

					if (completeAnalysisCall) {
						analysisResult = completeAnalysisCall.input as z.infer<
							typeof AnalysisResultSchema
						>;
						break;
					}

					// MCP tools are auto-executed and results are included in response.messages
					// No need to manually add tool results
				} else {
					// Model finished without tool calls - analysis complete
					break;
				}
			}

			// Build page analysis result
			const findings: UxFinding[] = analysisResult?.findings ?? [];

			onProgress?.('complete');

			return {
				pageUrl: page.url,
				features: page.features,
				snapshot: analysisResult?.snapshot ?? '',
				findings: findings.map(f => ({
					...f,
					severity: f.severity,
				})),
				analysisTimestamp: startTime,
				status: 'complete',
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';

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
	 * Build system prompt for UX analysis
	 */
	private buildSystemPrompt(): string {
		const personasText = this.config.personas
			.map((p, i) => `${i + 1}. ${p}`)
			.join('\n');

		return `You are an expert UX analyst. Your task is to analyze web pages for usability issues and provide actionable recommendations.

## Target Personas
${personasText}

## Analysis Guidelines
1. Navigate to the target URL using the browser_navigate tool
2. Take a snapshot of the page using browser_snapshot tool to understand the page structure
3. Analyze the page from each persona's perspective
4. Identify UX issues across these categories:
   - Accessibility (WCAG compliance, screen reader support)
   - Navigation (clarity, consistency, ease of use)
   - Visual Design (contrast, typography, spacing)
   - Content (clarity, readability, information architecture)
   - Interaction (form usability, feedback, error handling)
   - Performance (perceived speed, loading states)
   - Mobile Responsiveness (if applicable)

## Output Format
When you have completed your analysis, call the completeAnalysis tool with:
- findings: Array of UX issues found
- snapshot: The accessibility tree snapshot from browser_snapshot

Each finding should include:
- severity: 'critical' | 'high' | 'medium' | 'low'
- category: The issue category
- description: Clear description of the issue
- personaRelevance: Which personas are affected
- recommendation: Specific actionable fix
- pageUrl: The URL where the issue was found`;
	}

	/**
	 * Build user prompt for a specific page
	 */
	private buildUserPrompt(page: Page): string {
		return `Please analyze the following page for UX issues:

URL: ${page.url}

Page Features/Context:
${page.features}

Instructions:
1. First, navigate to the URL using browser_navigate
2. Use browser_snapshot to capture the page structure
3. Analyze the page thoroughly from each persona's perspective
4. When complete, call completeAnalysis with your findings`;
	}
}
