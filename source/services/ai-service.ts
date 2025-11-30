/**
 * AI Service
 * Handles AI-powered UX analysis using MCP tools and Manual Agent Loop pattern
 * Implements singleton pattern for global instance management
 *
 * @packageDocumentation
 */

import {writeFile} from 'node:fs/promises';
import {type experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {type LanguageModelV2} from '@ai-sdk/provider';
import {generateText, tool, type ModelMessage} from 'ai';
import {z} from 'zod/v4';
import type {AnalysisStage, PageAnalysis} from '../models/analysis.js';
import type {Page, UxLintConfig} from '../models/config.js';
import {generateMarkdownReport} from '../infrastructure/reports/report-generator.js';
import {languageModel} from './llm-provider.js';
import {mcpClient} from './mcp-client.js';
import {reportBuilder, type ReportBuilder} from './report-builder.js';

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
 * AI Service
 * Orchestrates AI-powered UX analysis using MCP tools
 */
class AIService {
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
			const reportTools = this.createReportTools(config.report.output);

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

				onProgress?.('analyzing', `Analysis iteration ${iterations}`);

				// eslint-disable-next-line no-await-in-loop
				const result = await generateText({
					model: this.model,
					system: systemPrompt,
					messages,
					tools,
				});

				// Add response messages to history
				const responseMessages = result.response.messages;
				messages.push(...responseMessages);

				// Check if page analysis is complete
				if (result.finishReason === 'tool-calls') {
					const {toolCalls} = result;

					// Check if completePageAnalysis was called
					const completeCall = toolCalls.find(
						tc => tc.toolName === 'completePageAnalysis',
					);

					if (completeCall) {
						analysisCompleted = true;
					}
				} else {
					// Model finished without tool calls
					break;
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

			onProgress?.('complete');

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
	 * Create report building tools for LLM
	 */
	private createReportTools(outputPath: string) {
		const {reportBuilder} = this;

		return {
			addFinding: tool({
				description:
					'Add a UX finding to the current page analysis. Call this for each issue you identify.',
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
					'Set the accessibility tree snapshot for the current page. Call this after using browser_snapshot.',
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
					'Complete the analysis for the current page. Call this when you have finished analyzing all UX aspects.',
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

			writeReportToFile: tool({
				description:
					'Write the final UX analysis report to a file. Call this after completing all page analyses to save the report.',
				inputSchema: z.object({
					filepath: z
						.string()
						.optional()
						.describe(
							'Optional custom output path. Uses config default if not provided.',
						),
				}),
				async execute({filepath}) {
					const report = reportBuilder.generateFinalReport();
					const markdown = generateMarkdownReport(report);
					const finalPath = filepath ?? outputPath;

					await writeFile(finalPath, markdown, 'utf8');

					return {
						success: true,
						message: 'Report written successfully',
						path: finalPath,
						totalFindings: report.metadata.totalFindings,
						analyzedPages: report.metadata.analyzedPages.length,
					};
				},
			}),
		};
	}

	/**
	 * Build system prompt for UX analysis
	 */
	private buildSystemPrompt(config: UxLintConfig): string {
		const personaText = config.persona;

		return `You are an expert UX analyst. Your task is to analyze web pages for usability issues and provide actionable recommendations.

## Target Persona
${personaText}

## Analysis Workflow
1. Navigate to the target URL using the browser_navigate tool
2. Take a snapshot of the page using browser_snapshot tool to understand the page structure
3. Save the snapshot using setPageSnapshot tool
4. Analyze the page from the persona's perspective
5. For each UX issue you identify, call addFinding tool with details
6. When you have completed your analysis, call completePageAnalysis tool
7. After analyzing all pages, call writeReportToFile to save the final report

## UX Categories to Evaluate
- Accessibility (WCAG compliance, screen reader support)
- Navigation (clarity, consistency, ease of use)
- Visual Design (contrast, typography, spacing)
- Content (clarity, readability, information architecture)
- Interaction (form usability, feedback, error handling)
- Performance (perceived speed, loading states)
- Mobile Responsiveness (if applicable)

## Tool Usage
- Use addFinding for EACH issue you discover (call multiple times)
- Use setPageSnapshot ONCE after browser_snapshot
- Use completePageAnalysis ONCE when analysis is finished
- Use writeReportToFile ONCE after all pages are analyzed to save the report

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
3. Save the snapshot using setPageSnapshot
4. Analyze the page thoroughly from the persona's perspective
5. Call addFinding for each UX issue you identify
6. When complete, call completePageAnalysis`;
	}
}

/**
 * Singleton instance of AIService
 */
export const aiService = new AIService(languageModel, mcpClient, reportBuilder);
