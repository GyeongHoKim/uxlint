/**
 * CI gate evaluation result
 *
 * The verdict a run is judged by: which thresholds were checked, which were
 * breached, and whether the run may pass.
 *
 * @packageDocumentation
 */

import type {FindingSeverity, UxReport} from './analysis.js';
import {
	defaultFailOnFailedPage,
	defaultFailOnPartialPage,
	severityThresholdKeys,
	type Thresholds,
} from './thresholds.js';

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

	/**
	 * Pages cut short before finishing, listed whether or not they were gated
	 * on. Hiding them from a passing run would make the pass look better
	 * founded than it is.
	 */
	partialPages: AffectedPage[];

	/**
	 * Pages that could not be analysed, with their recorded reasons, listed
	 * whether or not they were gated on.
	 */
	failedPages: AffectedPage[];
};

/**
 * Severities in the order a reader wants them: worst first.
 *
 * Fixed here rather than derived from the config file's key order, so the
 * output does not change shape because someone reordered their YAML.
 */
const severityOrder: FindingSeverity[] = ['critical', 'high', 'medium', 'low'];

/**
 * Count findings by severity.
 *
 * Reads `prioritizedFindings` rather than re-walking `report.pages` so the
 * gate counts exactly what the report's own statistics table shows. A gate
 * that disagrees with the document it gates on would be its own bug class.
 */
function countBySeverity(report: UxReport): Record<FindingSeverity, number> {
	const counts: Record<FindingSeverity, number> = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
	};

	for (const finding of report.prioritizedFindings) {
		counts[finding.severity] += 1;
	}

	return counts;
}

/**
 * Judge a completed run against the configured thresholds.
 *
 * Pure: takes data, returns a verdict, touches nothing. That is what lets the
 * exit decision be tested without a model, a browser or a live process.
 *
 * An absent `thresholds` gates nothing and always passes, so adding this
 * feature cannot change the outcome of a pipeline that has not opted in.
 *
 * @param report - The completed report for this run
 * @param thresholds - The user's declared limits, or `undefined` when the gate is off
 * @returns The verdict, including every threshold checked and every one breached
 *
 * @example
 * ```typescript
 * const result = evaluateGate(report, {maxCritical: 0});
 * process.exit(result.passed ? 0 : 1);
 * ```
 */
export function evaluateGate(
	report: UxReport,
	thresholds: Thresholds | undefined,
): GateResult {
	const {metadata} = report;

	if (!thresholds) {
		// The gate did not run, so it observed nothing — including the coverage
		// lists. Reporting pages here would put new text on the stdout of every
		// pipeline that has not opted in, which is exactly what FR-004 forbids.
		return {
			passed: true,
			breaches: [],
			evaluated: [],
			analyzedNothing: false,
			partialPages: [],
			failedPages: [],
		};
	}

	const partialPages: AffectedPage[] = metadata.partialPages.map(pageUrl => ({
		pageUrl,
	}));
	const failedPages: AffectedPage[] = metadata.failedPages.map(pageUrl => ({
		pageUrl,
		error: report.pages.find(page => page.pageUrl === pageUrl)?.error,
	}));

	// "Nothing was analysed" means every page that was attempted ended in
	// failure. The third clause is what makes an all-failed run distinguishable
	// from an empty one; config validation happens to guarantee it today, but
	// the rule must not lean on a promise kept somewhere else.
	const analyzedNothing =
		metadata.analyzedPages.length === 0 &&
		metadata.partialPages.length === 0 &&
		report.pages.length > 0;

	const counts = countBySeverity(report);
	const evaluated: EvaluatedThreshold[] = [];
	const breaches: Breach[] = [];

	for (const severity of severityOrder) {
		const limit = thresholds[severityThresholdKeys[severity]];

		if (limit === undefined) {
			continue;
		}

		const count = counts[severity];
		evaluated.push({severity, limit, count});

		// Strictly greater: the limit is an inclusive maximum, so a count equal
		// to it passes.
		if (count > limit) {
			breaches.push({kind: 'severity', severity, limit, count});
		}
	}

	if (
		(thresholds.failOnPartialPage ?? defaultFailOnPartialPage) &&
		metadata.partialPages.length > 0
	) {
		breaches.push({kind: 'partial-pages', pages: partialPages});
	}

	if (
		(thresholds.failOnFailedPage ?? defaultFailOnFailedPage) &&
		metadata.failedPages.length > 0
	) {
		breaches.push({kind: 'failed-pages', pages: failedPages});
	}

	return {
		passed: breaches.length === 0 && !analyzedNothing,
		breaches,
		evaluated,
		analyzedNothing,
		partialPages,
		failedPages,
	};
}

