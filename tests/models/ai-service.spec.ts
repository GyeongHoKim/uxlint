/**
 * AI Service Tests
 * Unit tests for AI prompt building and response parsing
 */

import {
	buildAnalysisPrompt,
	buildSystemPrompt,
	extractSummary,
	parseAnalysisResponse,
} from '../../source/services/ai-service.js';
import type {UxFinding} from '../../source/models/analysis.js';

// BuildSystemPrompt tests
describe('buildSystemPrompt', () => {
	test('formats single persona into system prompt', () => {
		const personas = ['Screen reader user'];

		const prompt = buildSystemPrompt(personas, false);

		expect(prompt).toContain('Screen reader user');
		expect(prompt).toContain('UX');
		expect(prompt).toContain('accessibility');
	});

	test('formats multiple personas into system prompt', () => {
		const personas = ['Screen reader user', 'Mobile user on slow connection'];

		const prompt = buildSystemPrompt(personas, false);

		expect(prompt).toContain('Screen reader user');
		expect(prompt).toContain('Mobile user on slow connection');
		expect(prompt).toContain('persona');
	});

	test('creates valid system prompt with empty personas', () => {
		const personas: string[] = [];

		const prompt = buildSystemPrompt(personas, false);

		expect(prompt.length).toBeGreaterThan(0);
		expect(prompt).toContain('UX');
	});

	test('system prompt includes analysis guidelines', () => {
		const personas = ['General user'];

		const prompt = buildSystemPrompt(personas, false);

		expect(prompt).toContain('analyze');
		expect(prompt).toContain('finding');
	});
});

// BuildAnalysisPrompt tests
describe('buildAnalysisPrompt', () => {
	test('combines snapshot, features, and personas into structured prompt', () => {
		const prompt = buildAnalysisPrompt(
			{
				snapshot: '{"role":"form","children":[]}',
				pageUrl: 'https://example.com',
				features: 'Login form with OAuth',
				personas: ['Screen reader user'],
			},
			false,
		);

		expect(prompt).toContain('{"role":"form","children":[]}');
		expect(prompt).toContain('Login form with OAuth');
		expect(prompt).toContain('https://example.com');
	});

	test('includes page URL in prompt', () => {
		const prompt = buildAnalysisPrompt(
			{
				snapshot: '{"role":"main"}',
				pageUrl: 'https://example.com/dashboard',
				features: 'User dashboard',
				personas: ['Power user'],
			},
			false,
		);

		expect(prompt).toContain('https://example.com/dashboard');
	});

	test('handles long feature descriptions', () => {
		const longFeatures =
			'A' + 'very long feature description '.repeat(50) + 'end';

		const prompt = buildAnalysisPrompt(
			{
				snapshot: '{"role":"main"}',
				pageUrl: 'https://example.com',
				features: longFeatures,
				personas: ['User'],
			},
			false,
		);

		expect(prompt).toContain(longFeatures);
	});

	test('formats multiple personas in prompt', () => {
		const prompt = buildAnalysisPrompt(
			{
				snapshot: '{"role":"main"}',
				pageUrl: 'https://example.com',
				features: 'Dashboard',
				personas: ['Persona A', 'Persona B', 'Persona C'],
			},
			false,
		);

		expect(prompt).toContain('Persona A');
		expect(prompt).toContain('Persona B');
		expect(prompt).toContain('Persona C');
	});
});

