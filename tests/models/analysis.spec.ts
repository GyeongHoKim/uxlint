/**
 * Analysis Model Tests
 * Validates type guards and domain logic
 */

import {
	type AnalysisState,
	type PageAnalysis,
	type UxFinding,
	isAnalysisComplete,
	isAnalysisInProgress,
	isPageAnalysisComplete,
	isPageAnalysisFailed,
} from '../../source/models/analysis.js';

// IsPageAnalysisComplete tests
test('isPageAnalysisComplete returns true for complete analysis with findings', () => {
	const analysis: PageAnalysis = {
		pageUrl: 'https://example.com',
		features: 'Login form',
		snapshot: '{"role":"form"}',
		findings: [
			{
				severity: 'high',
				category: 'Accessibility',
				description: 'Missing form labels',
				personaRelevance: ['Screen reader user'],
				recommendation: 'Add label elements',
				pageUrl: 'https://example.com',
			},
		],
		analysisTimestamp: Date.now(),
		status: 'complete',
	};

	expect(isPageAnalysisComplete(analysis)).toBeTruthy();
});

test('isPageAnalysisComplete returns true for complete analysis with no findings', () => {
	const analysis: PageAnalysis = {
		pageUrl: 'https://example.com',
		features: 'Login form',
		snapshot: '{"role":"form"}',
		findings: [],
		analysisTimestamp: Date.now(),
		status: 'complete',
	};

	expect(isPageAnalysisComplete(analysis)).toBeTruthy();
});

test('isPageAnalysisComplete returns false for non-complete analysis', () => {
	const analysis: PageAnalysis = {
		pageUrl: 'https://example.com',
		features: 'Login form',
		snapshot: '{"role":"form"}',
		findings: [],
		analysisTimestamp: Date.now(),
		status: 'analyzing',
	};

	expect(isPageAnalysisComplete(analysis)).toBeFalsy();
});

test('isPageAnalysisComplete returns false for failed analysis', () => {
	const analysis: PageAnalysis = {
		pageUrl: 'https://example.com',
		features: 'Login form',
		snapshot: '',
		findings: [],
		analysisTimestamp: Date.now(),
		status: 'failed',
		error: 'Navigation timeout',
	};

	expect(isPageAnalysisComplete(analysis)).toBeFalsy();
});

// IsPageAnalysisFailed tests
test('isPageAnalysisFailed returns true for failed analysis with error', () => {
	const analysis: PageAnalysis = {
		pageUrl: 'https://example.com',
		features: 'Login form',
		snapshot: '',
		findings: [],
		analysisTimestamp: Date.now(),
		status: 'failed',
		error: 'Navigation timeout',
	};

	expect(isPageAnalysisFailed(analysis)).toBeTruthy();
});

test('isPageAnalysisFailed returns false for failed analysis without error message', () => {
	const analysis: PageAnalysis = {
		pageUrl: 'https://example.com',
		features: 'Login form',
		snapshot: '',
		findings: [],
		analysisTimestamp: Date.now(),
		status: 'failed',
	};

	expect(isPageAnalysisFailed(analysis)).toBeFalsy();
});

test('isPageAnalysisFailed returns false for complete analysis', () => {
	const analysis: PageAnalysis = {
		pageUrl: 'https://example.com',
		features: 'Login form',
		snapshot: '{"role":"form"}',
		findings: [],
		analysisTimestamp: Date.now(),
		status: 'complete',
	};

	expect(isPageAnalysisFailed(analysis)).toBeFalsy();
});

// IsAnalysisComplete tests
test('isAnalysisComplete returns true when stage is complete and report exists', () => {
	const state: AnalysisState = {
		currentPageIndex: 2,
		totalPages: 2,
		currentStage: 'complete',
		analyses: [],
		report: {
			metadata: {
				timestamp: Date.now(),
				uxlintVersion: '1.0.0',
				analyzedPages: ['https://example.com'],
				failedPages: [],
				totalFindings: 0,
				personas: ['User'],
			},
			pages: [],
			summary: 'Analysis complete',
			prioritizedFindings: [],
		},
	};

	expect(isAnalysisComplete(state)).toBeTruthy();
});

test('isAnalysisComplete returns false when stage is complete but report is undefined', () => {
	const state: AnalysisState = {
		currentPageIndex: 2,
		totalPages: 2,
		currentStage: 'complete',
		analyses: [],
	};

	expect(isAnalysisComplete(state)).toBeFalsy();
});

