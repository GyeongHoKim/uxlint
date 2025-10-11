// Using Jest globals
import {
	type Page,
	type ReportConfig,
	type UxLintConfig,
	isPage,
	isReportConfig,
	isUxLintConfig,
} from '../../source/models/config.js';

// Page type tests
test('isPage validates correct page structure', () => {
	const validPage: Page = {
		url: 'https://example.com',
		features: 'Key features description',
	};

	expect(isPage(validPage)).toBeTruthy();
});

test('isPage rejects invalid page structures', () => {
	expect(isPage({})).toBeFalsy();
	expect(isPage({url: 'https://example.com'})).toBeFalsy();
	expect(isPage({features: 'description'})).toBeFalsy();
	expect(isPage({url: 123, features: 'description'})).toBeFalsy();
	expect(isPage(null)).toBeFalsy();
	expect(isPage(undefined)).toBeFalsy();
	expect(isPage('not an object')).toBeFalsy();
});

// ReportConfig type tests
test('isReportConfig validates correct report config structure', () => {
	const validConfig: ReportConfig = {
		output: './report.md',
	};

	expect(isReportConfig(validConfig)).toBeTruthy();
});

test('isReportConfig rejects invalid report config structures', () => {
	expect(isReportConfig({})).toBeFalsy();
	expect(isReportConfig({output: 123})).toBeFalsy();
	expect(isReportConfig(null)).toBeFalsy();
	expect(isReportConfig(undefined)).toBeFalsy();
});

// UxLintConfig type tests
test('isUxLintConfig validates correct config structure', () => {
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

	expect(isUxLintConfig(validConfig)).toBeTruthy();
});

test('isUxLintConfig rejects invalid config structures', () => {
	expect(isUxLintConfig({})).toBeFalsy();
	expect(
		isUxLintConfig({
			mainPageUrl: 'https://example.com',
		}),
	).toBeFalsy();
	expect(
		isUxLintConfig({
			mainPageUrl: 123,
			subPageUrls: ['https://example.com/about'],
			pages: [],
			personas: [],
			report: {output: './report.md'},
		}),
	).toBeFalsy();
});

test('isUxLintConfig validates nested page structures', () => {
	const configWithInvalidPage = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [
			{
				url: 'https://example.com',
				features: 'Valid features',
			},
			{
				url: 'https://example.com/invalid',
				// Missing features field - intentionally invalid
			},
		],
		personas: ['User persona'],
		report: {output: './report.md'},
	};

	expect(isUxLintConfig(configWithInvalidPage)).toBeFalsy();
});

test('isUxLintConfig validates personas array', () => {
	const configWithInvalidPersonas = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [],
		personas: [123, 'valid persona'],
		report: {output: './report.md'},
	};

	expect(isUxLintConfig(configWithInvalidPersonas)).toBeFalsy();
});

test('isUxLintConfig validates subPageUrls array', () => {
	const configWithInvalidSubPages = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [123, 'https://example.com'],
		pages: [],
		personas: ['persona'],
		report: {output: './report.md'},
	};

	expect(isUxLintConfig(configWithInvalidSubPages)).toBeFalsy();
});
