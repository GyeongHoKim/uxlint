/**
 * CI Runner
 * Runs UX analysis without UI for CI/CD environments
 *
 * @packageDocumentation
 */

import process from 'node:process';
import {logger} from './infrastructure/logger.js';
import type {AnalysisStage} from './models/analysis.js';
import type {UxLintConfig} from './models/config.js';
import {getAIService} from './services/ai-service.js';
import {reportBuilder} from './services/report-builder.js';

/**
 * Create a progress callback for page analysis
 * This is a separate function to avoid closure issues in loops
 */
function createProgressCallback(
	pageNumber: number,
	url: string,
): (stage: AnalysisStage, message?: string) => void {
	return (stage: AnalysisStage, message?: string) => {
		logger.debug('Analysis progress', {
			stage,
			message,
			pageNumber,
			url,
		});
	};
}

/**
 * Run analysis in CI mode without any UI
 * All output goes to logger (log files) only
 */
export async function runCIAnalysis(config: UxLintConfig): Promise<void> {
	const {pages} = config;
	const totalPages = pages.length;
	const startTime = Date.now();

	logger.info('CI analysis started', {
		totalPages,
		mainPageUrl: config.mainPageUrl,
		reportOutput: config.report.output,
	});

	try {
		// Get AI Service instance
		logger.debug('Initializing AI service');
		const aiService = await getAIService(config);
		logger.debug('AI service initialized');

		// Process each page sequentially (not in parallel)
		// Sequential processing is required because:
		// 1. The Playwright MCP server manages a single browser instance
		// 2. Each page analysis uses browser_navigate which changes the active page
		// 3. Parallel execution would cause race conditions in the browser state
		// 4. AI service maintains state (report builder) that accumulates findings
		for (const [index, page] of pages.entries()) {
			const currentPage = index + 1;
			const pageStartTime = Date.now();

			logger.info('Page analysis started', {
				pageNumber: currentPage,
				totalPages,
				url: page.url,
			});

			// Create progress callback with captured values
			const progressCallback = createProgressCallback(currentPage, page.url);

			// Analyze page with minimal progress callback
			// eslint-disable-next-line no-await-in-loop
			await aiService.analyzePage(config, page, progressCallback);

			const pageDuration = Date.now() - pageStartTime;
			logger.info('Page analysis completed', {
				pageNumber: currentPage,
				totalPages,
				url: page.url,
				durationMs: pageDuration,
			});
		}

		// Generate and save report
		logger.info('Report generation started');

		const report = reportBuilder.generateFinalReport();

		// Save report to file using ReportBuilder
		await reportBuilder.saveReport(config.report.output);

		const totalDuration = Date.now() - startTime;
		logger.info('CI analysis completed successfully', {
			totalPages,
			reportOutput: config.report.output,
			totalDurationMs: totalDuration,
			findingsCount: report.prioritizedFindings?.length ?? 0,
		});

		// Cleanup
		logger.debug('Cleaning up AI service');
		await aiService.close();

		process.exit(0);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error';
		const errorStack = error instanceof Error ? error.stack : undefined;

		logger.error('CI analysis failed', {
			error: errorMessage,
			stack: errorStack,
			totalPages,
			elapsedMs: Date.now() - startTime,
		});

		process.exit(1);
	}
}
