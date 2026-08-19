/**
 * Report Generator
 * Business logic for markdown report generation
 *
 * @packageDocumentation
 */

import type {
	FindingOrigin,
	FindingSeverity,
	PageAnalysis,
	UxFinding,
	UxReport,
} from '../../models/analysis.js';
import type {Measured} from '../../models/measurement.js';

/**
 * Severity emoji mapping
 */
const severityEmoji: Record<FindingSeverity, string> = {
	critical: '🔴',
	high: '🟠',
	medium: '🟡',
	low: '🟢',
};

/**
 * How each origin is named to a reader.
 *
 * The whole feature turns on this line of the report. A reader who cannot tell
 * a measured fact from an AI judgement has to treat every finding as an
 * opinion, which is what the report was worth before.
 */
const originLabel: Record<FindingOrigin, string> = {
	audit: 'measured',
	trace: 'measured',
	judgement: 'AI judgement',
};

/**
 * How a finding announces where it came from.
 *
 * A measured finding names the rule that caught it and how many elements it
 * failed on. A judged one names neither: claiming a rule id it does not have
 * would be claiming a verification that never happened.
 *
 * @param finding - The finding to describe
 * @returns The parenthesised provenance
 */
function describeOrigin(finding: UxFinding): string {
	if (finding.origin === 'judgement') {
		return `_${originLabel.judgement}_`;
	}

	const elements =
		finding.affectedElements === undefined
			? ''
			: `, ${finding.affectedElements} element${
					finding.affectedElements === 1 ? '' : 's'
				}`;

	return `\`${finding.ruleId ?? 'unknown'}\`${elements} — _${
		originLabel[finding.origin]
	}_`;
}

/**
 * Render a number that may not have been measured.
 *
 * Absence is spelled out rather than left blank, because a blank in a column
 * of numbers reads as a zero and a zero reads as a pass.
 *
 * @param value - The measurement
 * @param format - How to render it when present
 * @returns Either the number or an account of its absence
 */
function renderMeasured(
	value: Measured<number>,
	format: (n: number) => string,
): string {
	return value.state === 'taken' ? format(value.value) : 'not measured';
}

/**
 * The measured numbers, per page.
 *
 * The statistics used to be an aggregate of the model's own severity
 * judgements and nothing else, which gave a reader no external reference
 * point: every number in the table moved when the model's mood moved. These
 * move only when the site does.
 *
 * @param pages - Every analysed page
 * @returns The table, or nothing when no page was measured
 */
function renderMeasurementTable(pages: PageAnalysis[]): string[] {
	const measured = pages.filter(page =>
		['complete', 'partial', 'failed'].includes(page.status),
	);

	if (measured.length === 0) {
		return [];
	}

	const rows = measured.map(page => {
		const {audit, trace} = page.measurement;

		const score =
			audit.state === 'taken'
				? `${audit.value.scores['accessibility'] ?? 0}/100`
				: `not measured (${audit.reason})`;

		const lcp =
			trace.state === 'taken'
				? renderMeasured(
						trace.value.largestContentfulPaint,
						value => `${value} ms`,
					)
				: `not measured (${trace.reason})`;

		const cls =
			trace.state === 'taken'
				? renderMeasured(trace.value.cumulativeLayoutShift, value =>
						value.toFixed(2),
					)
				: `not measured (${trace.reason})`;

		return `| ${page.pageUrl} | ${score} | ${lcp} | ${cls} |`;
	});

	return [
		'### Measured',
		'',
		'| Page | Accessibility | LCP | CLS |',
		'|------|---------------|-----|-----|',
		...rows,
		'',
		// Said plainly because the companion scores are taken in a mode that
		// skips the audits needing a page load, and a reader comparing them
		// against a full-navigation score would be comparing different things.
		'Accessibility is audited without reloading the page, so it describes the same page load the analysis read. First Contentful Paint is not reported: the tracing tool does not measure one.',
		'',
	];
}

/**
 * Rules that failed on more than one page.
 *
 * A single bad style rule across ten pages is ten findings, and the gate
 * counts ten. This does not change that -- it makes it legible, so a reader
 * can see one defect where the finding list shows ten.
 *
 * Derived from the findings each time rather than stored: a stored copy is a
 * second source of truth, and this summary must never be able to claim
 * something the findings do not say.
 *
 * @param pages - Every analysed page
 * @returns The summary, or nothing when no rule recurred
 */
