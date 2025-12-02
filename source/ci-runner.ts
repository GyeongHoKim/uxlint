/**
 * CI Runner
 * Runs UX analysis without UI for CI/CD environments
 *
 * @packageDocumentation
 */

import {writeFile} from 'node:fs/promises';
import process from 'node:process';
import {logger} from './infrastructure/logger.js';
import {generateMarkdownReport} from './infrastructure/reports/report-generator.js';
import type {AnalysisStage} from './models/analysis.js';
import type {UxLintConfig} from './models/config.js';
import {getAIService} from './services/ai-service.js';

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
 * Uses console.log/console.error for output
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

	console.log(`Starting UX analysis for ${totalPages} page(s)...`);

	try {
		// Get AI Service instance
		logger.debug('Initializing AI service');
		const aiService = await getAIService();
		logger.debug('AI service initialized');

		// Process each page sequentially
		for (const [index, page] of pages.entries()) {
			const currentPage = index + 1;
			const pageStartTime = Date.now();

			logger.info('Page analysis started', {
				pageNumber: currentPage,
				totalPages,
				url: page.url,
			});

			console.log(`[${currentPage}/${totalPages}] Analyzing: ${page.url}`);

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

			console.log(`[${currentPage}/${totalPages}] ✓ Complete`);
		}

		// Generate report
		logger.info('Report generation started');
		console.log('Generating report...');

		const reportBuilder = aiService.getReportBuilder();
		const report = reportBuilder.generateFinalReport();

		// Write report to file
		const markdown = generateMarkdownReport(report);
		await writeFile(config.report.output, markdown, 'utf8');

		const totalDuration = Date.now() - startTime;
		logger.info('CI analysis completed successfully', {
			totalPages,
			reportOutput: config.report.output,
			totalDurationMs: totalDuration,
			findingsCount: report.prioritizedFindings?.length ?? 0,
		});

		console.log(`✓ Report saved to: ${config.report.output}`);

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

		console.error(`✗ Analysis failed: ${errorMessage}`);
		process.exit(1);
	}
}
