/**
 * Report Generator
 * Business logic for markdown report generation
 *
 * @packageDocumentation
 */

import {writeFile} from 'node:fs/promises';
import type {FindingSeverity, UxReport} from '../../models/analysis.js';

/**
 * Report generation options
 */
export type ReportOptions = {
	outputPath: string;
	includeDetailedFindings?: boolean;
	includePersonaBreakdown?: boolean;
};

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
		`**Version**: uxlint v${metadata.uxlintVersion}`,
		`**Pages Analyzed**: ${metadata.analyzedPages.length} successful`,
	);
	if (metadata.failedPages.length > 0) {
		sections.push(`**Failed Pages**: ${metadata.failedPages.length}`);
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
		'**Target Personas**:',
		...metadata.personas.map((p: string) => `- ${p}`),
		'',
		'## Page Analyses\n',
	);

	// Page Analyses Content
	for (const page of pages) {
		if (page.status === 'complete') {
			sections.push(
				`### ${page.pageUrl}\n`,
				`**Features**: ${page.features}\n`,
				`**Findings**: ${page.findings.length} issues identified\n`,
			);

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
	}

	// Failed Pages
	if (metadata.failedPages.length > 0) {
		sections.push('### Failed Pages\n');
		for (const failedPage of metadata.failedPages) {
			sections.push(`- ❌ ${failedPage}`);
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

/**
 * Write report directly to file system
 * Saves markdown report to specified path
 */
export async function writeReportToFile(
	report: UxReport,
	options: ReportOptions,
): Promise<void> {
	const markdown = generateMarkdownReport(report);
	await writeFile(options.outputPath, markdown, 'utf8');
}
