import test from 'ava';
import {isPage, isUxLintConfig} from '../../source/models/config.js';

test('isPage() returns true for valid page object', t => {
	const page = {
		url: 'https://example.com',
		features: 'Test features',
	};
	t.true(isPage(page));
});

test('isPage() returns false for null', t => {
	t.false(isPage(null));
});

test('isPage() returns false for missing features', t => {
	t.false(isPage({url: 'https://example.com'}));
});

test('isPage() returns false for missing url', t => {
	t.false(isPage({features: 'Test'}));
});

test('isPage() returns false for non-object', t => {
	t.false(isPage('string'));
	t.false(isPage(123));
	t.false(isPage([]));
});

test('isUxLintConfig() returns true for valid config', t => {
	const config = {
		mainPageUrl: 'https://example.com',
		subPageUrls: ['https://example.com/about'],
		pages: [{url: 'https://example.com', features: 'Test features'}],
		persona: 'Test persona description with at least 20 characters',
		report: {output: './report.md'},
	};
	t.true(isUxLintConfig(config));
});

test('isUxLintConfig() returns false for missing mainPageUrl', t => {
	const config = {
		subPageUrls: [],
		pages: [],
		persona: 'Test persona',
		report: {output: './report.md'},
	};
	t.false(isUxLintConfig(config));
});

test('isUxLintConfig() returns false for empty persona', t => {
	const config = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [],
		persona: '',
		report: {output: './report.md'},
	};
	t.false(isUxLintConfig(config));
});

test('isUxLintConfig() returns false for invalid pages array', t => {
	const config = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [{url: 'https://example.com'}],
		persona: 'Test persona',
		report: {output: './report.md'},
	};
	t.false(isUxLintConfig(config));
});

test('isUxLintConfig() returns true for config with AI settings (anthropic)', t => {
	const config = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [{url: 'https://example.com', features: 'Test features'}],
		persona: 'Test persona description with at least 20 characters',
		report: {output: './report.md'},
		ai: {
			provider: 'anthropic',
			apiKey: 'test-api-key',
			model: 'claude-sonnet-4-5-20250929',
		},
	};
	t.true(isUxLintConfig(config));
});

test('isUxLintConfig() returns true for config with AI settings (openai)', t => {
	const config = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [{url: 'https://example.com', features: 'Test features'}],
		persona: 'Test persona description with at least 20 characters',
		report: {output: './report.md'},
		ai: {
			provider: 'openai',
			apiKey: 'test-api-key',
		},
	};
	t.true(isUxLintConfig(config));
});

test('isUxLintConfig() returns true for config with AI settings (ollama)', t => {
	const config = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [{url: 'https://example.com', features: 'Test features'}],
		persona: 'Test persona description with at least 20 characters',
		report: {output: './report.md'},
		ai: {
			provider: 'ollama',
			baseUrl: 'http://localhost:11434/api',
		},
	};
	t.true(isUxLintConfig(config));
});

test('isUxLintConfig() returns false for config with invalid AI provider', t => {
	const config = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [{url: 'https://example.com', features: 'Test features'}],
		persona: 'Test persona description with at least 20 characters',
		report: {output: './report.md'},
		ai: {
			provider: 'invalid-provider',
			apiKey: 'test-api-key',
		},
	};
	t.false(isUxLintConfig(config));
});

test('isUxLintConfig() returns false for config with AI settings missing apiKey (non-ollama)', t => {
	const config = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [{url: 'https://example.com', features: 'Test features'}],
		persona: 'Test persona description with at least 20 characters',
		report: {output: './report.md'},
		ai: {
			provider: 'anthropic',
		},
	};
	t.false(isUxLintConfig(config));
});
