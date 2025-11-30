/**
 * Analysis Domain Model
 * Core entities for AI-powered UX evaluation
 *
 * @packageDocumentation
 */

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
	 * Accessibility tree JSON from Playwright MCP
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
	 * Final report (undefined until complete)
	 */
	report?: UxReport;

	/**
	 * Fatal error that aborts entire analysis
	 */
	error?: Error;
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
 *   console.log(`Found ${analysis.findings.length} issues`);
 * }
 * ```
 */
export function isPageAnalysisComplete(analysis: PageAnalysis): boolean {
	return analysis.status === 'complete' && analysis.findings.length >= 0;
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
 *   console.error(`Analysis failed: ${analysis.error}`);
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
 * @returns true if analysis is complete with report generated
 *
 * @example
 * ```typescript
 * if (isAnalysisComplete(state)) {
 *   await writeReportToFile(state.report!);
 * }
 * ```
 */
export function isAnalysisComplete(state: AnalysisState): boolean {
	return state.currentStage === 'complete' && state.report !== undefined;
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
	return ['navigating', 'capturing', 'analyzing', 'generating-report'].includes(
		state.currentStage,
	);
}
