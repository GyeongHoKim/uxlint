/**
 * Report Builder Service
 * Aggregates page analyses into final UX report with incremental building support
 *
 * @packageDocumentation
 */

import type * as fs from 'node:fs';
import {promises as fsPromises} from 'node:fs';
import {generateMarkdownReport} from '../infrastructure/reports/report-generator.js';
import type {PageAnalysis, UxFinding, UxReport} from '../models/analysis.js';

// Type definition for fs dependency injection
type FsAsyncMethods = typeof fs.promises;

/**
 * Report Builder
 * Handles business logic for generating UX reports from analyses
 * Supports both batch generation and incremental building for LLM tools
 */
export class ReportBuilder {
	// Incremental building state
	private currentPageAnalysis: Partial<PageAnalysis> | undefined;
	private allAnalyses: PageAnalysis[] = [];
	private persona = '';

	constructor(private readonly fsAsync?: FsAsyncMethods) {}

	/**
	 * Initialize a new page analysis session
	 *
	 * @param pageUrl - URL of the page being analyzed
	 * @param features - Features/context for the page
	 */
	initializePageAnalysis(pageUrl: string, features: string): void {
		this.currentPageAnalysis = {
			pageUrl,
			features,
			findings: [],
			snapshot: '',
			analysisTimestamp: Date.now(),
			status: 'complete',
		};
	}

	/**
	 * Add a finding to the current page analysis
	 *
	 * @param finding - UX finding to add
	 * @throws Error if no page analysis is initialized
	 */
	addFinding(finding: UxFinding): void {
		if (!this.currentPageAnalysis) {
			throw new Error(
				'No page analysis initialized. Call initializePageAnalysis first.',
			);
		}

		this.currentPageAnalysis.findings ??= [];

		this.currentPageAnalysis.findings.push(finding);
	}

	/**
	 * Set the snapshot for the current page analysis
	 *
	 * @param snapshot - Accessibility tree snapshot
	 * @throws Error if no page analysis is initialized
	 */
	setPageSnapshot(snapshot: string): void {
		if (!this.currentPageAnalysis) {
			throw new Error(
				'No page analysis initialized. Call initializePageAnalysis first.',
			);
		}

		this.currentPageAnalysis.snapshot = snapshot;
	}

	/**
	 * Complete the current page analysis and add it to collection
	 *
	 * @returns The completed page analysis
	 * @throws Error if no page analysis is initialized or required fields are missing
	 */
	completePageAnalysis(): PageAnalysis {
		if (!this.currentPageAnalysis) {
			throw new Error(
				'No page analysis initialized. Call initializePageAnalysis first.',
			);
		}

		// Validate required fields
		if (
			!this.currentPageAnalysis.pageUrl ||
			!this.currentPageAnalysis.features
		) {
			throw new Error(
				'Page analysis missing required fields: pageUrl and features',
			);
		}

		const completedAnalysis: PageAnalysis = {
			pageUrl: this.currentPageAnalysis.pageUrl,
			features: this.currentPageAnalysis.features,
			snapshot: this.currentPageAnalysis.snapshot ?? '',
			findings: this.currentPageAnalysis.findings ?? [],
			analysisTimestamp:
				this.currentPageAnalysis.analysisTimestamp ?? Date.now(),
			status: 'complete',
		};

		this.allAnalyses.push(completedAnalysis);
		this.currentPageAnalysis = undefined;

		return completedAnalysis;
	}

	/**
	 * Set persona for the report
	 *
	 * @param persona - Target persona
	 */
	setPersona(persona: string): void {
		this.persona = persona;
	}

	/**
	 * Get current analysis state
	 */
	getCurrentState(): {
		currentPageAnalysis: Partial<PageAnalysis> | undefined;
		completedAnalyses: PageAnalysis[];
		persona: string;
	} {
		return {
			currentPageAnalysis: this.currentPageAnalysis,
			completedAnalyses: [...this.allAnalyses],
			persona: this.persona,
		};
	}

	/**
	 * Generate final report from collected page analyses
	 *
	 * @returns Aggregated UX report with prioritized findings
	 */
	generateFinalReport(): UxReport {
		return this.generateReport(this.allAnalyses, this.persona);
	}

	/**
	 * Generate final report from page analyses
	 *
	 * @param analyses - Completed page analyses
	 * @param persona - Target persona from config
	 * @returns Aggregated UX report with prioritized findings
	 */
	generateReport(analyses: PageAnalysis[], persona: string): UxReport {
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
				persona,
			},
			pages: analyses,
			summary,
			prioritizedFindings,
		};
	}

	/**
	 * Reset the builder state
	 */
	reset(): void {
		this.currentPageAnalysis = undefined;
		this.allAnalyses = [];
		this.persona = '';
	}

	/**
	 * Save the final report to a file
	 *
	 * @param outputPath - Path where the report should be saved
	 * @returns Promise that resolves when the file is written
	 * @throws Error if fs module is not available
	 *
	 * @example
	 * ```typescript
	 * const report = reportBuilder.generateFinalReport();
	 * await reportBuilder.saveReport('./ux-report.md');
	 * ```
	 */
	async saveReport(outputPath: string): Promise<void> {
		if (!this.fsAsync) {
			throw new Error(
				'File system not available. ReportBuilder was created without fs dependency.',
			);
		}

		const report = this.generateFinalReport();
		const markdown = generateMarkdownReport(report);
		const {writeFile} = this.fsAsync;

		await writeFile(outputPath, markdown, 'utf8');
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

/**
 * Singleton instance of ReportBuilder with fs dependency
 */
export const reportBuilder = new ReportBuilder(fsPromises);
