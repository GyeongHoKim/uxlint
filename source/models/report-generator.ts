/**
 * Report Generator
 * Business logic for markdown report generation
 *
 * @packageDocumentation
 */

import type {UxReport} from './analysis.js';

/**
 * Report generation options
 */
export type ReportOptions = {
	outputPath: string;
	includeDetailedFindings?: boolean;
	includePersonaBreakdown?: boolean;
};

/**
 * Generate markdown report from UX analysis results
 * TODO: Implement in T028-T030
 */
export function generateMarkdownReport(_report: UxReport): string {
	throw new Error('Not implemented');
}

/**
 * Write report directly to file system
 * TODO: Implement in T029
 */
export async function writeReportToFile(
	_report: UxReport,
	_options: ReportOptions,
): Promise<void> {
	throw new Error('Not implemented');
}
