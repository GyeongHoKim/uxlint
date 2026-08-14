/**
 * CI Runner
 * Runs UX analysis without UI for CI/CD environments
 *
 * @packageDocumentation
 */

import {writeTerminalMessage} from './infrastructure/console-output.js';
import {logger} from './infrastructure/logger.js';
import type {AnalysisStage} from './models/analysis.js';
import type {UxLintConfig} from './models/config.js';
import {evaluateGate, renderGateVerdict} from './models/gate-result.js';
import {getAIService as defaultGetAIService} from './services/ai-service.js';
import {
	reportBuilder as defaultReportBuilder,
	type ReportBuilder,
} from './services/report-builder.js';

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
 * Collaborators the runner needs, injectable so the exit status can be
 * asserted without a model, a browser, or a live MCP transport.
 */
export type CIAnalysisDependencies = {
	getAIService: typeof defaultGetAIService;
	reportBuilder: ReportBuilder;

	/**
	 * Where the gate verdict goes.
	 *
	 * Injected so a test can assert the verdict is written after the report
	 * and after the MCP transport closes. That ordering is load-bearing —
	 * stdout belongs to the MCP protocol while the transport is open — and it
	 * must not rest on convention.
	 */
	emitVerdict?: (verdict: string) => void;
};

/**
 * Write the gate verdict to stdout.
 *
 * Routed through the one module allowed to touch stdout, and called only
 * after `aiService.close()` — see `console-output.ts` for why that timing is
 * what makes it legal.
 */
function defaultEmitVerdict(verdict: string): void {
	writeTerminalMessage(verdict);
}

const defaultDependencies: CIAnalysisDependencies = {
	getAIService: defaultGetAIService,
	reportBuilder: defaultReportBuilder,
	emitVerdict: defaultEmitVerdict,
};

/**
 * Run analysis in CI mode without any UI
 *
 * Returns the process exit code rather than calling `process.exit` itself.
 * Terminating from in here made the decision untestable — asserting on an
 * exit status meant killing the test process — and it also left no room for
 * the caller to print anything after the MCP transport closes.
 *
 * All logging goes to log files only; the caller owns stdout.
 *
 * @param config - Validated configuration for this run
 * @param dependencies - Injectable collaborators; defaults to the singletons
 * @returns `0` when the run completed, `1` when it failed
 */
export async function runCIAnalysis(
	config: UxLintConfig,
	dependencies: CIAnalysisDependencies = defaultDependencies,
): Promise<number> {
	const {
		getAIService,
		reportBuilder,
		emitVerdict = defaultEmitVerdict,
	} = dependencies;
	const {pages} = config;
	const totalPages = pages.length;
	const startTime = Date.now();

	logger.info('CI analysis started', {
		totalPages,
		mainPageUrl: config.mainPageUrl,
		reportOutput: config.report.output,
	});

	// Held outside the try so the finally can close it. Anything that throws
	// after the service exists -- a page analysis, saving the report -- used to
	// return straight from the catch and leave the MCP transport and its
	// browser alive for the life of the process.
	let aiService: Awaited<ReturnType<typeof getAIService>> | undefined;

	try {
		// Get AI Service instance
		logger.debug('Initializing AI service');
		aiService = await getAIService(config);
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
			const analysis = await aiService.analyzePage(
				config,
				page,
				progressCallback,
			);

			const pageDuration = Date.now() - pageStartTime;
			logger.info('Page analysis completed', {
				pageNumber: currentPage,
				totalPages,
				url: page.url,
				durationMs: pageDuration,
				status: analysis.status,
				error: analysis.error,
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
			analyzedPages: report.metadata.analyzedPages.length,
			partialPages: report.metadata.partialPages.length,
			failedPages: report.metadata.failedPages.length,
		});

		// Cleanup. This must happen before the verdict is emitted: stdout
		// belongs to the MCP protocol until the transport is shut down.
		logger.debug('Cleaning up AI service');
		await aiService.close();
		aiService = undefined;

		const gate = evaluateGate(report, config.thresholds);
		const verdict = renderGateVerdict(gate);

		logger.info('Gate evaluated', {
			passed: gate.passed,
			breaches: gate.breaches.length,
			evaluated: gate.evaluated.length,
			analyzedNothing: gate.analyzedNothing,
		});

		if (verdict) {
			emitVerdict(verdict);
		}

		return gate.passed ? 0 : 1;
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

		return 1;
	} finally {
		// Only reached when the happy path did not already close it.
		if (aiService) {
			logger.debug('Closing AI service after a failed run');
			await aiService.close();
		}
	}
}
