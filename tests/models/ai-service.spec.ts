/**
 * AI Service Tests
 * Unit tests for AI prompt building with structured output
 */

import {
	buildAnalysisPrompt,
	buildSystemPrompt,
} from '../../source/services/ai-service.js';

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

	test('includes tool instructions when hasTools=true', () => {
		const personas = ['Screen reader user'];

		const prompt = buildSystemPrompt(personas, true);

		expect(prompt).toContain('browser_navigate');
		expect(prompt).toContain('browser_take_screenshot');
		expect(prompt).toContain('browser_snapshot');
		expect(prompt).toContain('accessibility tree');
	});

	test('omits tool instructions when hasTools=false', () => {
		const personas = ['Screen reader user'];

		const prompt = buildSystemPrompt(personas, false);

		expect(prompt).not.toContain('browser_navigate');
		expect(prompt).not.toContain('browser_take_screenshot');
	});

	test('emphasizes screenshot requirement when tools are available', () => {
		const personas = ['Mobile user'];

		const prompt = buildSystemPrompt(personas, true);

		expect(prompt).toContain('screenshot');
		expect(prompt).toContain('visual');
		expect(prompt).toContain('REQUIRED');
	});

	test('includes comprehensive UX analysis framework', () => {
		const personas = ['General user'];

		const prompt = buildSystemPrompt(personas, false);

		expect(prompt).toContain('Accessibility');
		expect(prompt).toContain('Usability');
		expect(prompt).toContain('Performance');
		expect(prompt).toContain('Visual Design');
		expect(prompt).toContain('Content');
		expect(prompt).toContain('Mobile Responsiveness');
	});

	test('instructs AI to always provide findings', () => {
		const personas = ['General user'];

		const prompt = buildSystemPrompt(personas, false);

		expect(prompt).toContain('at least 2-3 findings');
		expect(prompt).toContain('even for well-designed pages');
	});

	test('includes WCAG guidelines reference', () => {
		const personas = ['Screen reader user'];

		const prompt = buildSystemPrompt(personas, false);

		expect(prompt).toContain('WCAG');
		expect(prompt).toContain('color contrast');
		expect(prompt).toContain('ARIA');
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

	test('omits snapshot when hasTools=true', () => {
		const prompt = buildAnalysisPrompt(
			{
				pageUrl: 'https://example.com',
				features: 'Login form',
				personas: ['Screen reader user'],
			},
			true,
		);

		expect(prompt).not.toContain('Accessibility Tree Snapshot');
		expect(prompt).not.toContain('```json');
	});

	test('includes navigation instructions when hasTools=true', () => {
		const prompt = buildAnalysisPrompt(
			{
				pageUrl: 'https://example.com',
				features: 'Login form',
				personas: ['Mobile user'],
			},
			true,
		);

		expect(prompt).toContain('Navigate to the page URL');
		expect(prompt).toContain('Take a screenshot');
		expect(prompt).toContain('accessibility tree snapshot');
	});

	test('requires snapshot when hasTools=false', () => {
		expect(() => {
			buildAnalysisPrompt(
				{
					pageUrl: 'https://example.com',
					features: 'Dashboard',
					personas: ['User'],
				},
				false,
			);
		}).toThrow('Snapshot is required when MCP tools are not available');
	});

	test('allows missing snapshot when hasTools=true', () => {
		const prompt = buildAnalysisPrompt(
			{
				pageUrl: 'https://example.com',
				features: 'Dashboard',
				personas: ['User'],
			},
			true,
		);

		expect(prompt).toContain('https://example.com');
		expect(prompt).toContain('Dashboard');
	});

	test('includes evaluation checklist', () => {
		const prompt = buildAnalysisPrompt(
			{
				pageUrl: 'https://example.com',
				features: 'Login form',
				personas: ['User'],
			},
			true,
		);

		expect(prompt).toContain('Evaluation Checklist');
		expect(prompt).toContain('Accessibility issues');
		expect(prompt).toContain('Usability problems');
		expect(prompt).toContain('Performance concerns');
	});

	test('emphasizes finding opportunities for improvement', () => {
		const prompt = buildAnalysisPrompt(
			{
				pageUrl: 'https://example.com',
				features: 'Dashboard',
				personas: ['User'],
			},
			true,
		);

		expect(prompt).toContain('IMPORTANT');
		expect(prompt).toContain('at least 2-3 opportunities');
		expect(prompt).toContain('even if the page is well-designed');
	});

	test('mentions structured format output', () => {
		const prompt = buildAnalysisPrompt(
			{
				pageUrl: 'https://example.com',
				features: 'Form',
				personas: ['User'],
			},
			true,
		);

		expect(prompt).toContain('structured format');
		expect(prompt).toContain('actionable recommendations');
	});
});

// Structured output with experimental_output
describe('structured output with experimental_output', () => {
	test('system prompt encourages finding issues', () => {
		const prompt = buildSystemPrompt(['Test user'], false);

		// Verify the prompt explicitly asks for findings even on well-designed pages
		expect(prompt.toLowerCase()).toMatch(/at least \d+-\d+ findings/);
		expect(prompt.toLowerCase()).toContain('even for well-designed pages');
	});

	test('system prompt includes UX analysis framework', () => {
		const prompt = buildSystemPrompt(['Test user'], true);

		// Verify comprehensive UX framework is included
		expect(prompt).toContain('Accessibility');
		expect(prompt).toContain('Usability');
		expect(prompt).toContain('Performance');
		expect(prompt).toContain('Visual Design');
		expect(prompt).toContain('Content');
		expect(prompt).toContain('Mobile Responsiveness');
	});

	test('analysis prompt includes comprehensive checklist', () => {
		const prompt = buildAnalysisPrompt(
			{
				pageUrl: 'https://example.com',
				features: 'Homepage',
				personas: ['User'],
			},
			true,
		);

		// Verify checklist covers key UX dimensions
		const lowerPrompt = prompt.toLowerCase();
		expect(lowerPrompt).toContain('accessibility');
		expect(lowerPrompt).toContain('usability');
		expect(lowerPrompt).toContain('performance');
		expect(lowerPrompt).toContain('visual design');
		expect(lowerPrompt).toContain('content');
		expect(lowerPrompt).toContain('mobile');
	});

	test('analysis prompt includes tool usage instructions', () => {
		const prompt = buildAnalysisPrompt(
			{
				pageUrl: 'https://example.com',
				features: 'Interactive dashboard',
				personas: ['User'],
			},
			true,
		);

		// Verify tool usage instructions
		expect(prompt).toContain('browser_resize');
		expect(prompt).toContain('browser_click');
		expect(prompt).toContain('browser_press_key');
	});
});
