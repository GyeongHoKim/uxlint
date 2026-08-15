/**
 * Unit tests for ReportBuilder state transitions
 *
 * ReportBuilder is a pure TypeScript class, so Constitution II puts it under
 * unit tests. It had none, which is how the page-termination bugs guarded
 * below survived: every one of them lives in the gap between "the current page
 * ended" and "the run ended", and nothing exercised that boundary.
 */

import {promises as fsPromises} from 'node:fs';
import test from 'ava';
import sinon from 'sinon';
import type {UxFinding} from '../../source/models/analysis.js';
import {ReportBuilder} from '../../source/services/report-builder.js';

const buildFinding = (
	pageUrl: string,
	category = 'Accessibility',
): UxFinding => ({
	severity: 'high',
	category,
	description: `Issue on ${pageUrl}`,
	personaRelevance: ['Test persona'],
	recommendation: 'Fix it',
	pageUrl,
});

const createBuilder = () => {
	const sandbox = sinon.createSandbox();
	const builder = new ReportBuilder({
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	});

	return {builder, sandbox};
};

/**
 * Complete one page with a single finding, so tests have prior work that a
 * later failure must not destroy.
 */
const completeOnePage = (builder: ReportBuilder, pageUrl: string) => {
	builder.initializePageAnalysis(pageUrl, 'features');
	builder.addFinding(buildFinding(pageUrl));
	builder.completePageAnalysis();
};

test('failCurrentPage records the failure without destroying earlier pages', t => {
	const {builder, sandbox} = createBuilder();

	builder.setPersona('Test persona');
	completeOnePage(builder, 'https://example.com/one');

	builder.initializePageAnalysis('https://example.com/two', 'features');
	const failed = builder.failCurrentPage('navigation timed out', {
		url: 'https://example.com/two',
		features: 'features',
	});

	t.is(failed.status, 'failed');
	t.is(failed.error, 'navigation timed out');

	const state = builder.getCurrentState();
	t.is(state.currentPageAnalysis, undefined);
	t.is(state.completedAnalyses.length, 2);
	t.is(
		state.completedAnalyses[0]?.pageUrl,
		'https://example.com/one',
		'the page completed before the failure must still be there',
	);
	t.is(state.completedAnalyses[0]?.findings.length, 1);
	t.is(state.persona, 'Test persona');

	sandbox.restore();
});

test('failCurrentPage synthesises a record when the page never initialised', t => {
	const {builder, sandbox} = createBuilder();

	// Reproduces a throw before initializePageAnalysis runs -- there is no
	// current page to convert, but the run still needs the failure recorded.
	const failed = builder.failCurrentPage('MCP client unavailable', {
		url: 'https://example.com/never-started',
		features: 'features',
	});

	t.is(failed.pageUrl, 'https://example.com/never-started');
	t.is(failed.features, 'features');
	t.is(failed.status, 'failed');
	t.is(failed.error, 'MCP client unavailable');
	t.is(builder.getCurrentState().completedAnalyses.length, 1);

	sandbox.restore();
});

test('failCurrentPage does not re-record a page that already finished', t => {
	const {builder, sandbox} = createBuilder();

	// The model completes the page, then something after that throws inside the
	// same try block. Without a guard the page lands in analyzedPages *and*
	// failedPages, and a finished page gets reported as failed.
	completeOnePage(builder, 'https://example.com/one');

	const result = builder.failCurrentPage('progress subscriber blew up', {
		url: 'https://example.com/one',
		features: 'features',
	});

	t.is(result.status, 'complete', 'the settled record wins');

	const report = builder.generateFinalReport();
	t.deepEqual(report.metadata.analyzedPages, ['https://example.com/one']);
	t.deepEqual(report.metadata.failedPages, []);
	t.is(report.pages.length, 1, 'the page must appear exactly once');

	sandbox.restore();
});

test('completePageAnalysis marks the page partial when asked', t => {
	const {builder, sandbox} = createBuilder();

	builder.initializePageAnalysis('https://example.com/one', 'features');
	builder.addFinding(buildFinding('https://example.com/one'));
	const analysis = builder.completePageAnalysis('partial');

	t.is(analysis.status, 'partial');
	t.is(builder.getCurrentState().completedAnalyses[0]?.status, 'partial');

	sandbox.restore();
});

test('completePageAnalysis still defaults to complete', t => {
	const {builder, sandbox} = createBuilder();

	builder.initializePageAnalysis('https://example.com/one', 'features');
	t.is(builder.completePageAnalysis().status, 'complete');

	sandbox.restore();
});

