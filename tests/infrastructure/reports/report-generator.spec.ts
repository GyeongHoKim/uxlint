/**
 * Unit tests for markdown report rendering
 *
 * The generator is a pure function over UxReport, so Constitution II puts it
 * under unit tests. It had none, which is why a page could be recorded as
 * failed and still render without saying why.
 */

import test from 'ava';
import type {PageAnalysis, UxReport} from '../../../source/models/analysis.js';
import {noMeasurement} from '../../../source/models/measurement.js';
import {generateMarkdownReport} from '../../../source/infrastructure/reports/report-generator.js';

const buildPage = (overrides: Partial<PageAnalysis>): PageAnalysis => ({
	pageUrl: 'https://example.com',
	features: 'features',
	snapshot: '',
	findings: [],
	analysisTimestamp: 0,
	status: 'complete',
	// Unmeasured unless a test says otherwise, which is the honest default:
	// a page built without an audit is one that was not audited.
	measurement: noMeasurement('page-not-loaded'),
	...overrides,
});

const buildReport = (pages: PageAnalysis[]): UxReport => ({
	metadata: {
		timestamp: 0,
		analyzedPages: pages
			.filter(page => page.status === 'complete')
			.map(page => page.pageUrl),
		partialPages: pages
			.filter(page => page.status === 'partial')
			.map(page => page.pageUrl),
		failedPages: pages
			.filter(page => page.status === 'failed')
			.map(page => page.pageUrl),
		totalFindings: 0,
		persona: 'Test persona',
		tooling: {
			browserServer: 'chrome-devtools-mcp',
			browserServerVersion: '1.7.0',
			browserVersion: 'Google Chrome 151.0.0.0',
			externalDataAllowed: false,
		},
	},
	pages,
	summary: 'Test summary',
	prioritizedFindings: [],
});

test('a failed page renders with the reason it failed', t => {
	const markdown = generateMarkdownReport(
		buildReport([
			buildPage({
				pageUrl: 'https://example.com/broken',
				status: 'failed',
				error: 'navigation timed out',
			}),
		]),
	);

	t.regex(markdown, /https:\/\/example\.com\/broken/);
	t.regex(
		markdown,
		/navigation timed out/,
		'a report that says a page failed without saying why sends the reader to the log files',
	);
});

test('a partial page is flagged instead of passing as analysed', t => {
	const markdown = generateMarkdownReport(
		buildReport([
			buildPage({pageUrl: 'https://example.com/cut', status: 'partial'}),
		]),
	);

	t.regex(markdown, /\*\*Partial Pages\*\*: 1/);
	t.regex(markdown, /Partial — the analysis was cut short/);
	t.regex(markdown, /Pages Analyzed\*\*: 0 successful/);
});

test('a failed page still shows what it managed to find', t => {
	const markdown = generateMarkdownReport(
		buildReport([
			buildPage({
				pageUrl: 'https://example.com/died',
				status: 'failed',
				error: 'threw on iteration 15',
				findings: [
					{
						severity: 'high',
						category: 'Accessibility',
						description: 'Missing alt text',
						personaRelevance: ['Test persona'],
						recommendation: 'Add alt text',
						pageUrl: 'https://example.com/died',
						origin: 'judgement',
					},
				],
			}),
		]),
	);

	t.regex(markdown, /Missing alt text/, 'pre-failure findings are rendered');
	t.regex(markdown, /Status\*\*: Failed/);
});

test('a fully analysed page renders no partial or failure noise', t => {
	const markdown = generateMarkdownReport(
		buildReport([buildPage({pageUrl: 'https://example.com/ok'})]),
	);

	t.notRegex(markdown, /Partial Pages/);
	t.notRegex(markdown, /Failed Pages/);
	t.regex(markdown, /### https:\/\/example\.com\/ok/);
});

test('the saved report states what produced it', t => {
	// Asserting the rendered markdown, not the in-memory object. The object
	// carried provenance from the start while the artefact did not, and a
	// test that reads the object cannot tell the difference.
	const markdown = generateMarkdownReport(buildReport([]));

	t.true(markdown.includes('chrome-devtools-mcp@1.7.0'));
	t.true(markdown.includes('Google Chrome 151.0.0.0'));
});

test('a report says so when the run could consult external data', t => {
	const report = buildReport([]);
	report.metadata.tooling.externalDataAllowed = true;

	const markdown = generateMarkdownReport(report);

	t.regex(markdown, /External Data/);
});

test('a report stays silent about external data when none was permitted', t => {
	const markdown = generateMarkdownReport(buildReport([]));

	t.false(markdown.includes('External Data'));
});
