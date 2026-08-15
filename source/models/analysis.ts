/**
 * Analysis Domain Model
 * Core entities for AI-powered UX evaluation
 *
 * @packageDocumentation
 */

import type {GateResult} from './gate-result.js';
import type {LLMResponseData} from './llm-response.js';

/**
 * Analysis status for a single page
 * Represents the current state of page analysis
 */
export type AnalysisStatus =
	| 'pending'
	| 'navigating'
	| 'capturing'
	| 'analyzing'
	| 'complete'
	/**
	 * The agent loop ended without the model signalling completion -- it ran
	 * out of iterations. Findings collected so far are real, but the sweep is
	 * unfinished, so this must never be reported as `complete`.
	 */
	| 'partial'
	| 'failed';

/**
 * Page analysis result
 * Contains analysis state and findings for a single web page
 */
export type PageAnalysis = {
	/**
	 * Target page URL
	 */
	pageUrl: string;

	/**
	 * Feature descriptions from config
	 */
	features: string;

	/**
	 * Accessibility tree text captured from the browser
	 */
	snapshot: string;

	/**
	 * UX issues/recommendations discovered
	 */
	findings: UxFinding[];

	/**
	 * Unix timestamp when analysis completed
	 */
	analysisTimestamp: number;

	/**
	 * Current analysis state
	 */
	status: AnalysisStatus;

	/**
	 * Error message if analysis failed
	 */
	error?: string;
};

/**
 * Finding severity levels
 * Used for prioritizing issues in reports
 */
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * UX finding (issue or recommendation)
 * Represents a single UX issue discovered during analysis
 */
export type UxFinding = {
	/**
	 * Impact level (critical/high/medium/low)
	 */
	severity: FindingSeverity;

	/**
	 * Issue category (e.g., "Accessibility", "Navigation")
	 */
	category: string;

	/**
	 * Human-readable issue description
	 */
	description: string;

	/**
	 * Persona descriptions this affects
	 */
	personaRelevance: string[];

	/**
	 * Actionable fix guidance
	 */
	recommendation: string;

	/**
	 * Page where issue was found
	 */
	pageUrl: string;
};

/**
 * Report metadata
 * Provides context about report generation
 */
export type ReportMetadata = {
	/**
	 * Unix timestamp when report was generated
	 */
	timestamp: number;

	/**
	 * URLs successfully analyzed
	 */
	analyzedPages: string[];

	/**
	 * URLs whose analysis was cut short before the model signalled completion
	 */
	partialPages: string[];

	/**
	 * URLs that failed analysis (with reasons)
	 */
	failedPages: string[];

	/**
	 * Total count of UxFindings across all pages
	 */
	totalFindings: number;

	/**
	 * Persona description from config
	 */
	persona: string;

	/**
	 * What produced this report.
	 *
	 * The only field this feature adds. A report found weeks later has to be
	 * able to explain itself: without it, a difference between two reports
	 * cannot be attributed to the site rather than to a changed toolchain.
	 */
	tooling: RunProvenance;
};

/**
 * Identity of the tooling behind a run.
 */
export type RunProvenance = {
	/** Package that provided the browser server */
	browserServer: string;

	/** Exact pinned version of that package */
	browserServerVersion: string;

	/** Version banner of the browser that actually ran */
	browserVersion: string;

	/**
	 * Whether the run was permitted to consult external data sources.
	 *
	 * Records the setting rather than an observation of traffic, because the
	 * question a reader of an old report needs answered is what this run was
	 * allowed to do.
	 */
	externalDataConsulted: boolean;
};

/**
 * Complete UX report
 * Aggregates all analysis results
 */
export type UxReport = {
	/**
	 * Report generation metadata
	 */
	metadata: ReportMetadata;

	/**
	 * All page analyses (successful and failed)
	 */
	pages: PageAnalysis[];

	/**
	 * Executive summary of overall findings
	 */
	summary: string;

	/**
	 * All findings sorted by severity
	 */
	prioritizedFindings: UxFinding[];
};

/**
 * Analysis stage for progress tracking
 * Used by React components to display current operation
 */
const analysisStages = [
	'idle',
	'navigating',
	'capturing',
	'analyzing',
	'page-complete',
	'generating-report',
	'complete',
	'error',
] as const;
export type AnalysisStage = (typeof analysisStages)[number];

/**
 * Analysis state for React hooks
 * Tracks progress during multi-page analysis
 */
export type AnalysisState = {
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
	 * Non-fatal notice the user has to see.
	 *
	 * Currently only the sandbox relaxation: the run proceeds, but a browser
	 * security protection was disabled to let it, and that cannot be silent.
	 */
	notice?: string;

	/**
	 * Last LLM response data for UI display
	 * Contains text, tool calls, and metadata from the most recent LLM call
	 */
	lastLLMResponse?: LLMResponseData;

	/**
	 * Waiting message to display during LLM call
	 * Humorous/informative message shown while waiting for response
	 */
	waitingMessage?: string;

	/**
	 * Current iteration in the agent loop
	 */
	currentIteration?: number;

	/**
	 * Whether currently waiting for LLM response
	 */
	isWaitingForLLM?: boolean;

	/**
	 * Final aggregated report once the workflow finishes
	 */
	finalReport?: UxReport;

	/**
	 * Gate verdict for the finished run.
	 *
	 * Advisory in interactive mode — it is displayed but never changes the
	 * exit status, because the person watching already sees the findings. It
	 * exists so the interactive and CI readings of a threshold agree.
	 */
	gateResult?: GateResult;
};

/**
 * Check if page analysis completed successfully
 *
 * @param analysis - Page analysis to check
 * @returns true if analysis is complete with findings
 *
 * @example
 * ```typescript
 * if (isPageAnalysisComplete(analysis)) {
 *   logger.info(`Found ${analysis.findings.length} issues`);
 * }
 * ```
 */
export function isPageAnalysisComplete(analysis: PageAnalysis): boolean {
	return analysis.status === 'complete';
}

/**
 * Check if page analysis failed
 *
 * @param analysis - Page analysis to check
 * @returns true if analysis failed with error message
 *
 * @example
 * ```typescript
 * if (isPageAnalysisFailed(analysis)) {
 *   logger.error(`Analysis failed: ${analysis.error}`);
 * }
 * ```
 */
export function isPageAnalysisFailed(analysis: PageAnalysis): boolean {
	return analysis.status === 'failed' && typeof analysis.error === 'string';
}

/**
 * Check if entire analysis workflow is complete
 *
 * @param state - Analysis state to check
 * @returns true if analysis is complete
 */
export function isAnalysisComplete(state: AnalysisState): boolean {
	return state.currentStage === 'complete';
}

/**
 * Check if analysis is currently in progress
 *
 * @param state - Analysis state to check
 * @returns true if analysis is actively processing
 *
 * @example
 * ```typescript
 * if (isAnalysisInProgress(state)) {
 *   renderProgressSpinner(state.currentStage);
 * }
 * ```
 */
export function isAnalysisInProgress(state: AnalysisState): boolean {
	return [
		'navigating',
		'capturing',
		'analyzing',
		'page-complete',
		'generating-report',
	].includes(state.currentStage);
}
