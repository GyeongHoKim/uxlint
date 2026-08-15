/**
 * Report Generator
 * Business logic for markdown report generation
 *
 * @packageDocumentation
 */

import type {
	FindingSeverity,
	PageAnalysis,
	UxReport,
} from '../../models/analysis.js';

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

	if (metadata.tooling.externalDataConsulted) {
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
					}`,
				);
			}

			sections.push('');
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
			);

			if (finding.personaRelevance.length > 0) {
				sections.push(
					`**Personas Affected**: ${finding.personaRelevance.join(', ')}`,
				);
			}

			sections.push(`**Recommendation**: ${finding.recommendation}`, '');
		}
	}

	// Footer
	sections.push('---\n', `Generated on ${formatTimestamp(metadata.timestamp)}`);

	return sections.join('\n');
}
