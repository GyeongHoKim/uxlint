/**
 * Report Builder Service
 * Aggregates page analyses into final UX report
 *
 * @packageDocumentation
 */

import type {PageAnalysis, UxReport, UxFinding} from '../models/analysis.js';

/**
 * Report Builder
 * Handles business logic for generating UX reports from analyses
 */
export class ReportBuilder {
	/**
	 * Generate final report from page analyses
	 *
	 * @param analyses - Completed page analyses
	 * @param personas - Target personas from config
	 * @returns Aggregated UX report with prioritized findings
	 */
	generateReport(analyses: PageAnalysis[], personas: string[]): UxReport {
		const successfulAnalyses = analyses.filter(a => a.status === 'complete');
		const failedAnalyses = analyses.filter(a => a.status === 'failed');

		// Collect all findings
		const allFindings = successfulAnalyses.flatMap(a => a.findings);

		// Sort findings by severity
		const prioritizedFindings = this.prioritizeFindings(allFindings);

		// Generate summary
		const summary = this.generateSummary(
			successfulAnalyses.length,
			allFindings.length,
		);

		return {
			metadata: {
				timestamp: Date.now(),
				analyzedPages: successfulAnalyses.map(a => a.pageUrl),
				failedPages: failedAnalyses.map(a => a.pageUrl),
				totalFindings: allFindings.length,
				personas,
			},
			pages: analyses,
			summary,
			prioritizedFindings,
		};
	}

	/**
	 * Prioritize findings by severity
	 * Sorts findings: critical > high > medium > low
	 */
	private prioritizeFindings(findings: UxFinding[]): UxFinding[] {
		const severityOrder = {critical: 0, high: 1, medium: 2, low: 3};

		return [...findings].sort((a, b) => {
			return severityOrder[a.severity] - severityOrder[b.severity];
		});
	}

	/**
	 * Generate executive summary
	 */
	private generateSummary(successCount: number, findingsCount: number): string {
		if (successCount === 0) {
			return 'All pages failed analysis. Please check error messages and try again.';
		}

		return `Analyzed ${successCount} page(s) successfully. Found ${findingsCount} UX issue(s) requiring attention.`;
	}
}
