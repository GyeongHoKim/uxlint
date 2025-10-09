import test from 'ava';
import {
	type Page,
	type ReportConfig,
	type UxLintConfig,
	isPage,
	isReportConfig,
	isUxLintConfig,
} from '../../source/models/config.js';

// Page type tests
test('isPage validates correct page structure', t => {
	const validPage: Page = {
		url: 'https://example.com',
		features: 'Key features description',
	};

	t.true(isPage(validPage));
});

test('isPage rejects invalid page structures', t => {
	t.false(isPage({}));
	t.false(isPage({url: 'https://example.com'}));
	t.false(isPage({features: 'description'}));
	t.false(isPage({url: 123, features: 'description'}));
	t.false(isPage(null));
	t.false(isPage(undefined));
	t.false(isPage('not an object'));
});

// ReportConfig type tests
test('isReportConfig validates correct report config structure', t => {
	const validConfig: ReportConfig = {
		output: './report.md',
	};

	t.true(isReportConfig(validConfig));
});

test('isReportConfig rejects invalid report config structures', t => {
	t.false(isReportConfig({}));
	t.false(isReportConfig({output: 123}));
	t.false(isReportConfig(null));
	t.false(isReportConfig(undefined));
});

// UxLintConfig type tests
test('isUxLintConfig validates correct config structure', t => {
	const validConfig: UxLintConfig = {
		mainPageUrl: 'https://example.com',
		subPageUrls: ['https://example.com/about'],
		pages: [
			{
				url: 'https://example.com',
				features: 'Homepage features',
			},
		],
		personas: ['Tech-savvy user'],
		report: {
			output: './report.md',
		},
	};

	t.true(isUxLintConfig(validConfig));
});

test('isUxLintConfig rejects invalid config structures', t => {
	t.false(isUxLintConfig({}));
	t.false(
		isUxLintConfig({
			mainPageUrl: 'https://example.com',
			// Missing required fields
		}),
	);
	t.false(
		isUxLintConfig({
			mainPageUrl: 123, // Wrong type
			subPageUrls: ['https://example.com/about'],
			pages: [],
			personas: [],
			report: {output: './report.md'},
		}),
	);
});

test('isUxLintConfig validates nested page structures', t => {
	const configWithInvalidPage: UxLintConfig = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [
			{
				url: 'https://example.com',
				features: 'Valid features',
			},
			// @ts-expect-error - Testing invalid page structure
			{
				url: 'https://example.com/invalid',
				// Missing features field
			},
		],
		personas: ['User persona'],
		report: {output: './report.md'},
	};

	t.false(isUxLintConfig(configWithInvalidPage));
});

test('isUxLintConfig validates personas array', t => {
	const configWithInvalidPersonas = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [],
		personas: [123, 'valid persona'], // Invalid: contains number
		report: {output: './report.md'},
	};

	t.false(isUxLintConfig(configWithInvalidPersonas));
});

test('isUxLintConfig validates subPageUrls array', t => {
	const configWithInvalidSubPages = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [123, 'https://example.com'], // Invalid: contains number
		pages: [],
		personas: ['persona'],
		report: {output: './report.md'},
	};

	t.false(isUxLintConfig(configWithInvalidSubPages));
});
