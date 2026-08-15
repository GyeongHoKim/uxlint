/**
 * Report Builder Service
 * Aggregates page analyses into final UX report with incremental building support
 *
 * @packageDocumentation
 */

import type * as fs from 'node:fs';
import {promises as fsPromises} from 'node:fs';
import {generateMarkdownReport} from '../infrastructure/reports/report-generator.js';
import type {
	PageAnalysis,
	RunProvenance,
	UxFinding,
	UxReport,
} from '../models/analysis.js';

// Type definition for fs dependency injection
type FsAsyncMethods = typeof fs.promises;

/**
 * Report Builder
 * Handles business logic for generating UX reports from analyses
 * Supports both batch generation and incremental building for LLM tools
 */
/**
 * Provenance for a report generated without a run behind it.
 *
 * Only reachable from tests and from a report built before `setProvenance`
 * was called. Stated explicitly rather than left absent so that a reader can
 * tell "nothing recorded this" from "this ran on an unknown toolchain".
 */
const unknownProvenance: RunProvenance = {
	browserServer: 'unknown',
	browserServerVersion: 'unknown',
	browserVersion: 'unknown',
	externalDataConsulted: false,
};

export class ReportBuilder {
	// Incremental building state
	private currentPageAnalysis: Partial<PageAnalysis> | undefined;
	private allAnalyses: PageAnalysis[] = [];
	private persona = '';
	private provenance: RunProvenance | undefined;

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
	 * `'partial'` is for a run that ended without the model signalling
	 * completion -- it exhausted its iterations rather than finishing.
	 *
	 * @param status - Terminal status for the page; defaults to `'complete'`
	 * @returns The completed page analysis
	 * @throws Error if no page analysis is initialized or required fields are missing
	 */
	completePageAnalysis(
		status: 'complete' | 'partial' = 'complete',
	): PageAnalysis {
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
			status,
		};

		this.allAnalyses.push(completedAnalysis);
		this.currentPageAnalysis = undefined;

		return completedAnalysis;
	}

	/**
	 * Record the in-flight page as failed and move it into the collection.
	 *
	 * A failure that leaves no trace is indistinguishable from a page that was
	 * never requested, which is why `metadata.failedPages` was always empty.
	 * Note that `reset()` is for run boundaries -- it also empties
	 * `allAnalyses`, so using it to abandon one page threw away every page
	 * already completed.
	 *
	 * `page` is the fallback identity for a failure that happened before
	 * `initializePageAnalysis` ran, when there is no in-flight analysis to convert.
	 *
	 * @param error - Why the page failed
	 * @param page - Page identity to fall back on
	 * @param page.url - Page URL
	 * @param page.features - Feature descriptions from config
	 * @returns The recorded failed analysis, or the existing terminal record
	 */
	failCurrentPage(
		error: string,
		page: {url: string; features: string},
	): PageAnalysis {
		if (!this.currentPageAnalysis) {
			// No in-flight page means one of two things, and they need opposite
			// handling: the page was never initialised (record the failure), or
			// it already reached a terminal state and something after that threw
			// (do not record it again). Pushing a second record would list the
			// same URL under both analyzedPages and failedPages and report a
			// finished page as failed.
			// Scanning backwards so a URL that legitimately appears twice in the
			// config resolves to its most recent record. `findLast` would say
			// this in one line but is ES2023, and tsconfig targets ES2022 libs.
			for (let index = this.allAnalyses.length - 1; index >= 0; index--) {
				const settled = this.allAnalyses[index];

				if (settled?.pageUrl === page.url) {
					return settled;
				}
			}
		}

		const failedAnalysis: PageAnalysis = {
			pageUrl: this.currentPageAnalysis?.pageUrl ?? page.url,
			features: this.currentPageAnalysis?.features ?? page.features,
			snapshot: this.currentPageAnalysis?.snapshot ?? '',
			findings: this.currentPageAnalysis?.findings ?? [],
			analysisTimestamp:
				this.currentPageAnalysis?.analysisTimestamp ?? Date.now(),
			status: 'failed',
			error,
		};

		this.allAnalyses.push(failedAnalysis);
		this.currentPageAnalysis = undefined;

		return failedAnalysis;
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
	 * Record what produced this run.
	 *
	 * Set once per run, before pages are analysed. Provenance is written into
	 * every report including one where every page failed -- a report that can
	 * explain nothing else must still explain what produced it.
	 *
	 * @param provenance - Identity of the tooling behind this run
	 */
	setProvenance(provenance: RunProvenance): void {
		this.provenance = provenance;
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
		const partialAnalyses = analyses.filter(a => a.status === 'partial');
		const failedAnalyses = analyses.filter(a => a.status === 'failed');

		// Every observation counts, whatever ended the page. A page cut short at
		// iteration 20, or one that threw on iteration 15, still found what it
		// found beforehand; discarding that is the same mistake as wiping
		// completed pages on failure. How much of the page was covered is
		// carried by the status split above, not by hiding findings.
		const allFindings = analyses.flatMap(a => a.findings);

		// Sort findings by severity
		const prioritizedFindings = this.prioritizeFindings(allFindings);

		// Generate summary
		const summary = this.generateSummary(
			successfulAnalyses.length,
			allFindings.length,
			partialAnalyses.length,
		);

		return {
			metadata: {
				timestamp: Date.now(),
				analyzedPages: successfulAnalyses.map(a => a.pageUrl),
				partialPages: partialAnalyses.map(a => a.pageUrl),
				failedPages: failedAnalyses.map(a => a.pageUrl),
				totalFindings: allFindings.length,
				persona,
				tooling: this.provenance ?? unknownProvenance,
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
		this.provenance = undefined;
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

		return [...findings].sort(
			(a, b) => severityOrder[a.severity] - severityOrder[b.severity],
		);
	}

	/**
	 * Generate executive summary
	 */
	private generateSummary(
		successCount: number,
		findingsCount: number,
		partialCount: number,
	): string {
		if (successCount === 0 && partialCount === 0) {
			return 'All pages failed analysis. Please check error messages and try again.';
		}

		// The finding count spans complete and partial pages, so the sentence
		// has to account for both. Crediting them all to successCount read as a
		// contradiction whenever a run was mostly partial ("Analyzed 0 page(s)
		// successfully. Found 12 UX issue(s)").
		const coverage =
			partialCount > 0
				? `Analyzed ${successCount} page(s) fully and ${partialCount} page(s) partially -- the partial ones were cut short, so their coverage is incomplete.`
				: `Analyzed ${successCount} page(s) successfully.`;

		return `${coverage} Found ${findingsCount} UX issue(s) requiring attention.`;
	}
}

/**
 * Singleton instance of ReportBuilder with fs dependency
 */
export const reportBuilder = new ReportBuilder(fsPromises);