function renderRecurrence(pages: PageAnalysis[]): string[] {
	const pagesByRule = new Map<string, {title: string; pages: Set<string>}>();

	const measuredFindings = pages.flatMap(page =>
		page.findings
			.filter(finding => finding.origin === 'audit' && finding.ruleId)
			.map(finding => ({finding, pageUrl: page.pageUrl})),
	);

	for (const {finding, pageUrl} of measuredFindings) {
		const ruleId = finding.ruleId!;
		const entry = pagesByRule.get(ruleId) ?? {
			title: finding.description,
			pages: new Set<string>(),
		};
		entry.pages.add(pageUrl);
		pagesByRule.set(ruleId, entry);
	}

	const recurring = [...pagesByRule]
		.filter(([, entry]) => entry.pages.size > 1)
		.sort((a, b) => b[1].pages.size - a[1].pages.size);

	if (recurring.length === 0) {
		return [];
	}

	return [
		'### Recurring across pages',
		'',
		'| Rule | Pages affected | Issue |',
		'|------|----------------|-------|',
		...recurring.map(
			([ruleId, entry]) =>
				`| \`${ruleId}\` | ${entry.pages.size} | ${entry.title} |`,
		),
		'',
		'One site-wide defect appears once here and once per page in the findings. The gate counts the findings.',
		'',
	];
}

/**
 * What was measured on one page, in the page's own section.
 *
 * Absence is stated rather than omitted. A page whose audit never ran and a
 * page audited and found clean are different facts, and a silent section makes
 * them look the same.
 *
 * @param page - The page being rendered
 * @returns Lines for the page section
 */
function renderPageMeasurement(page: PageAnalysis): string[] {
	const {audit} = page.measurement;

	if (audit.state === 'not-taken') {
		return [`**Measurement**: not taken (${audit.reason})\n`];
	}

	if (audit.value.violations.length === 0) {
		return ['**Measurement**: audited, no accessibility violations found\n'];
	}

	return [
		`**Measurement**: audited, ${audit.value.violations.length} accessibility rule${
			audit.value.violations.length === 1 ? '' : 's'
		} failing\n`,
	];
}

/**
 * Format timestamp as readable date string
 */
function formatTimestamp(timestamp: number): string {
	return new Date(timestamp).toLocaleString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

/**
 * Count findings by severity
 */
function countBySeverity(report: UxReport): Record<FindingSeverity, number> {
	const counts: Record<FindingSeverity, number> = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
	};

	for (const finding of report.prioritizedFindings) {
		counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
	}

	return counts;
}

/**
 * Generate markdown report from UX analysis results
 * Creates formatted markdown with all sections
 */
