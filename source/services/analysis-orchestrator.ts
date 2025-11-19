/**
 * Analysis Orchestrator Service
 * Orchestrates multi-page UX analysis workflow
 *
 * @packageDocumentation
 */

import type {experimental_MCPClient} from 'ai';
import type {UxLintConfig} from '../models/config.js';
import type {
	AnalysisStage,
	PageAnalysis,
	UxReport,
} from '../models/analysis.js';
import {getPlaywrightMcpConfigFromEnv} from '../infrastructure/mcp/config.js';
import {McpClientFactory} from '../infrastructure/mcp/mcp-client-factory.js';
import {writeReportToFile} from '../infrastructure/reports/report-generator.js';
import {analyzePageWithAi} from './ai-service.js';
import {ReportBuilder} from './report-builder.js';

/**
 * Analysis progress callback
 */
export type AnalysisProgressCallback = (progress: {
	currentPageIndex: number;
	totalPages: number;
	stage: AnalysisStage;
	currentPageUrl?: string;
}) => void;

/**
 * Analysis Orchestrator
 * Manages the complete analysis workflow:
 * - MCP client initialization
 * - AI-powered analysis
 * - Report generation
 * - File output
 */
export class AnalysisOrchestrator {
	private mcpClient: experimental_MCPClient | undefined;
	private readonly reportBuilder: ReportBuilder;
	private readonly mcpClientFactory: McpClientFactory;

	constructor() {
		this.reportBuilder = new ReportBuilder();
		this.mcpClientFactory = new McpClientFactory();
	}

	/**
	 * Run complete analysis workflow for all pages
	 *
	 * @param config - UxLint configuration
	 * @param onProgress - Optional progress callback
	 * @returns Final UX report
	 */
	async analyzePages(
		config: UxLintConfig,
		onProgress?: AnalysisProgressCallback,
	): Promise<UxReport> {
		const mcpConfig = getPlaywrightMcpConfigFromEnv();
		this.mcpClient = await this.mcpClientFactory.createClient(mcpConfig);
		try {
			const analyses: PageAnalysis[] = [];
			const processPage = async (index: number): Promise<void> => {
				const page = config.pages[index];
				if (!page || index >= config.pages.length) {
					return;
				}

				const analysis = await this.analyzeSinglePage({
					pageUrl: page.url,
					features: page.features,
					personas: config.personas,
					pageIndex: index,
					totalPages: config.pages.length,
					onProgress,
				});

				analyses.push(analysis);
				await processPage(index + 1);
			};

			await processPage(0);

			// Generate report
			onProgress?.({
				currentPageIndex: config.pages.length - 1,
				totalPages: config.pages.length,
				stage: 'generating-report',
			});

			const report = this.reportBuilder.generateReport(
				analyses,
				config.personas,
			);

			// Write report to file
			await writeReportToFile(report, {outputPath: config.report.output});

			return report;
		} finally {
			await this.cleanup();
		}
	}

	/**
	 * Analyze a single page
	 */
	private async analyzeSinglePage(options: {
		pageUrl: string;
		features: string;
		personas: string[];
		pageIndex: number;
		totalPages: number;
		onProgress?: AnalysisProgressCallback;
	}): Promise<PageAnalysis> {
		const {pageUrl, features, personas, pageIndex, totalPages, onProgress} =
			options;
		if (!this.mcpClient) {
			throw new Error('MCP client not initialized');
		}

		try {
			// Stage 1: Navigating
			onProgress?.({
				currentPageIndex: pageIndex,
				totalPages,
				stage: 'navigating',
				currentPageUrl: pageUrl,
			});

			// Stage 2: Analyzing (LLM will navigate and capture via tools)
			onProgress?.({
				currentPageIndex: pageIndex,
				totalPages,
				stage: 'analyzing',
				currentPageUrl: pageUrl,
			});

			// Analyze with AI (LLM will navigate and capture via tools)
			const analysisResult = await analyzePageWithAi(
				{
					// Snapshot is omitted - LLM will capture it via MCP tools
					pageUrl,
					features,
					personas,
				},
				undefined, // No chunk callback
				this.mcpClient,
			);

			// Return successful analysis
			return {
				pageUrl,
				features,
				snapshot: '', // Snapshot captured by LLM via tools
				findings: analysisResult.findings,
				analysisTimestamp: Date.now(),
				status: 'complete',
			};
		} catch (error) {
			// Return failed analysis
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';

			return {
				pageUrl,
				features,
				snapshot: '',
				findings: [],
				analysisTimestamp: Date.now(),
				status: 'failed',
				error: errorMessage,
			};
		}
	}

	/**
	 * Cleanup resources
	 */
	private async cleanup(): Promise<void> {
		if (this.mcpClient) {
			try {
				await this.mcpClient.close();
			} catch (error) {
				console.error('Error closing MCP client:', error);
			} finally {
				this.mcpClient = undefined;
			}
		}
	}
}
