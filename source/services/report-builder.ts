/**
 * Report Builder Service
 * Aggregates page analyses into final UX report
 *
 * @packageDocumentation
 */

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import type {PageAnalysis, UxReport, UxFinding} from '../models/analysis.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const packageJsonPath = join(currentDirectory, '../../package.json');

/**
 * Get package version from package.json
 * Falls back to '0.0.0' if reading fails
 */
function getPackageVersion(): string {
	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
			version?: string;
		};
		return packageJson.version ?? '0.0.0';
	} catch {
		return '0.0.0';
	}
}

/**
 * Report Builder
 * Handles business logic for generating UX reports from analyses
 */
export class ReportBuilder {
	private readonly uxlintVersion: string;

	constructor(version?: string) {
		// Use provided version or read from package.json
		this.uxlintVersion = version ?? getPackageVersion();
	}

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
				uxlintVersion: this.uxlintVersion,
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