test('isAnalysisComplete returns false when report exists but stage is not complete', () => {
	const state: AnalysisState = {
		currentPageIndex: 1,
		totalPages: 2,
		currentStage: 'generating-report',
		analyses: [],
		report: {
			metadata: {
				timestamp: Date.now(),
				uxlintVersion: '1.0.0',
				analyzedPages: [],
				failedPages: [],
				totalFindings: 0,
				personas: [],
			},
			pages: [],
			summary: '',
			prioritizedFindings: [],
		},
	};

	expect(isAnalysisComplete(state)).toBeFalsy();
});

// IsAnalysisInProgress tests
test('isAnalysisInProgress returns true for navigating stage', () => {
	const state: AnalysisState = {
		currentPageIndex: 0,
		totalPages: 2,
		currentStage: 'navigating',
		analyses: [],
	};

	expect(isAnalysisInProgress(state)).toBeTruthy();
});

test('isAnalysisInProgress returns true for capturing stage', () => {
	const state: AnalysisState = {
		currentPageIndex: 0,
		totalPages: 2,
		currentStage: 'capturing',
		analyses: [],
	};

	expect(isAnalysisInProgress(state)).toBeTruthy();
});

test('isAnalysisInProgress returns true for analyzing stage', () => {
	const state: AnalysisState = {
		currentPageIndex: 0,
		totalPages: 2,
		currentStage: 'analyzing',
		analyses: [],
	};

	expect(isAnalysisInProgress(state)).toBeTruthy();
});

test('isAnalysisInProgress returns true for generating-report stage', () => {
	const state: AnalysisState = {
		currentPageIndex: 2,
		totalPages: 2,
		currentStage: 'generating-report',
		analyses: [],
	};

	expect(isAnalysisInProgress(state)).toBeTruthy();
});

test('isAnalysisInProgress returns false for idle stage', () => {
	const state: AnalysisState = {
		currentPageIndex: 0,
		totalPages: 2,
		currentStage: 'idle',
		analyses: [],
	};

	expect(isAnalysisInProgress(state)).toBeFalsy();
});

test('isAnalysisInProgress returns false for complete stage', () => {
	const state: AnalysisState = {
		currentPageIndex: 2,
		totalPages: 2,
		currentStage: 'complete',
		analyses: [],
	};

	expect(isAnalysisInProgress(state)).toBeFalsy();
});

test('isAnalysisInProgress returns false for error stage', () => {
	const state: AnalysisState = {
		currentPageIndex: 1,
		totalPages: 2,
		currentStage: 'error',
		analyses: [],
		error: new Error('Fatal error'),
	};

	expect(isAnalysisInProgress(state)).toBeFalsy();
});

// UxFinding type structure tests
test('UxFinding has all required fields', () => {
	const finding: UxFinding = {
		severity: 'critical',
		category: 'Accessibility',
		description: 'Missing alt text on images',
		personaRelevance: ['Screen reader user'],
		recommendation: 'Add descriptive alt attributes',
		pageUrl: 'https://example.com',
	};

	expect(finding).toHaveProperty('severity');
	expect(finding).toHaveProperty('category');
	expect(finding).toHaveProperty('description');
	expect(finding).toHaveProperty('personaRelevance');
	expect(finding).toHaveProperty('recommendation');
	expect(finding).toHaveProperty('pageUrl');
});

test('UxFinding personaRelevance can be empty array', () => {
	const finding: UxFinding = {
		severity: 'low',
		category: 'Performance',
		description: 'Large image file size',
		personaRelevance: [],
		recommendation: 'Optimize images',
		pageUrl: 'https://example.com',
	};

	expect(finding.personaRelevance).toEqual([]);
});

// PageAnalysis type structure tests
test('PageAnalysis has all required fields', () => {
	const analysis: PageAnalysis = {
		pageUrl: 'https://example.com',
		features: 'User registration form',
		snapshot: '{"role":"form","children":[]}',
		findings: [],
		analysisTimestamp: Date.now(),
		status: 'complete',
	};

	expect(analysis).toHaveProperty('pageUrl');
	expect(analysis).toHaveProperty('features');
	expect(analysis).toHaveProperty('snapshot');
	expect(analysis).toHaveProperty('findings');
	expect(analysis).toHaveProperty('analysisTimestamp');
	expect(analysis).toHaveProperty('status');
});

test('PageAnalysis error field is optional', () => {
	const successfulAnalysis: PageAnalysis = {
		pageUrl: 'https://example.com',
		features: 'Login form',
		snapshot: '{"role":"form"}',
		findings: [],
		analysisTimestamp: Date.now(),
		status: 'complete',
	};

	expect(successfulAnalysis.error).toBeUndefined();

	const failedAnalysis: PageAnalysis = {
		...successfulAnalysis,
		status: 'failed',
		error: 'Page not found',
	};

	expect(failedAnalysis.error).toBe('Page not found');
});
