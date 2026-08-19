/**
 * Unit tests for markdown report rendering
 *
 * The generator is a pure function over UxReport, so Constitution II puts it
 * under unit tests. It had none, which is why a page could be recorded as
 * failed and still render without saying why.
 */

import test from 'ava';
import type {
	PageAnalysis,
	UxFinding,
	UxReport,
} from '../../../source/models/analysis.js';
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

// --- provenance in the rendered report -----------------------------------

const measuredFinding = (overrides: Partial<UxFinding> = {}): UxFinding => ({
	severity: 'high',
	category: 'Accessibility',
	description:
		'Background and foreground colors do not have a sufficient contrast ratio.',
	personaRelevance: [],
	recommendation: '',
	pageUrl: 'https://example.com',
	origin: 'audit',
	ruleId: 'color-contrast',
	affectedElements: 3,
	...overrides,
});

const judgedFinding = (overrides: Partial<UxFinding> = {}): UxFinding => ({
	severity: 'medium',
	category: 'Content',
	description: 'The button label does not say what happens next',
	personaRelevance: ['A shopper in a hurry'],
	recommendation: 'Name the action',
	pageUrl: 'https://example.com',
	origin: 'judgement',
	...overrides,
});

const withFindings = (findings: UxFinding[]): UxReport => {
	const page = buildPage({findings, measurement: measuredPage()});
	const report = buildReport([page]);
	report.prioritizedFindings = findings;
	report.metadata.totalFindings = findings.length;
	return report;
};

const measuredPage = (): PageAnalysis['measurement'] => ({
	audit: {
		state: 'taken',
		value: {
			scores: {accessibility: 67, seo: 50},
			violations: [
				{
					ruleId: 'color-contrast',
					title:
						'Background and foreground colors do not have a sufficient contrast ratio.',
					impact: 'serious',
					affectedElements: 3,
				},
			],
			snapshotMode: true,
		},
	},
	trace: {
		state: 'taken',
		value: {
			largestContentfulPaint: {state: 'taken', value: 80},
			cumulativeLayoutShift: {state: 'taken', value: 0},
		},
	},
});

test('every finding states its origin', t => {
	// SC-002. Checked against the rendered file, in both places a finding is
	// listed: a reader who opens the per-page section must not have to scroll
	// to the prioritised list to learn whether a claim was verified.
	const markdown = generateMarkdownReport(
		withFindings([measuredFinding(), judgedFinding()]),
	);

	const findingLines = markdown
		.split('\n')
		.filter(line => line.startsWith('- 🟠') || line.startsWith('- 🟡'));

	t.is(findingLines.length, 2);
	for (const line of findingLines) {
		t.true(
			line.includes('measured') || line.includes('AI judgement'),
			`finding rendered without an origin: ${line}`,
		);
	}

	// And again in the prioritised listing.
	t.is(markdown.match(/\*\*Source\*\*:/g)?.length, 2);
});

test('a measured finding names its rule and a judged one does not', t => {
	// SC-006 and the full invariant of the rule identifier: present on every
	// measured finding, absent from every judged one. A renderer that printed
	// a rule id on a judgement would be claiming a verification never made.
	const markdown = generateMarkdownReport(
		withFindings([measuredFinding(), judgedFinding()]),
	);

	t.true(markdown.includes('`color-contrast`'));
	t.true(markdown.includes('3 elements'));

	const judgedSection = markdown.slice(
		markdown.lastIndexOf('The button label does not say what happens next'),
	);
	t.false(judgedSection.includes('`color-contrast`'));
	t.true(judgedSection.includes('AI judgement'));
});

test('one finding per rule', t => {
	// A rule that failed on three elements is one finding stating three, not
	// three findings. Forty findings for one CSS rule would drown the report
	// this feature exists to make trustworthy.
	const markdown = generateMarkdownReport(withFindings([measuredFinding()]));

	// Once in the page listing and once in the prioritised listing -- that is
	// one finding rendered twice, not two findings.
	t.is(markdown.match(/`color-contrast`/g)?.length, 2);
	t.is(markdown.match(/3 elements/g)?.length, 2);
	t.is(markdown.match(/\*\*Source\*\*:/g)?.length, 1);
});

test('one note per page', t => {
	// SC-010. The model writes one note about the whole violation set, and it
	// is rendered as judgement, outside the findings it discusses.
	const page = buildPage({
		findings: [measuredFinding()],
		measurement: measuredPage(),
		measurementNote:
			'For a shopper in a hurry the grey-on-white price is the problem.',
	});
	const report = buildReport([page]);
	report.prioritizedFindings = page.findings;

	const markdown = generateMarkdownReport(report);

	t.is(markdown.match(/AI note on the measured issues/g)?.length, 1);
	t.true(markdown.includes('judgement, not measurement'));

	// The note sits after the findings, not inside one of them.
	t.true(
		markdown.indexOf('AI note on the measured issues') >
			markdown.indexOf('**Accessibility**:'),
	);
});

