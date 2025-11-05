/**
 * Report Generator Tests
 * Unit tests for markdown report generation
 */

import * as path from 'node:path';
import {jest} from '@jest/globals';
import {mockFiles, resetMockFiles} from '../helpers/fs-mock.js';
import {
	mockMultiSeverityReport,
	mockReportWithFailures,
	mockUxReport,
} from '../fixtures/analysis-fixtures.js';

// Mock node:fs/promises module using unstable_mockModule for ESM
jest.unstable_mockModule('node:fs/promises', () => ({
	writeFile: jest.fn(async (filePath: string, data: string): Promise<void> => {
		const parentDir = path.dirname(filePath);
		if (!mockFiles.has(parentDir)) {
			const error = new Error(
				`ENOENT: no such file or directory, open '${filePath}'`,
			);
			(error as NodeJS.ErrnoException).code = 'ENOENT';
			throw error;
		}

		mockFiles.set(filePath, data);
	}),
}));

// Dynamic imports after mock is set up
const {generateMarkdownReport, writeReportToFile} = await import(
	'../../source/infrastructure/reports/report-generator.js'
);

// GenerateMarkdownReport tests
describe('generateMarkdownReport', () => {
	test('generates markdown with all required sections', () => {
		const markdown = generateMarkdownReport(mockUxReport);

		expect(markdown).toContain('# UX Analysis Report');
		expect(markdown).toContain('## Executive Summary');
		expect(markdown).toContain('## Statistics');
		expect(markdown).toContain('## Page Analyses');
		expect(markdown).toContain('## Prioritized Findings');
	});

	test('includes metadata in header', () => {
		const markdown = generateMarkdownReport(mockUxReport);

		expect(markdown).toContain('**Generated**:');
		expect(markdown).toContain('**Version**:');
		expect(markdown).toContain('**Pages Analyzed**:');
	});

	test('formats severity levels correctly', () => {
		const markdown = generateMarkdownReport(mockMultiSeverityReport);

		expect(markdown).toContain('🔴 Critical');
		expect(markdown).toContain('🟠 High');
		expect(markdown).toContain('🟡 Medium');
		expect(markdown).toContain('🟢 Low');
	});

	test('sorts findings by severity (critical first)', () => {
		const markdown = generateMarkdownReport(mockMultiSeverityReport);

		const criticalIndex = markdown.indexOf('🔴 Critical');
		const highIndex = markdown.indexOf('🟠 High');
		const mediumIndex = markdown.indexOf('🟡 Medium');
		const lowIndex = markdown.indexOf('🟢 Low');

		expect(criticalIndex).toBeLessThan(highIndex);
		expect(highIndex).toBeLessThan(mediumIndex);
		expect(mediumIndex).toBeLessThan(lowIndex);
	});

	test('includes per-page analysis sections', () => {
		const markdown = generateMarkdownReport(mockUxReport);

		expect(markdown).toContain('https://example.com');
		expect(markdown).toContain('Login form with email and password inputs');
	});

	test('displays failed pages in report', () => {
		const markdown = generateMarkdownReport(mockReportWithFailures);

		expect(markdown).toContain('Failed Pages');
		expect(markdown).toContain('https://example.com/404');
		expect(markdown).toContain('Navigation timeout');
	});

	test('includes statistics table', () => {
		const markdown = generateMarkdownReport(mockMultiSeverityReport);

		expect(markdown).toContain('Total Findings');
		expect(markdown).toContain('Critical');
		expect(markdown).toContain('High');
		expect(markdown).toContain('Medium');
		expect(markdown).toContain('Low');
	});

	test('formats findings with categories', () => {
		const markdown = generateMarkdownReport(mockUxReport);

		expect(markdown).toContain('**Category**:');
		expect(markdown).toContain('Accessibility');
	});

	test('includes recommendations for each finding', () => {
		const markdown = generateMarkdownReport(mockUxReport);

		expect(markdown).toContain('**Recommendation**:');
		expect(markdown).toContain('Add <label> elements');
	});

	test('shows persona relevance in findings', () => {
		const markdown = generateMarkdownReport(mockUxReport);

		expect(markdown).toContain('**Personas Affected**:');
		expect(markdown).toContain('Screen reader user');
	});

	test('generates valid markdown syntax', () => {
		const markdown = generateMarkdownReport(mockUxReport);

		// Check for valid markdown headers
		expect(markdown).toMatch(/^# /m);
		expect(markdown).toMatch(/^## /m);
		expect(markdown).toMatch(/^### /m);

		// Check for valid markdown lists
		expect(markdown).toMatch(/^- /m);

		// Check for valid markdown tables
		expect(markdown).toMatch(/\|/);
	});

	test('includes timestamp in footer', () => {
		const markdown = generateMarkdownReport(mockUxReport);

		expect(markdown).toContain('Generated on');
	});

	test('handles empty findings gracefully', () => {
		const emptyReport = {
			...mockUxReport,
			prioritizedFindings: [],
			pages: mockUxReport.pages.map(page => ({...page, findings: []})),
		};

		const markdown = generateMarkdownReport(emptyReport);

		expect(markdown).toContain('No UX issues found');
	});
});

// WriteReportToFile tests
describe('writeReportToFile', () => {
	beforeEach(() => {
		resetMockFiles();
	});

	test('throws error for invalid file path', async () => {
		// Parent directory doesn't exist in mock
		await expect(
			writeReportToFile(mockUxReport, {outputPath: '/invalid/path/report.md'}),
		).rejects.toThrow('ENOENT');
	});

	test('accepts valid markdown file path', async () => {
		const testDir = '/tmp';
		const testPath = '/tmp/test-report.md';

		// Create parent directory in mock
		mockFiles.set(testDir, '__DIR__');

		// Should not throw for valid path
		await expect(
			writeReportToFile(mockUxReport, {outputPath: testPath}),
		).resolves.not.toThrow();

		// Verify file was written
		expect(mockFiles.has(testPath)).toBe(true);
		const content = mockFiles.get(testPath);
		expect(content).toBeDefined();
		expect(content).toContain('# UX Analysis Report');
	});

	test('writes complete report to file', async () => {
		const testDir = '/tmp';
		const testPath = '/tmp/complete-report.md';

		mockFiles.set(testDir, '__DIR__');

		await writeReportToFile(mockUxReport, {outputPath: testPath});

		const content = mockFiles.get(testPath);
		expect(content).toContain('## Executive Summary');
		expect(content).toContain('## Statistics');
		expect(content).toContain('## Page Analyses');
		expect(content).toContain('## Prioritized Findings');
	});
});

// Report structure validation tests
describe('report structure validation', () => {
	test('report starts with h1 header', () => {
		const markdown = generateMarkdownReport(mockUxReport);

		expect(markdown.trim()).toMatch(/^# UX Analysis Report/);
	});

	test('sections appear in correct order', () => {
		const markdown = generateMarkdownReport(mockUxReport);

		const summaryIndex = markdown.indexOf('## Executive Summary');
		const statsIndex = markdown.indexOf('## Statistics');
		const pagesIndex = markdown.indexOf('## Page Analyses');
		const findingsIndex = markdown.indexOf('## Prioritized Findings');

		expect(summaryIndex).toBeGreaterThan(0);
		expect(statsIndex).toBeGreaterThan(summaryIndex);
		expect(pagesIndex).toBeGreaterThan(statsIndex);
		expect(findingsIndex).toBeGreaterThan(pagesIndex);
	});

	test('metadata includes all required fields', () => {
		const markdown = generateMarkdownReport(mockUxReport);

		expect(markdown).toContain(mockUxReport.metadata.uxlintVersion);
		expect(markdown).toContain(
			String(mockUxReport.metadata.analyzedPages.length),
		);
		expect(markdown).toContain(String(mockUxReport.metadata.totalFindings));
	});

	test('personas are listed in report', () => {
		const markdown = generateMarkdownReport(mockUxReport);

		for (const persona of mockUxReport.metadata.personas) {
			expect(markdown).toContain(persona);
		}
	});
});

// Markdown formatting tests
describe('markdown formatting', () => {
	test('properly escapes markdown special characters', () => {
		const reportWithSpecialChars = {
			...mockUxReport,
			summary: 'This has *asterisks* and _underscores_',
		};

		const markdown = generateMarkdownReport(reportWithSpecialChars);

		// Should not break markdown structure
		expect(markdown).toContain('*asterisks*');
		expect(markdown).toContain('_underscores_');
	});

	test('formats code blocks correctly', () => {
		const reportWithCode = {
			...mockUxReport,
			prioritizedFindings: [
				{
					...mockUxReport.prioritizedFindings[0]!,
					recommendation: 'Add `aria-label` attribute',
				},
			],
		};

		const markdown = generateMarkdownReport(reportWithCode);

		expect(markdown).toContain('`aria-label`');
	});

	test('creates proper markdown tables', () => {
		const markdown = generateMarkdownReport(mockMultiSeverityReport);

		// Check for table header separator
		expect(markdown).toMatch(/\|[-\s|]+\|/);
	});
});
