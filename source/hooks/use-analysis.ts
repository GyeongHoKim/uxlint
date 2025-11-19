/**
 * UseAnalysis Hook
 * Thin wrapper around AnalysisOrchestrator for React state management
 *
 * @packageDocumentation
 */

import {useState, useCallback, useRef} from 'react';
import type {UxLintConfig} from '../models/config.js';
import type {AnalysisState} from '../models/analysis.js';
import {AnalysisOrchestrator} from '../services/analysis-orchestrator.js';

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
 * Manages analysis state and delegates to AnalysisOrchestrator
 *
 * @param config - UxLint configuration
 * @returns Analysis state and control functions
 */
export function useAnalysis(config: UxLintConfig): UseAnalysisResult {
	// Initialize state
	const [analysisState, setAnalysisState] = useState<AnalysisState>({
		currentPageIndex: 0,
		totalPages: config.pages.length,
		currentStage: 'idle',
		analyses: [],
		report: undefined,
		error: undefined,
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

				// Notify all subscribers
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
	 * Delegates to AnalysisOrchestrator service
	 */
	const runAnalysis = useCallback(async () => {
		const orchestrator = new AnalysisOrchestrator();

		try {
			// Update state based on progress
			const report = await orchestrator.analyzePages(config, progress => {
				updateAnalysisState(previous => ({
					...previous,
					currentPageIndex: progress.currentPageIndex,
					currentStage: progress.stage,
				}));
			});

			// Complete
			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'complete',
				report,
			}));
		} catch (error) {
			// Fatal error - log for debugging
			const analysisError =
				error instanceof Error ? error : new Error('Unknown error');

			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'error',
				error: analysisError,
			}));
		}
	}, [config, updateAnalysisState]);

	return {
		analysisState,
		runAnalysis,
		getCurrentPageUrl,
		onAnalysisStateChange: subscribe,
	};
}