/** Width the severity column is padded to, so counts line up in a log. */
const labelWidth = 10;

/** Indent for the page URLs listed under a coverage line. */
const pageIndent = ' '.repeat(labelWidth + 4);

/**
 * "1 page" / "3 pages", so the log reads as prose rather than as a template.
 */
function pluralPages(count: number): string {
	return `${count} page${count === 1 ? '' : 's'}`;
}

/**
 * Render one evaluated threshold as a single log line.
 */
function renderThresholdLine({
	severity,
	limit,
	count,
}: EvaluatedThreshold): string {
	return `  ${severity.padEnd(labelWidth)}${count} findings, limit ${limit}`;
}

/**
 * Render a gate verdict for the CI log.
 *
 * Returns an empty string when nothing was gated: printing a summary for a
 * run with no thresholds would imply a gate that does not exist.
 *
 * Passing runs still list what was evaluated. A green log that says nothing
 * is indistinguishable from one where the gate was misconfigured into doing
 * nothing, which is the failure the whole feature guards against.
 *
 * @param result - The verdict to render
 * @returns Text for the CI log, or `''` when no threshold was evaluated
 */
export function renderGateVerdict(result: GateResult): string {
	if (
		result.evaluated.length === 0 &&
		result.breaches.length === 0 &&
		!result.analyzedNothing &&
		result.partialPages.length === 0 &&
		result.failedPages.length === 0
	) {
		return '';
	}

	const lines: string[] = [
		`uxlint: gate ${result.passed ? 'passed' : 'failed'}`,
		'',
	];

	const breachedSeverities = new Set(
		result.breaches
			.filter(breach => breach.kind === 'severity')
			.map(breach => breach.severity),
	);

	for (const breach of result.breaches) {
		if (breach.kind === 'severity') {
			lines.push(
				renderThresholdLine({
					severity: breach.severity,
					limit: breach.limit,
					count: breach.count,
				}),
			);
		}
	}

	// Thresholds that held are listed after the ones that did not, so the
	// reason for a failure is at the top where it will be read.
	for (const entry of result.evaluated) {
		if (!breachedSeverities.has(entry.severity)) {
			lines.push(renderThresholdLine(entry));
		}
	}

	// Coverage is reported whether or not it was gated on. A run that passed
	// only because a page failed to load should not look like a clean run.
	if (result.partialPages.length > 0) {
		lines.push(
			`  ${'partial'.padEnd(labelWidth)}${pluralPages(
				result.partialPages.length,
			)} not fully analysed`,
			...result.partialPages.map(page => `${pageIndent}${page.pageUrl}`),
		);
	}

	if (result.failedPages.length > 0) {
		lines.push(
			`  ${'failed'.padEnd(labelWidth)}${pluralPages(
				result.failedPages.length,
			)} could not be analysed`,
			...result.failedPages.map(
				page =>
					`${pageIndent}${page.pageUrl}${page.error ? ` — ${page.error}` : ''}`,
			),
		);
	}

	if (result.analyzedNothing) {
		lines.push(
			'',
			'  no page was analysed successfully — the report is not evidence of anything',
		);
	}

	return lines.join('\n');
}
