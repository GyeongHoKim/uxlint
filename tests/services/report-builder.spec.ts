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

test('discardCurrentPage drops only the in-flight page', t => {
	const {builder, sandbox} = createBuilder();

	builder.setPersona('Test persona');
	completeOnePage(builder, 'https://example.com/one');

	builder.initializePageAnalysis('https://example.com/two', 'features');
	builder.addFinding(buildFinding('https://example.com/two'));
	builder.discardCurrentPage();

	const state = builder.getCurrentState();
	t.is(state.currentPageAnalysis, undefined);
	t.is(state.completedAnalyses.length, 1);
	t.is(state.completedAnalyses[0]?.pageUrl, 'https://example.com/one');
	t.is(state.persona, 'Test persona', 'persona must survive a page discard');

	sandbox.restore();
});

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

test('completePageAnalysis still defaults to complete', t => {
	const {builder, sandbox} = createBuilder();

	builder.initializePageAnalysis('https://example.com/one', 'features');
	t.is(builder.completePageAnalysis().status, 'complete');

	sandbox.restore();
});

test('generateReport separates completed pages from failed ones', t => {
	const {builder, sandbox} = createBuilder();

	builder.setPersona('Test persona');
	completeOnePage(builder, 'https://example.com/complete');

	builder.initializePageAnalysis('https://example.com/failed', 'features');
	builder.failCurrentPage('boom', {
		url: 'https://example.com/failed',
		features: 'features',
	});

	const report = builder.generateFinalReport();

	t.deepEqual(report.metadata.analyzedPages, ['https://example.com/complete']);
	t.deepEqual(report.metadata.failedPages, ['https://example.com/failed']);
	t.is(report.metadata.totalFindings, 1);
	t.is(report.pages.length, 2, 'every page appears in the report body');
	t.is(report.metadata.persona, 'Test persona');

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