test('generateReport separates complete, partial and failed pages', t => {
	const {builder, sandbox} = createBuilder();

	builder.setPersona('Test persona');
	completeOnePage(builder, 'https://example.com/complete');

	builder.initializePageAnalysis('https://example.com/partial', 'features');
	builder.addFinding(buildFinding('https://example.com/partial', 'Navigation'));
	builder.completePageAnalysis('partial');

	builder.initializePageAnalysis('https://example.com/failed', 'features');
	builder.failCurrentPage('boom', {
		url: 'https://example.com/failed',
		features: 'features',
	});

	const report = builder.generateFinalReport();

	t.deepEqual(report.metadata.analyzedPages, ['https://example.com/complete']);
	t.deepEqual(report.metadata.partialPages, ['https://example.com/partial']);
	t.deepEqual(report.metadata.failedPages, ['https://example.com/failed']);

	// A partial analysis is cut short, not wrong: the findings it did produce
	// are real observations and must survive into the report.
	t.is(report.metadata.totalFindings, 2);
	t.is(report.prioritizedFindings.length, 2);
	t.is(report.pages.length, 3, 'every page appears in the report body');
	t.is(report.metadata.persona, 'Test persona');

	sandbox.restore();
});

test('findings collected before a failure still reach the report', t => {
	const {builder, sandbox} = createBuilder();

	// The page called addFinding a few times and then threw. Those findings
	// were already paid for; dropping them is the same mistake as wiping
	// completed pages on failure.
	builder.initializePageAnalysis('https://example.com/died', 'features');
	builder.addFinding(buildFinding('https://example.com/died'));
	builder.failCurrentPage('threw on iteration 15', {
		url: 'https://example.com/died',
		features: 'features',
	});

	const report = builder.generateFinalReport();

	t.is(report.metadata.totalFindings, 1);
	t.is(report.prioritizedFindings.length, 1);
	t.deepEqual(report.metadata.failedPages, ['https://example.com/died']);
	t.deepEqual(
		report.metadata.analyzedPages,
		[],
		'the page still does not count as analysed',
	);

	sandbox.restore();
});

test('reset still clears the whole run', t => {
	const {builder, sandbox} = createBuilder();

	builder.setPersona('Test persona');
	completeOnePage(builder, 'https://example.com/one');
	builder.reset();

	const state = builder.getCurrentState();
	t.is(state.completedAnalyses.length, 0);
	t.is(state.currentPageAnalysis, undefined);
	t.is(state.persona, '');

	sandbox.restore();
});

test('every report records what produced it, including one where nothing succeeded', t => {
	const builder = new ReportBuilder();
	builder.setProvenance({
		browserServer: 'chrome-devtools-mcp',
		browserServerVersion: '1.7.0',
		browserVersion: 'Google Chrome 151.0.7922.137',
		externalDataAllowed: false,
	});

	builder.initializePageAnalysis('https://example.com', 'features');
	builder.failCurrentPage('browser died', {
		url: 'https://example.com',
		features: 'features',
	});

	const report = builder.generateFinalReport();

	// A report that can explain nothing else must still explain itself.
	t.is(report.metadata.analyzedPages.length, 0);
	t.is(report.metadata.tooling.browserServerVersion, '1.7.0');
	t.is(report.metadata.tooling.browserVersion, 'Google Chrome 151.0.7922.137');
});

test('provenance records the external data setting, not an observation', t => {
	const builder = new ReportBuilder();
	builder.setProvenance({
		browserServer: 'chrome-devtools-mcp',
		browserServerVersion: '1.7.0',
		browserVersion: 'Google Chrome 151.0.7922.137',
		externalDataAllowed: true,
	});

	const report = builder.generateFinalReport();

	// The question a reader of an old report needs answered is what the run
	// was permitted to do, which is knowable; whether a request actually went
	// out is not recoverable after the fact.
	t.true(report.metadata.tooling.externalDataAllowed);
});

test('adding provenance leaves every pre-existing metadata field intact', t => {
	const builder = new ReportBuilder();
	builder.setPersona('Test persona');
	builder.setProvenance({
		browserServer: 'chrome-devtools-mcp',
		browserServerVersion: '1.7.0',
		browserVersion: 'Google Chrome 151.0.7922.137',
		externalDataAllowed: false,
	});
	builder.initializePageAnalysis('https://example.com', 'features');
	builder.completePageAnalysis();

	const {metadata} = builder.generateFinalReport();

	// FR-003: the swap may add a field but must not disturb one that exists.
	t.is(typeof metadata.timestamp, 'number');
	t.deepEqual(metadata.analyzedPages, ['https://example.com']);
	t.deepEqual(metadata.partialPages, []);
	t.deepEqual(metadata.failedPages, []);
	t.is(metadata.totalFindings, 0);
	t.is(metadata.persona, 'Test persona');
});
