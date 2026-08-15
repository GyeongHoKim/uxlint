/**
 * UseAnalysis Hook
 * Thin wrapper around AIService singleton for React state management
 *
 * @packageDocumentation
 */

import {useCallback, useRef, useState} from 'react';
import {logger} from '../infrastructure/logger.js';
import type {AnalysisStage, AnalysisState} from '../models/analysis.js';
import {
	describeSandboxRelaxation,
	describeUnmetRequirement,
	type PreflightVerdict,
} from '../models/browser-preflight.js';
import {BrowserPreflightError} from '../models/errors.js';
import {runPreflight as defaultRunPreflight} from '../services/browser-preflight.js';
import {browserServerIdentity} from '../services/mcp-client.js';
import {evaluateGate} from '../models/gate-result.js';
import type {UxLintConfig} from '../models/config.js';
import type {LLMResponseData} from '../models/llm-response.js';
import {
	getAIService as defaultGetAIService,
	type AIService,
} from '../services/ai-service.js';
import {
	reportBuilder as defaultReportBuilder,
	type ReportBuilder,
} from '../services/report-builder.js';

/**
 * State change callback type
 */
type AnalysisStateChangeCallback = (analysisState: AnalysisState) => void;

/**
 * UseAnalysis Hook Result
 */
export type UseAnalysisResult = {
	/** Current analysis state */
	analysisState: AnalysisState;

	/** Start the analysis workflow */
	runAnalysis: () => Promise<void>;

	/** Get current page URL being analyzed */
	getCurrentPageUrl: () => string | undefined;

	/** Subscribe to state changes */
	onAnalysisStateChange: (callback: AnalysisStateChangeCallback) => () => void;
};

/**
 * UseAnalysis Hook
 * Manages analysis state and delegates to AIService
 *
 * @param config - UxLint configuration
 * @param getAIService - Optional function to get AIService instance (for testing)
 * @param reportBuilder - Optional ReportBuilder instance (for testing, defaults to singleton)
 * @param runPreflight - Optional browser preflight check (for testing, defaults to the real probe)
 * @returns Analysis state and control functions
 */
