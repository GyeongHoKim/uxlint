/**
 * Analysis Orchestrator Service
 * Orchestrates multi-page UX analysis workflow
 *
 * @packageDocumentation
 */

import type {UxLintConfig} from '../models/config.js';
import type {PageAnalysis, UxReport} from '../models/analysis.js';
import {writeReportToFile} from '../infrastructure/reports/report-generator.js';
import {McpPageCapture} from './mcp-page-capture.js';
import {ReportBuilder} from './report-builder.js';

/**
 * Analysis progress callback
 */
export type AnalysisProgressCallback = (progress: {
	currentPageIndex: number;
	totalPages: number;
	stage: 'navigating' | 'analyzing' | 'generating-report';
	currentPageUrl?: string;
}) => void;

/**
 * Analysis Orchestrator
 * Manages the complete analysis workflow:
 * - Page capture via MCP
 * - AI-powered analysis
 * - Report generation
 * - File output
 */
export class AnalysisOrchestrator {
	private mcpPageCapture: McpPageCapture | undefined;
	private readonly reportBuilder: ReportBuilder;

	constructor() {
		this.reportBuilder = new ReportBuilder();
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
		const analyses: PageAnalysis[] = [];

		// Initialize MCP client
		this.mcpPageCapture = new McpPageCapture();

		try {
			// Process each page sequentially
			for (const [index, page] of config.pages.entries()) {
				// eslint-disable-next-line no-await-in-loop
				const analysis = await this.analyzeSinglePage({
					pageUrl: page.url,
					features: page.features,
					personas: config.personas,
					pageIndex: index,
					totalPages: config.pages.length,
					onProgress,
				});

				analyses.push(analysis);
			}

			// Generate report
			onProgress?.({
				currentPageIndex: config.pages.length,
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
			// Cleanup
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
		if (!this.mcpPageCapture) {
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

			// Use high-level API - no abstraction leak
			const analysisResult = await this.mcpPageCapture.analyzeWithAi(
				pageUrl,
				features,
				personas,
			);

			// Return successful analysis
			return {
				pageUrl,
				features,
				snapshot: '', // Snapshot captured by LLM via tools
				findings: analysisResult.findings as PageAnalysis['findings'],
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
		if (this.mcpPageCapture) {
			await this.mcpPageCapture.close();
			this.mcpPageCapture = undefined;
		}
	}
}
