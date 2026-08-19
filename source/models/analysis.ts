/**
 * Analysis Domain Model
 * Core entities for AI-powered UX evaluation
 *
 * @packageDocumentation
 */

import type {GateResult} from './gate-result.js';
import type {LLMResponseData} from './llm-response.js';
import type {PageMeasurement} from './measurement.js';

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

	/**
	 * What was measured for this page, and what was not.
	 *
	 * Required, so that a page cannot exist without an answer to "was this
	 * measured?". An optional field would let the first page built without one
	 * render as neither measured nor unmeasured, which is the blank that reads
	 * as a pass.
	 */
	measurement: PageMeasurement;

	/**
	 * The model's single note about this page's measured violations.
	 *
	 * Absent when there were no violations to write about. Held apart from
	 * `findings` so that model prose can never be read as something a machine
	 * verified.
	 */
	measurementNote?: string;
};

/**
 * Finding severity levels
 * Used for prioritizing issues in reports
 */
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * What produced a finding.
 *
 * Named for the kind of evidence rather than for the tool that supplied it.
 * A reader needs to know whether a machine checked this or an AI concluded
 * it; a vendor name would answer a question nobody asked and would need
 * renaming the day the tool changed.
 *
 * `trace` is declared although nothing registers findings from traces yet:
 * vitals are reported as numbers, not as findings. It is here because this
 * union is rendered into reports that outlive the release, and widening a
 * stored format later is more expensive than one unused branch now.
 */
export type FindingOrigin = 'audit' | 'trace' | 'judgement';

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

	/**
	 * What produced this finding.
	 *
	 * Required. The whole point of the field is that a reader can tell a
	 * measured fact from a judgement, and an optional one would let a finding
	 * exist that is neither.
	 */
	origin: FindingOrigin;

	/**
	 * The rule that caught it, e.g. `color-contrast`.
	 *
	 * Present only on measured findings, and its presence is what a reader
	 * checks. A judged finding carrying one would be claiming a verification
	 * that never happened.
	 */
	ruleId?: string;

	/**
	 * How many elements the rule failed on.
	 *
	 * One rule failing on forty buttons is one problem, not forty findings.
	 */
	affectedElements?: number;
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
	 * Version of the audit engine that produced the measurements.
	 *
	 * Read from the audit's own report rather than hardcoded: the engine ships
	 * inside the browser server and moves independently of this package, so a
	 * report found weeks later could not otherwise say what judged it.
	 */
	auditEngineVersion?: string;

	/**
	 * Whether the run was permitted to consult external data sources.
	 *
	 * Named for permission, not for use: nothing here observes traffic, so a
	 * field called "consulted" would assert something this code cannot know.
	 * The question a reader of an old report needs answered is what the run
	 * was allowed to do.
	 */
	externalDataAllowed: boolean;
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
	// Between capture and judgement, because that is when it happens -- and it
	// is the longest single wait in a run, so leaving it unnamed would make a
	// working measurement indistinguishable from a hang.
	'measuring',
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
		'measuring',
		'analyzing',
		'page-complete',
		'generating-report',
	].includes(state.currentStage);
}