export function useAnalysis(
	config: UxLintConfig,
	getAIService: (
		config: UxLintConfig,
		verdict: PreflightVerdict,
	) => Promise<AIService> = defaultGetAIService,
	reportBuilder: ReportBuilder = defaultReportBuilder,
	runPreflight: (
		settings: UxLintConfig['browser'],
	) => Promise<PreflightVerdict> = defaultRunPreflight,
): UseAnalysisResult {
	const [analysisState, setAnalysisState] = useState<AnalysisState>({
		currentPageIndex: 0,
		totalPages: config.pages.length,
		currentStage: 'idle',
		analyses: [],
		error: undefined,
		finalReport: undefined,
	});

	// Track state change subscribers
	const subscribersRef = useRef<Set<AnalysisStateChangeCallback>>(new Set());

	/**
	 * Update state and notify subscribers
	 */
	const updateAnalysisState = useCallback(
		(updater: (previous: AnalysisState) => AnalysisState) => {
			setAnalysisState(previous => {
				const newState = updater(previous);

				// Notify all subscribers synchronously with the new state
				// This happens during the state update, so subscribers get the new state immediately
				for (const callback of subscribersRef.current) {
					callback(newState);
				}

				return newState;
			});
		},
		[],
	);

	/**
	 * Get current page URL
	 */
	const getCurrentPageUrl = useCallback((): string | undefined => {
		const page = config.pages[analysisState.currentPageIndex];
		return page?.url;
	}, [config.pages, analysisState.currentPageIndex]);

	/**
	 * Subscribe to state changes
	 */
	const subscribe = useCallback((callback: AnalysisStateChangeCallback) => {
		subscribersRef.current.add(callback);

		// Return unsubscribe function
		return () => {
			subscribersRef.current.delete(callback);
		};
	}, []);

	/**
	 * Run analysis workflow
	 * Uses AIService singleton with Manual Agent Loop pattern
	 */
	const runAnalysis = useCallback(async () => {
		// Held outside the try so the finally can close the same instance. The
		// old code re-fetched it from getAIService there, which builds a fresh
		// MCP client -- and therefore spawns a browser -- if the cache has been
		// evicted, just to close it again.
		let aiService: AIService | undefined;

		try {
			// Preflight before the service exists, so an environment that cannot
			// run a browser costs no model usage here either -- SC-003 applies to
			// the interactive path as much as to CI.
			const preflight = await runPreflight(config.browser);

			if (preflight.kind === 'unmet') {
				throw new BrowserPreflightError(
					describeUnmetRequirement(preflight.requirement),
				);
			}

			if (preflight.kind === 'ready-without-sandbox') {
				logger.warn('Sandbox relaxation', {cause: preflight.cause});
				updateAnalysisState(previous => ({
					...previous,
					notice: describeSandboxRelaxation(preflight.cause),
				}));
			}

			const server = browserServerIdentity();
			reportBuilder.setProvenance({
				browserServer: server.name,
				browserServerVersion: server.version,
				browserVersion: preflight.browser.version,
				externalDataConsulted: config.browser?.allowExternalData ?? false,
			});

			// Get AI Service instance (lazy initialization)
			aiService = await getAIService(config, preflight);

			// Process each page sequentially - await in loop is intentional
			for (let i = 0; i < config.pages.length; i++) {
				const page = config.pages[i];

				if (!page) {
					continue;
				}

				// Update state - navigating
				// Reset iteration state for new page
				updateAnalysisState(previous => ({
					...previous,
					currentPageIndex: i,
					currentStage: 'navigating',
					currentIteration: undefined,
					lastLLMResponse: undefined,
				}));

				// Analyze page with progress callback
				// eslint-disable-next-line no-await-in-loop
				const pageAnalysis = await aiService.analyzePage(
					config,
					page,
					(
						stage: AnalysisStage,
						message?: string,
						llmResponse?: LLMResponseData,
					) => {
						updateAnalysisState(previous => {
							const updates: Partial<AnalysisState> = {
								currentStage: stage,
							};

							// Handle LLM response
							if (llmResponse) {
								logger.info('Updating state with llmResponse', {
									iteration: llmResponse.iteration,
									previousIteration: previous.currentIteration,
									pageIndex: previous.currentPageIndex,
								});
								updates.lastLLMResponse = llmResponse;
								updates.currentIteration = llmResponse.iteration;
								updates.isWaitingForLLM = false;
								updates.waitingMessage = undefined;
							} else if (message) {
								// Waiting message provided but no LLM response yet
								updates.waitingMessage = message;
								updates.isWaitingForLLM = true;

								// Preserve lastLLMResponse and currentIteration
								// Explicitly preserve to avoid React batching issues
								if (previous.lastLLMResponse) {
									updates.lastLLMResponse = previous.lastLLMResponse;
								}

								if (previous.currentIteration !== undefined) {
									updates.currentIteration = previous.currentIteration;
								}
							}

							return {
								...previous,
								...updates,
							};
						});
					},
				);

				// Update state with analysis result
				updateAnalysisState(previous => ({
					...previous,
					analyses: [...previous.analyses, pageAnalysis],
				}));
			}

			// Generate report
			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'generating-report',
				waitingMessage: undefined,
				isWaitingForLLM: false,
			}));

			// Get report builder and save report
			const report = reportBuilder.generateFinalReport();

			logger.info('Report generation started', {
				outputPath: config.report.output,
				totalFindings: report.metadata.totalFindings,
				pagesAnalyzed: report.metadata.analyzedPages.length,
			});

			// Save report to file using ReportBuilder
			await reportBuilder.saveReport(config.report.output);

			logger.info('Report saved successfully', {
				outputPath: config.report.output,
			});

			// Evaluate the gate for display only. Interactive mode never changes
			// its exit status on a breach: a person watching a terminal is not a
			// pipeline, and they can see the findings for themselves. Showing the
			// verdict exists so the two modes cannot disagree about what a
			// configured threshold means.
			const gateResult = evaluateGate(report, config.thresholds);

			logger.info('Gate evaluated (interactive, advisory only)', {
				passed: gateResult.passed,
				breaches: gateResult.breaches.length,
			});

			// Shut the transport down before publishing the terminal state.
			// Doing it after lets the UI reach its exit path first and leave the
			// MCP subprocess behind.
			await aiService.close();
			aiService = undefined;

			// Update state to complete with final report
			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'complete',
				finalReport: report,
				gateResult,
				waitingMessage: undefined,
				isWaitingForLLM: false,
			}));
		} catch (error) {
			const analysisError =
				error instanceof Error ? error : new Error('Unknown error');

			logger.error('Analysis failed', {
				error: analysisError.message,
				stack: analysisError.stack,
				reportOutput: config.report.output,
			});

			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'error',
				error: analysisError,
				finalReport: undefined,
			}));
		} finally {
			// Only reached when the happy path did not already close it.
			if (aiService) {
				await aiService.close();
			}
		}
	}, [config, updateAnalysisState, getAIService, reportBuilder, runPreflight]);

	return {
		analysisState,
		runAnalysis,
		getCurrentPageUrl,
		onAnalysisStateChange: subscribe,
	};
}