test('absent measurement', t => {
	// SC-004. Three cases in one table: measured, audit failed, and a trace
	// that succeeded while reporting no paint. None may render as a number.
	const report = buildReport([
		buildPage({pageUrl: 'https://example.com/a', measurement: measuredPage()}),
		buildPage({
			pageUrl: 'https://example.com/b',
			measurement: {
				audit: {state: 'not-taken', reason: 'tool-failed'},
				trace: {state: 'not-taken', reason: 'timed-out'},
			},
		}),
		buildPage({
			pageUrl: 'https://example.com/c',
			measurement: {
				audit: {state: 'not-taken', reason: 'page-not-loaded'},
				trace: {
					state: 'taken',
					value: {
						// A trace that captured no navigation reports layout shift
						// and no paint. Succeeding is not the same as complete.
						largestContentfulPaint: {state: 'not-taken', reason: 'unparseable'},
						cumulativeLayoutShift: {state: 'taken', value: 0.02},
					},
				},
			},
		}),
	]);

	const markdown = generateMarkdownReport(report);

	t.true(
		markdown.includes('| https://example.com/a | 67/100 | 80 ms | 0.00 |'),
	);
	t.true(markdown.includes('not measured (tool-failed)'));
	t.true(markdown.includes('not measured (timed-out)'));
	// The trace succeeded here, so the absence is the metric's own.
	t.true(
		markdown.includes(
			'| https://example.com/c | not measured (page-not-loaded) | not measured | 0.02 |',
		),
	);
});

test('no performance finding', t => {
	// SC-009. Performance is a number in the statistics or it is absent. It is
	// never a finding, measured or judged.
	const markdown = generateMarkdownReport(
		withFindings([measuredFinding(), judgedFinding()]),
	);

	const findingLines = markdown
		.split('\n')
		.filter(line => line.startsWith('- ') && line.includes('**'));

	for (const line of findingLines) {
		t.false(line.includes('Performance'), `performance finding: ${line}`);
	}

	// But the numbers themselves are present.
	t.true(markdown.includes('LCP'));
	t.true(markdown.includes('CLS'));
});

test('first contentful paint is never reported', t => {
	// The trace does not measure one; the only FCP figure it carries is a
	// projected saving from a suggested fix. Publishing that as the page's FCP
	// would fabricate exactly the kind of number this feature removes.
	const markdown = generateMarkdownReport(withFindings([measuredFinding()]));

	t.false(markdown.includes('| FCP |'));
	t.true(markdown.includes('First Contentful Paint is not reported'));
});

test('a rule failing on several pages is summarised once', t => {
	const pages = ['a', 'b', 'c'].map(name =>
		buildPage({
			pageUrl: `https://example.com/${name}`,
			measurement: measuredPage(),
			findings: [measuredFinding({pageUrl: `https://example.com/${name}`})],
		}),
	);
	const report = buildReport(pages);
	report.prioritizedFindings = pages.flatMap(page => page.findings);

	const markdown = generateMarkdownReport(report);

	t.true(markdown.includes('Recurring across pages'));
	t.true(markdown.includes('| `color-contrast` | 3 |'));
	// It counts pages, not findings, and says the gate still counts findings.
	t.true(markdown.includes('The gate counts the findings'));
});

test('a rule on one page is not called recurring', t => {
	const markdown = generateMarkdownReport(withFindings([measuredFinding()]));

	t.false(markdown.includes('Recurring across pages'));
});

test('the recurrence summary never names a rule the findings do not', t => {
	// Derived at render time rather than stored, so it cannot drift from the
	// findings it summarises. This asserts that property directly.
	const markdown = generateMarkdownReport(withFindings([judgedFinding()]));

	t.false(markdown.includes('Recurring across pages'));
	t.false(markdown.includes('`color-contrast`'));
});

test('an audited page with nothing wrong says so', t => {
	// "Audited, clean" and "never audited" are different facts, and a silent
	// section makes them look the same.
	const clean = buildPage({
		measurement: {
			audit: {
				state: 'taken',
				value: {
					scores: {accessibility: 100},
					violations: [],
					snapshotMode: true,
				},
			},
			trace: {state: 'not-taken', reason: 'tool-failed'},
		},
	});

	const markdown = generateMarkdownReport(buildReport([clean]));

	t.true(markdown.includes('audited, no accessibility violations found'));
	t.false(markdown.includes('**Measurement**: not taken'));
});

test('the report names the audit engine that judged it', t => {
	const report = buildReport([buildPage({})]);
	report.metadata.tooling.auditEngineVersion = '13.4.1';

	const markdown = generateMarkdownReport(report);

	t.true(markdown.includes('Lighthouse 13.4.1'));
});
