/**
 * Analysis Test Fixtures
 * Mock data for testing analysis workflows
 *
 * @packageDocumentation
 */

import type {
	AnalysisState,
	PageAnalysis,
	UxFinding,
	UxReport,
} from '../../source/models/analysis.js';

/**
 * Mock UX finding (high severity accessibility issue)
 *
 * @example
 * ```typescript
 * const finding = mockUxFinding;
 * expect(finding.severity).toBe('high');
 * ```
 */
export const mockUxFinding: UxFinding = {
	severity: 'high',
	category: 'Accessibility',
	description: 'Form labels missing for input fields',
	personaRelevance: ['Screen reader user'],
	recommendation: 'Add <label> elements with for attributes',
	pageUrl: 'https://example.com',
};

/**
 * Mock UX finding (critical security issue)
 */
export const mockCriticalFinding: UxFinding = {
	severity: 'critical',
	category: 'Security',
	description: 'Password input lacks autocomplete attribute',
	personaRelevance: ['All users'],
	recommendation: 'Add autocomplete="current-password" to password field',
	pageUrl: 'https://example.com/login',
};

/**
 * Mock UX finding (medium usability issue)
 */
export const mockMediumFinding: UxFinding = {
	severity: 'medium',
	category: 'Usability',
	description: 'Submit button has low contrast ratio',
	personaRelevance: ['Low vision user', 'Mobile user'],
	recommendation: 'Increase color contrast to meet WCAG AA standards',
	pageUrl: 'https://example.com',
};

/**
 * Mock UX finding (low performance issue)
 */
export const mockLowFinding: UxFinding = {
	severity: 'low',
	category: 'Performance',
	description: 'Large image file size impacts load time',
	personaRelevance: [],
	recommendation: 'Compress images and use modern formats (WebP, AVIF)',
	pageUrl: 'https://example.com/about',
};

/**
 * Mock page analysis (complete with findings)
 *
 * @example
 * ```typescript
 * const analysis = mockPageAnalysis;
 * expect(analysis.status).toBe('complete');
 * expect(analysis.findings).toHaveLength(1);
 * ```
 */
export const mockPageAnalysis: PageAnalysis = {
	pageUrl: 'https://example.com',
	features: 'Login form with email and password inputs',
	snapshot: '{"role":"form","children":[{"role":"textbox"},{"role":"button"}]}',
	findings: [mockUxFinding],
	analysisTimestamp: Date.now(),
	status: 'complete',
};

/**
 * Mock page analysis (complete with no findings)
 */
export const mockCleanPageAnalysis: PageAnalysis = {
	pageUrl: 'https://example.com/about',
	features: 'About page with company information',
	snapshot:
		'{"role":"main","children":[{"role":"heading"},{"role":"paragraph"}]}',
	findings: [],
	analysisTimestamp: Date.now(),
	status: 'complete',
};

/**
 * Mock page analysis (failed with error)
 */
export const mockFailedPageAnalysis: PageAnalysis = {
	pageUrl: 'https://example.com/404',
	features: 'Non-existent page',
	snapshot: '',
	findings: [],
	analysisTimestamp: Date.now(),
	status: 'failed',
	error: 'Navigation timeout after 30s',
};

/**
 * Mock page analysis (in progress - analyzing stage)
 */
export const mockInProgressAnalysis: PageAnalysis = {
	pageUrl: 'https://example.com/dashboard',
	features: 'User dashboard with analytics',
	snapshot:
		'{"role":"main","children":[{"role":"navigation"},{"role":"region"}]}',
	findings: [],
	analysisTimestamp: 0,
	status: 'analyzing',
};

/**
 * Mock UX report (complete analysis with multiple pages)
 *
 * @example
 * ```typescript
 * const report = mockUxReport;
 * expect(report.pages).toHaveLength(2);
 * expect(report.metadata.totalFindings).toBe(1);
 * ```
 */
export const mockUxReport: UxReport = {
	metadata: {
		timestamp: Date.now(),
		uxlintVersion: '1.0.0',
		analyzedPages: ['https://example.com', 'https://example.com/about'],
		failedPages: [],
		totalFindings: 1,
		personas: ['Screen reader user', 'Mobile user'],
	},
	pages: [mockPageAnalysis, mockCleanPageAnalysis],
	summary: 'One accessibility issue found on login page',
	prioritizedFindings: [mockUxFinding],
};

/**
 * Mock UX report with multiple severity levels
 */
export const mockMultiSeverityReport: UxReport = {
	metadata: {
		timestamp: Date.now(),
		uxlintVersion: '1.0.0',
		analyzedPages: [
			'https://example.com',
			'https://example.com/login',
			'https://example.com/about',
		],
		failedPages: [],
		totalFindings: 4,
		personas: ['Screen reader user', 'Mobile user', 'Low vision user'],
	},
	pages: [
		{...mockPageAnalysis, findings: [mockMediumFinding, mockUxFinding]},
		{
			...mockPageAnalysis,
			pageUrl: 'https://example.com/login',
			findings: [mockCriticalFinding],
		},
		{...mockCleanPageAnalysis, findings: [mockLowFinding]},
	],
	summary:
		'Analysis found 1 critical, 1 high, 1 medium, and 1 low severity issue',
	prioritizedFindings: [
		mockCriticalFinding,
		mockUxFinding,
		mockMediumFinding,
		mockLowFinding,
	],
};

/**
 * Mock UX report with failed pages
 */
export const mockReportWithFailures: UxReport = {
	metadata: {
		timestamp: Date.now(),
		uxlintVersion: '1.0.0',
		analyzedPages: ['https://example.com'],
		failedPages: ['https://example.com/404 (Navigation timeout after 30s)'],
		totalFindings: 1,
		personas: ['Screen reader user'],
	},
	pages: [mockPageAnalysis, mockFailedPageAnalysis],
	summary: 'Analysis completed with 1 failed page',
	prioritizedFindings: [mockUxFinding],
};

/**
 * Mock analysis state (idle - not started)
 *
 * @example
 * ```typescript
 * const state = mockIdleAnalysisState;
 * expect(state.currentStage).toBe('idle');
 * expect(state.analyses).toHaveLength(0);
 * ```
 */
export const mockIdleAnalysisState: AnalysisState = {
	currentPageIndex: 0,
	totalPages: 2,
	currentStage: 'idle',
	analyses: [],
};

/**
 * Mock analysis state (in progress - analyzing first page)
 */
export const mockInProgressAnalysisState: AnalysisState = {
	currentPageIndex: 0,
	totalPages: 2,
	currentStage: 'analyzing',
	analyses: [],
};

/**
 * Mock analysis state (complete with report)
 */
export const mockCompleteAnalysisState: AnalysisState = {
	currentPageIndex: 2,
	totalPages: 2,
	currentStage: 'complete',
	analyses: [mockPageAnalysis, mockCleanPageAnalysis],
	report: mockUxReport,
};

/**
 * Mock analysis state (error state)
 */
export const mockErrorAnalysisState: AnalysisState = {
	currentPageIndex: 1,
	totalPages: 2,
	currentStage: 'error',
	analyses: [mockPageAnalysis],
	error: new Error('AI service unavailable'),
};