// ParseAnalysisResponse tests
describe('parseAnalysisResponse', () => {
	test('extracts findings from markdown response', () => {
		const response = `
## Finding 1
**Severity**: high
**Category**: Accessibility
**Description**: Missing form labels
**Personas Affected**: Screen reader user
**Recommendation**: Add label elements

## Finding 2
**Severity**: medium
**Category**: Usability
**Description**: Low contrast button
**Personas Affected**: Low vision user
**Recommendation**: Increase contrast ratio
`;

		const result = parseAnalysisResponse(response, 'https://example.com');

		expect(result.findings).toHaveLength(2);
		expect(result.findings[0]?.severity).toBe('high');
		expect(result.findings[0]?.category).toBe('Accessibility');
		expect(result.findings[0]?.description).toBe('Missing form labels');
		expect(result.findings[0]?.personaRelevance).toEqual([
			'Screen reader user',
		]);
		expect(result.findings[0]?.recommendation).toBe('Add label elements');
		expect(result.findings[0]?.pageUrl).toBe('https://example.com');
	});

	test('handles multiple personas in finding', () => {
		const response = `
## Finding 1
**Severity**: critical
**Category**: Security
**Description**: Insecure authentication
**Personas Affected**: All users, Mobile users
**Recommendation**: Implement 2FA
`;

		const result = parseAnalysisResponse(response, 'https://example.com');

		expect(result.findings[0]?.personaRelevance).toEqual([
			'All users',
			'Mobile users',
		]);
	});

	test('returns empty findings for malformed response', () => {
		const response = 'This is not a properly formatted response';

		const result = parseAnalysisResponse(response, 'https://example.com');

		expect(result.findings).toEqual([]);
	});

	test('handles response with no findings', () => {
		const response = `
No significant UX issues were found on this page.
`;

		const result = parseAnalysisResponse(response, 'https://example.com');

		expect(result.findings).toEqual([]);
	});

	test('extracts summary from response', () => {
		const response = `
## Summary
This page has 2 accessibility issues affecting screen reader users.

## Finding 1
**Severity**: high
**Category**: Accessibility
**Description**: Issue description
**Personas Affected**: Screen reader user
**Recommendation**: Fix it
`;

		const result = parseAnalysisResponse(response, 'https://example.com');

		expect(result.summary).toContain('2 accessibility issues');
		expect(result.summary).toContain('screen reader users');
	});

	test('assigns correct page URL to all findings', () => {
		const response = `
## Finding 1
**Severity**: low
**Category**: Performance
**Description**: Slow loading
**Personas Affected**: Mobile user
**Recommendation**: Optimize images

## Finding 2
**Severity**: high
**Category**: Accessibility
**Description**: Missing alt text
**Personas Affected**: Screen reader user
**Recommendation**: Add alt attributes
`;

		const pageUrl = 'https://example.com/products';
		const result = parseAnalysisResponse(response, pageUrl);

		expect(result.findings[0]?.pageUrl).toBe(pageUrl);
		expect(result.findings[1]?.pageUrl).toBe(pageUrl);
	});

	test('validates severity levels', () => {
		const response = `
## Finding 1
**Severity**: critical
**Category**: Security
**Description**: XSS vulnerability
**Personas Affected**: All users
**Recommendation**: Sanitize input
`;

		const result = parseAnalysisResponse(response, 'https://example.com');

		expect(result.findings[0]?.severity).toBe('critical');
	});

	test('handles missing optional fields gracefully', () => {
		const response = `
## Finding 1
**Severity**: medium
**Category**: Usability
**Description**: Confusing navigation
**Personas Affected**:
**Recommendation**: Simplify menu structure
`;

		const result = parseAnalysisResponse(response, 'https://example.com');

		expect(result.findings[0]?.personaRelevance).toEqual([]);
	});
});

// ExtractSummary tests
describe('extractSummary', () => {
	test('extracts summary section from AI response', () => {
		const response = `
## Summary
This analysis found 3 critical issues.

## Finding 1
...
`;

		const summary = extractSummary(response);

		expect(summary).toContain('3 critical issues');
	});

	test('returns default message when no summary found', () => {
		const response = 'Just some findings without summary section';

		const summary = extractSummary(response);

		expect(summary.length).toBeGreaterThan(0);
	});

	test('handles multi-line summary', () => {
		const response = `
## Summary
This page has several issues:
- 2 critical security problems
- 3 accessibility barriers
- 1 performance concern
`;

		const summary = extractSummary(response);

		expect(summary).toContain('2 critical security problems');
		expect(summary).toContain('3 accessibility barriers');
		expect(summary).toContain('1 performance concern');
	});
});

// Type validation tests
describe('parseAnalysisResponse type validation', () => {
	test('returns UxFinding[] with correct types', () => {
		const response = `
## Finding 1
**Severity**: high
**Category**: Accessibility
**Description**: Test description
**Personas Affected**: User A
**Recommendation**: Fix it
`;

		const result = parseAnalysisResponse(response, 'https://example.com');

		const finding: UxFinding = result.findings[0]!;
		expect(typeof finding.severity).toBe('string');
		expect(typeof finding.category).toBe('string');
		expect(typeof finding.description).toBe('string');
		expect(Array.isArray(finding.personaRelevance)).toBeTruthy();
		expect(typeof finding.recommendation).toBe('string');
		expect(typeof finding.pageUrl).toBe('string');
	});

	test('returns AnalysisResult with correct structure', () => {
		const response = 'Test response';

		const result = parseAnalysisResponse(response, 'https://example.com');

		expect(result).toHaveProperty('findings');
		expect(result).toHaveProperty('summary');
		expect(Array.isArray(result.findings)).toBeTruthy();
		expect(typeof result.summary).toBe('string');
	});
});
