/**
 * Report Builder Tests
 * Unit tests for report generation and finding prioritization
 */

import type {PageAnalysis, UxFinding} from '../../source/models/analysis.js';
import {ReportBuilder} from '../../source/services/report-builder.js';

describe('ReportBuilder', () => {
	let builder: ReportBuilder;

	beforeEach(() => {
		builder = new ReportBuilder();
	});

	describe('generateReport', () => {
		test('generates report with successful analyses', () => {
			const analyses: PageAnalysis[] = [
				{
					pageUrl: 'https://example.com',
					features: 'Login form',
					snapshot: '',
					findings: [
						{
							severity: 'high',
							category: 'Accessibility',
							description: 'Missing alt text',
							personaRelevance: ['Screen reader user'],
							recommendation: 'Add alt attributes',
							pageUrl: 'https://example.com',
						},
					],
					analysisTimestamp: Date.now(),
					status: 'complete',
				},
			];
			const personas = ['Screen reader user'];

			const report = builder.generateReport(analyses, personas);

			expect(report.metadata.analyzedPages).toEqual(['https://example.com']);
			expect(report.metadata.totalFindings).toBe(1);
			expect(report.metadata.personas).toEqual(personas);
			expect(report.pages).toEqual(analyses);
			expect(report.prioritizedFindings).toHaveLength(1);
		});

		test('separates successful and failed analyses', () => {
			const analyses: PageAnalysis[] = [
				{
					pageUrl: 'https://success.com',
					features: 'Form',
					snapshot: '',
					findings: [],
					analysisTimestamp: Date.now(),
					status: 'complete',
				},
				{
					pageUrl: 'https://failed.com',
					features: 'Form',
					snapshot: '',
					findings: [],
					analysisTimestamp: Date.now(),
					status: 'failed',
					error: 'Network error',
				},
			];

			const report = builder.generateReport(analyses, []);

			expect(report.metadata.analyzedPages).toEqual(['https://success.com']);
			expect(report.metadata.failedPages).toEqual(['https://failed.com']);
		});

		test('collects findings from multiple pages', () => {
			const findings1: UxFinding[] = [
				{
					severity: 'high',
					category: 'Accessibility',
					description: 'Issue 1',
					personaRelevance: [],
					recommendation: 'Fix 1',
					pageUrl: 'https://page1.com',
				},
			];

			const findings2: UxFinding[] = [
				{
					severity: 'medium',
					category: 'Usability',
					description: 'Issue 2',
					personaRelevance: [],
					recommendation: 'Fix 2',
					pageUrl: 'https://page2.com',
				},
			];

			const analyses: PageAnalysis[] = [
				{
					pageUrl: 'https://page1.com',
					features: 'Features 1',
					snapshot: '',
					findings: findings1,
					analysisTimestamp: Date.now(),
					status: 'complete',
				},
				{
					pageUrl: 'https://page2.com',
					features: 'Features 2',
					snapshot: '',
					findings: findings2,
					analysisTimestamp: Date.now(),
					status: 'complete',
				},
			];

			const report = builder.generateReport(analyses, []);

			expect(report.metadata.totalFindings).toBe(2);
			expect(report.prioritizedFindings).toHaveLength(2);
		});

		test('prioritizes findings by severity', () => {
			const findings: UxFinding[] = [
				{
					severity: 'low',
					category: 'Usability',
					description: 'Low priority',
					personaRelevance: [],
					recommendation: 'Fix low',
					pageUrl: 'https://example.com',
				},
				{
					severity: 'critical',
					category: 'Security',
					description: 'Critical issue',
					personaRelevance: [],
					recommendation: 'Fix critical',
					pageUrl: 'https://example.com',
				},
				{
					severity: 'medium',
					category: 'Accessibility',
					description: 'Medium priority',
					personaRelevance: [],
					recommendation: 'Fix medium',
					pageUrl: 'https://example.com',
				},
				{
					severity: 'high',
					category: 'Accessibility',
					description: 'High priority',
					personaRelevance: [],
					recommendation: 'Fix high',
					pageUrl: 'https://example.com',
				},
			];

			const analyses: PageAnalysis[] = [
				{
					pageUrl: 'https://example.com',
					features: 'Test features',
					snapshot: '',
					findings,
					analysisTimestamp: Date.now(),
					status: 'complete',
				},
			];

			const report = builder.generateReport(analyses, []);

			expect(report.prioritizedFindings[0]?.severity).toBe('critical');
			expect(report.prioritizedFindings[1]?.severity).toBe('high');
			expect(report.prioritizedFindings[2]?.severity).toBe('medium');
			expect(report.prioritizedFindings[3]?.severity).toBe('low');
		});

		test('generates summary for successful analyses', () => {
			const mockFinding: UxFinding = {
				severity: 'medium',
				category: 'Usability',
				description: 'Test',
				personaRelevance: [],
				recommendation: 'Fix',
				pageUrl: 'https://example.com',
			};
			const analyses: PageAnalysis[] = [
				{
					pageUrl: 'https://example.com',
					features: 'Features',
					snapshot: '',
					findings: [mockFinding, mockFinding],
					analysisTimestamp: Date.now(),
					status: 'complete',
				},
			];

			const report = builder.generateReport(analyses, []);

			expect(report.summary).toContain('1 page(s)');
			expect(report.summary).toContain('2 UX issue(s)');
		});

		test('generates failure summary when all analyses fail', () => {
			const failedAnalysis: PageAnalysis = {
				pageUrl: 'https://failed.com',
				features: 'Features',
				snapshot: '',
				findings: [],
				analysisTimestamp: Date.now(),
				status: 'failed',
				error: 'Error',
			};
			const analyses: PageAnalysis[] = [failedAnalysis];

			const report = builder.generateReport(analyses, []);

			expect(report.summary).toContain('All pages failed');
		});

		test('handles empty findings array', () => {
			const analyses: PageAnalysis[] = [
				{
					pageUrl: 'https://example.com',
					features: 'Features',
					snapshot: '',
					findings: [],
					analysisTimestamp: Date.now(),
					status: 'complete',
				},
			];

			const report = builder.generateReport(analyses, []);

			expect(report.metadata.totalFindings).toBe(0);
			expect(report.prioritizedFindings).toEqual([]);
			expect(report.summary).toContain('0 UX issue(s)');
		});

		test('includes metadata timestamp', () => {
			const before = Date.now();

			const report = builder.generateReport([], []);

			const after = Date.now();

			expect(report.metadata.timestamp).toBeGreaterThanOrEqual(before);
			expect(report.metadata.timestamp).toBeLessThanOrEqual(after);
		});
	});
});