export function generateMarkdownReport(report: UxReport): string {
	const {metadata, pages, summary, prioritizedFindings} = report;
	const sections: string[] = [];
	const severityCounts = countBySeverity(report);

	// Header
	sections.push(
		'# UX Analysis Report\n',
		`**Generated**: ${formatTimestamp(metadata.timestamp)}`,
		`**Pages Analyzed**: ${metadata.analyzedPages.length} successful`,
	);
	if (metadata.partialPages.length > 0) {
		sections.push(`**Partial Pages**: ${metadata.partialPages.length}`);
	}

	if (metadata.failedPages.length > 0) {
		sections.push(`**Failed Pages**: ${metadata.failedPages.length}`);
	}

	// Provenance belongs in the artefact, not only in the in-memory report.
	// The saved markdown is the only thing anyone reads weeks later, and a
	// report that cannot say which browser tooling produced it cannot support
	// the comparison between two runs that it exists to enable.
	sections.push(
		`**Browser Tooling**: ${metadata.tooling.browserServer}@${metadata.tooling.browserServerVersion}`,
		`**Browser**: ${metadata.tooling.browserVersion}`,
	);

	if (metadata.tooling.auditEngineVersion) {
		sections.push(
			`**Audit Engine**: Lighthouse ${metadata.tooling.auditEngineVersion}`,
		);
	}

	if (metadata.tooling.externalDataAllowed) {
		sections.push(
			'**External Data**: this run was permitted to consult external data sources',
		);
	}

	// Executive Summary and Statistics
	sections.push(
		'',
		'## Executive Summary\n',
		summary,
		'',
		'## Statistics\n',
		'| Metric | Value |',
		'|--------|-------|',
		`| Total Findings | ${metadata.totalFindings} |`,
		`| ${severityEmoji.critical} Critical | ${severityCounts.critical} |`,
		`| ${severityEmoji.high} High | ${severityCounts.high} |`,
		`| ${severityEmoji.medium} Medium | ${severityCounts.medium} |`,
		`| ${severityEmoji.low} Low | ${severityCounts.low} |`,
		'',
		...renderMeasurementTable(pages),
		...renderRecurrence(pages),
		'**Target Persona**:',
		`- ${metadata.persona}`,
		'',
		'## Page Analyses\n',
	);

	// Page Analyses Content
	// Every page that produced findings is rendered, whatever ended it. The
	// status note says how far the analysis got; omitting cut-short and failed
	// pages hid findings that had already been paid for.
	const statusNote: Partial<Record<PageAnalysis['status'], string>> = {
		partial:
			'**Status**: Partial — the analysis was cut short, so this page is not fully covered.\n',
		failed:
			'**Status**: Failed — findings below are only what was collected before the failure.\n',
	};

	for (const page of pages) {
		if (!['complete', 'partial', 'failed'].includes(page.status)) {
			continue;
		}

		const note = statusNote[page.status];

		sections.push(
			`### ${note ? '⚠️ ' : ''}${page.pageUrl}\n`,
			`**Features**: ${page.features}\n`,
		);

		if (note) {
			sections.push(note);
		}

		sections.push(`**Findings**: ${page.findings.length} issues identified\n`);

		if (page.findings.length > 0) {
			for (const finding of page.findings) {
				sections.push(
					`- ${severityEmoji[finding.severity]} **${finding.category}**: ${
						finding.description
					} (${describeOrigin(finding)})`,
				);
			}

			sections.push('');
		}

		sections.push(...renderPageMeasurement(page));

		// The model's note, kept outside the findings it discusses and named as
		// judgement. Sitting it among measured findings would let its prose be
		// read as something a machine verified.
		if (page.measurementNote) {
			sections.push(
				'**AI note on the measured issues** (judgement, not measurement):',
				'',
				page.measurementNote,
				'',
			);
		}
	}

	// Failed Pages. Read off `pages` rather than `metadata.failedPages` so the
	// recorded reason is shown: a report that says a page failed without saying
	// why sends the reader back to the log files.
	const failedAnalyses = pages.filter(page => page.status === 'failed');
	if (failedAnalyses.length > 0) {
		sections.push('### Failed Pages\n');
		for (const failedPage of failedAnalyses) {
			sections.push(
				`- ❌ ${failedPage.pageUrl}${
					failedPage.error ? ` — ${failedPage.error}` : ''
				}`,
			);
		}

		sections.push('');
	}

	// Prioritized Findings
	sections.push('## Prioritized Findings\n');
	if (prioritizedFindings.length === 0) {
		sections.push('No UX issues found. Great job!\n');
	} else {
		sections.push('All findings sorted by severity:\n');

		for (const [index, finding] of prioritizedFindings.entries()) {
			sections.push(
				`### ${index + 1}. ${finding.description}\n`,
				`${severityEmoji[finding.severity]} **Severity**: ${
					finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)
				}`,
				`**Category**: ${finding.category}`,
				`**Page**: ${finding.pageUrl}`,
				`**Source**: ${describeOrigin(finding)}`,
			);

			if (finding.personaRelevance.length > 0) {
				sections.push(
					`**Personas Affected**: ${finding.personaRelevance.join(', ')}`,
				);
			}

			// A measured finding carries no recommendation of ours. Printing an
			// empty one would look like the tooling had nothing to suggest,
			// rather than like this project declining to invent advice.
			sections.push(
				finding.recommendation
					? `**Recommendation**: ${finding.recommendation}`
					: '**Recommendation**: see the rule documentation for this violation',
				'',
			);
		}
	}

	// Footer
	sections.push('---\n', `Generated on ${formatTimestamp(metadata.timestamp)}`);

	return sections.join('\n');
}
