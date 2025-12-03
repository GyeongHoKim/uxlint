/**
 * Analysis State Contract
 * Defines the extended AnalysisState interface with LLM response display support
 *
 * @packageDocumentation
 */

import type {LLMResponseData} from './llm-response-contract.js';

/**
 * Analysis stages (existing type reference)
 */
export type AnalysisStage =
	| 'idle'
	| 'navigating'
	| 'capturing'
	| 'analyzing'
	| 'generating-report'
	| 'complete'
	| 'error';

/**
 * Page analysis result (existing type reference)
 */
export type PageAnalysis = {
	pageUrl: string;
	features: string;
	snapshot: string;
	findings: unknown[];
	analysisTimestamp: number;
	status: string;
	error?: string;
};

/**
 * Extended AnalysisState with LLM response display support
 *
 * This type extends the existing AnalysisState to include
 * LLM response data for real-time display in the UI.
 */
export type AnalysisStateExtended = {
	/**
	 * Index of currently processing page (0-based)
	 */
	currentPageIndex: number;

	/**
	 * Total number of pages to analyze
	 */
	totalPages: number;

	/**
	 * Current processing stage
	 */
	currentStage: AnalysisStage;

	/**
	 * Completed/failed analyses (accumulates)
	 */
	analyses: PageAnalysis[];

	/**
	 * Fatal error that aborts entire analysis
	 */
	error?: Error;

	/**
	 * NEW: Last LLM response data for UI display
	 * Contains text, tool calls, and metadata from the most recent LLM call
	 */
	lastLLMResponse?: LLMResponseData;

	/**
	 * NEW: Waiting message to display during LLM call
	 * Humorous/informative message shown while waiting for response
	 */
	waitingMessage?: string;

	/**
	 * NEW: Current iteration in the agent loop
	 */
	currentIteration?: number;

	/**
	 * NEW: Whether currently waiting for LLM response
	 * True when generateText() is being awaited
	 */
	isWaitingForLLM?: boolean;
};

/**
 * Extended AnalysisProgressProps with LLM response display support
 */
export type AnalysisProgressPropsExtended = {
	/** Theme for styling */
	readonly theme: unknown; // ThemeConfig

	/** Current analysis stage */
	readonly stage: AnalysisStage;

	/** Current page index (1-based) */
	readonly currentPage: number;

	/** Total number of pages */
	readonly totalPages: number;

	/** Optional page URL being analyzed */
	readonly pageUrl?: string;

	/** Optional error message */
	readonly error?: string;

	/**
	 * NEW: Last LLM response to display
	 * Shows what the AI responded with
	 */
	readonly lastLLMResponse?: LLMResponseData;

	/**
	 * NEW: Waiting message during LLM call
	 * Humorous message shown while waiting
	 */
	readonly waitingMessage?: string;

	/**
	 * NEW: Whether currently waiting for LLM response
	 */
	readonly isWaitingForLLM?: boolean;

	/**
	 * NEW: Current iteration number
	 */
	readonly currentIteration?: number;
};

/**
 * Extended analysis progress callback type with LLM response support
 */
export type AnalysisProgressCallbackExtended = (
	stage: AnalysisStage,
	message?: string,
	llmResponse?: LLMResponseData,
) => void;
