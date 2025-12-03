/**
 * UseAnalysis Hook
 * Thin wrapper around AIService singleton for React state management
 *
 * @packageDocumentation
 */

import {useCallback, useRef, useState} from 'react';
import {logger} from '../infrastructure/logger.js';
import type {AnalysisStage, AnalysisState} from '../models/analysis.js';
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
 * @returns Analysis state and control functions
 */
export function useAnalysis(
	config: UxLintConfig,
	getAIService: () => Promise<AIService> = defaultGetAIService,
	reportBuilder: ReportBuilder = defaultReportBuilder,
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
		try {
			// Get AI Service instance (lazy initialization)
			const aiService = await getAIService();

			// Process each page sequentially - await in loop is intentional
			for (let i = 0; i < config.pages.length; i++) {
				const page = config.pages[i];

				if (!page) continue;

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

			// Update state to complete with final report
			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'complete',
				finalReport: report,
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
			// Cleanup AI Service
			const aiService = await getAIService();
			await aiService.close();
		}
	}, [config, updateAnalysisState, getAIService, reportBuilder]);

	return {
		analysisState,
		runAnalysis,
		getCurrentPageUrl,
		onAnalysisStateChange: subscribe,
	};
}
