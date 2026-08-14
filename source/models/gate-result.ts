/**
 * CI gate evaluation result
 *
 * The verdict a run is judged by: which thresholds were checked, which were
 * breached, and whether the run may pass.
 *
 * @packageDocumentation
 */

import type {FindingSeverity} from './analysis.js';

/**
 * A page that could not be fully analysed, with the reason where one exists.
 */
export type AffectedPage = {
	/** URL of the page */
	pageUrl: string;

	/** Recorded failure reason; absent for pages that were merely cut short */
	error?: string;
};

/**
 * A single violated rule.
 *
 * Each breach has to explain itself in one line of CI log, because the
 * developer whose build broke reads the log, not the report file.
 */
export type Breach =
	| {
			kind: 'severity';
			severity: FindingSeverity;
			/** The configured maximum */
			limit: number;
			/** What the run actually produced */
			count: number;
	  }
	| {
			kind: 'partial-pages' | 'failed-pages';
			pages: AffectedPage[];
	  };

/**
 * One threshold that was checked, breached or not.
 */
export type EvaluatedThreshold = {
	severity: FindingSeverity;
	limit: number;
	count: number;
};

/**
 * The gate's verdict on a run.
 */
export type GateResult = {
	/** Whether the run may pass. Drives the exit status */
	passed: boolean;

	/**
	 * Every violated rule, not just the first — a developer fixing one breach
	 * should not have to rerun to discover the next.
	 */
	breaches: Breach[];

	/**
	 * Every threshold that was checked, including those that passed.
	 *
	 * Without this a green log is indistinguishable from one where the gate
	 * was silently misconfigured, which is the failure mode the whole
	 * unknown-key rejection exists to prevent.
	 */
	evaluated: EvaluatedThreshold[];

	/**
	 * True when no page completed or partially completed.
	 *
	 * Separate from the coverage breaches because this fails the run
	 * regardless of configuration; folding it into a breach kind would let a
	 * user switch it off.
	 */
	analyzedNothing: boolean;
};
