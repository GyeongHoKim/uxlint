/**
 * Measurement domain model
 *
 * What a deterministic audit and a performance trace produce for one page,
 * and the rule that turns an audit's impact rating into a finding severity.
 *
 * The analysis used to be asked to judge accessibility and performance from
 * an accessibility-tree text, which contains neither contrast ratios nor
 * paint timings. Judgement was demanded without measurement, so it was
 * invented. These types are the measurement.
 *
 * @packageDocumentation
 */

import type {FindingSeverity} from './analysis.js';

/**
 * Why a measurement is missing.
 *
 * Absence carries a reason because the report has to say *why* a number is
 * not there. "Audited and clean" and "never audited" read identically as a
 * blank, and a blank reads as a pass.
 */
export type NotTakenReason =
	/** The page never loaded, so there was nothing to measure */
	| 'page-not-loaded'
	/** The tool reported failure */
	| 'tool-failed'
	/** The measurement was abandoned at its time bound */
	| 'timed-out'
	/** The reply or the report could not be read */
	| 'unparseable';

/**
 * A value that was measured, or an account of why it was not.
 *
 * `T | undefined` cannot distinguish the three states of FR-006. This can, and
 * it wraps individual metrics as well as whole measurements: a trace can
 * succeed and still report no Largest Contentful Paint, which is `taken` at
 * the trace level and `not-taken` at the metric level.
 */
export type Measured<T> =
	{state: 'taken'; value: T} | {state: 'not-taken'; reason: NotTakenReason};

/**
 * Build a taken measurement.
 *
 * @param value - What was measured
 * @returns The measurement
 */
export function taken<T>(value: T): Measured<T> {
	return {state: 'taken', value};
}

/**
 * Build a missing measurement.
 *
 * @param reason - Why it is missing
 * @returns The measurement
 */
export function notTaken<T>(reason: NotTakenReason): Measured<T> {
	return {state: 'not-taken', reason};
}

/**
 * How badly a rule's failure affects a user, as the audit rates it.
 *
 * These are the audit's own words, not this project's. Mapping them rather
 * than renaming them is what keeps the severity of a measured finding
 * traceable to something outside our own judgement.
 */
export type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor';

/**
 * The severity a given impact becomes.
 *
 * Written as a total `Record` rather than a `switch` with a default, so that
 * an impact value this table does not know fails to compile instead of
 * quietly becoming `low`. Verified against real audit output: `color-contrast`
 * arrives as serious, `image-alt` as critical, `landmark-one-main` as
 * moderate.
 */
export const impactToSeverity: Record<AxeImpact, FindingSeverity> = {
	critical: 'critical',
	serious: 'high',
	moderate: 'medium',
	minor: 'low',
};

/**
 * Whether a value is an impact rating this project can map.
 *
 * An audit arriving without one is skipped rather than defaulted: there is no
 * basis for a severity, and inventing one is the guessing this whole feature
 * exists to remove.
 *
 * @param value - Whatever the report carried
 * @returns Whether it is a known impact
 */
export function isAxeImpact(value: unknown): value is AxeImpact {
	return typeof value === 'string' && Object.hasOwn(impactToSeverity, value);
}

/**
 * One accessibility rule that failed on one page.
 */
export type Violation = {
	/** The audit's rule id, e.g. `color-contrast` */
	ruleId: string;

	/** The audit's own title, carried unaltered */
	title: string;

	/** The audit's impact rating, and the sole input to severity */
	impact: AxeImpact;

	/** How many elements the rule failed on; always at least one */
	affectedElements: number;
};

/**
 * What the audit found on one page.
 */
export type AuditResult = {
	/** Category scores from 0 to 100, keyed by the audit's own category id */
	scores: Record<string, number>;

	/** Every accessibility rule that failed */
	violations: Violation[];

	/**
	 * Whether the companion scores were taken without reloading the page.
	 *
	 * Always true here. Recorded rather than assumed because that mode
	 * degrades the SEO, best-practices and agentic-browsing numbers -- they
	 * skip the audits that need a navigation -- and a reader must not compare
	 * them against a full-navigation score. Accessibility is unaffected.
	 */
	snapshotMode: boolean;
};

/**
 * What the performance trace measured on one page.
 *
 * There is no First Contentful Paint. The trace does not report one as an
 * observed metric; the only FCP figure it carries is a projected saving from
 * a suggested fix, and publishing that as the page's FCP would fabricate
 * precisely the kind of number this feature was written to delete.
 */
export type TraceResult = {
	/** Largest Contentful Paint, in milliseconds */
	largestContentfulPaint: Measured<number>;

	/** Cumulative Layout Shift, unitless */
	cumulativeLayoutShift: Measured<number>;
};

/**
 * Everything measured for one page.
 *
 * The two are wrapped independently because one can succeed while the other
 * fails, and the report must be able to say which.
 */
export type PageMeasurement = {
	audit: Measured<AuditResult>;
	trace: Measured<TraceResult>;
};

/**
 * A page for which nothing was measured.
 *
 * @param reason - Why nothing was measured
 * @returns A measurement recording that absence for both parts
 */
export function noMeasurement(reason: NotTakenReason): PageMeasurement {
	return {audit: notTaken(reason), trace: notTaken(reason)};
}
