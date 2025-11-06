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
type StateChangeCallback = (state: AnalysisState) => void;

/**
 * UseAnalysis Hook Result
 */
export type UseAnalysisResult = {
	/** Current analysis state */
	state: AnalysisState;

	/** Start the analysis workflow */
	runAnalysis: () => Promise<void>;

	/** Get current page URL being analyzed */
	getCurrentPageUrl: () => string | undefined;

	/** Subscribe to state changes */
	onStateChange: (callback: StateChangeCallback) => () => void;
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
	const [state, setState] = useState<AnalysisState>({
		currentPageIndex: 0,
		totalPages: config.pages.length,
		currentStage: 'idle',
		analyses: [],
		report: undefined,
		error: undefined,
	});

	// Track state change subscribers
	const subscribersRef = useRef<Set<StateChangeCallback>>(new Set());

	/**
	 * Update state and notify subscribers
	 */
	const updateState = useCallback(
		(updater: (previous: AnalysisState) => AnalysisState) => {
			setState(previous => {
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
		const page = config.pages[state.currentPageIndex];
		return page?.url;
	}, [config.pages, state.currentPageIndex]);

	/**
	 * Subscribe to state changes
	 */
	const onStateChange = useCallback((callback: StateChangeCallback) => {
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
				updateState(previous => ({
					...previous,
					currentPageIndex: progress.currentPageIndex,
					currentStage: progress.stage,
				}));
			});

			// Complete
			updateState(previous => ({
				...previous,
				currentStage: 'complete',
				report,
			}));
		} catch (error) {
			// Fatal error - log for debugging
			const analysisError =
				error instanceof Error ? error : new Error('Unknown error');
			console.error('[useAnalysis] Analysis failed:', analysisError);

			updateState(previous => ({
				...previous,
				currentStage: 'error',
				error: analysisError,
			}));
		}
	}, [config, updateState]);

	return {
		state,
		runAnalysis,
		getCurrentPageUrl,
		onStateChange,
	};
}
