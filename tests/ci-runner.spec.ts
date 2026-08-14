/**
 * Unit tests for the CI runner's exit status
 *
 * `runCIAnalysis` used to call `process.exit` directly and return void, which
 * is why it had no tests: asserting on an exit status meant killing the test
 * process. It now resolves to the code and lets the caller exit, so the
 * decision can be checked without touching the process.
 */

import {promises as fsPromises} from 'node:fs';
import process from 'node:process';
import test from 'ava';
import sinon from 'sinon';
import {runCIAnalysis} from '../source/ci-runner.js';
import type {PageAnalysis} from '../source/models/analysis.js';
import type {UxLintConfig} from '../source/models/config.js';
import {ReportBuilder} from '../source/services/report-builder.js';

const baseConfig = (overrides: Partial<UxLintConfig> = {}): UxLintConfig => ({
	mainPageUrl: 'https://example.com',
	subPageUrls: [],
	pages: [{url: 'https://example.com', features: 'features'}],
	persona: 'Test persona',
	report: {output: './test-report.md'},
	...overrides,
});

/**
 * A stand-in for AIService that records one analysis per page without
 * touching a model or a browser.
 */
const stubAiService = (
	builder: ReportBuilder,
	behaviour: (page: {url: string; features: string}) => PageAnalysis,
) => ({
	async analyzePage(
		_config: UxLintConfig,
		page: {url: string; features: string},
	) {
		return behaviour(page);
	},
	async close() {
		// No transport to close
	},
	builder,
});

const completed =
	(builder: ReportBuilder) => (page: {url: string; features: string}) => {
		builder.initializePageAnalysis(page.url, page.features);
		return builder.completePageAnalysis();
	};

const createDeps = (
	behaviour?: (
		builder: ReportBuilder,
	) => (page: {url: string; features: string}) => PageAnalysis,
) => {
	const sandbox = sinon.createSandbox();
	const builder = new ReportBuilder({
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	});
	const aiService = stubAiService(builder, (behaviour ?? completed)(builder));

	return {
		sandbox,
		builder,
		deps: {
			async getAIService() {
				return aiService as never;
			},
			reportBuilder: builder,
		},
	};
};

test('resolves to 0 when analysis completes', async t => {
	const {sandbox, deps} = createDeps();

	const code = await runCIAnalysis(baseConfig(), deps);

	t.is(code, 0, 'a completed run must not fail the pipeline');
	sandbox.restore();
});

test('resolves to 1 when analysis throws', async t => {
	const {sandbox, deps} = createDeps();
	const failing = {
		...deps,
		async getAIService() {
			throw new Error('MCP client unavailable');
		},
	};

	const code = await runCIAnalysis(baseConfig(), failing);

	t.is(code, 1);
	sandbox.restore();
});

test('resolves rather than exiting the process', async t => {
	const {sandbox, deps} = createDeps();
	const exit = sandbox.stub(process, 'exit');

	await runCIAnalysis(baseConfig(), deps);

	t.false(
		exit.called,
		'the runner must return its verdict, not terminate the process',
	);
	sandbox.restore();
});

test('resolves to 0 with findings present and no thresholds configured', async t => {
	// SC-004: existing pipelines must not start failing on upgrade.
	const {sandbox, deps, builder} = createDeps(b => page => {
		b.initializePageAnalysis(page.url, page.features);
		b.addFinding({
			severity: 'critical',
			category: 'Accessibility',
			description: 'Critical issue',
			personaRelevance: ['Test persona'],
			recommendation: 'Fix it',
			pageUrl: page.url,
		});
		return b.completePageAnalysis();
	});

	const code = await runCIAnalysis(baseConfig(), deps);

	t.is(builder.generateFinalReport().metadata.totalFindings, 1);
	t.is(code, 0, 'findings alone must not fail a run with no thresholds');
	sandbox.restore();
});

test('writes the report before returning', async t => {
	const {sandbox, deps, builder} = createDeps();
	const saveReport = sandbox.spy(builder, 'saveReport');

	await runCIAnalysis(baseConfig(), deps);

	t.true(
		saveReport.calledOnce,
		'a failing gate must not cost the user the artifact that explains it',
	);
	sandbox.restore();
});
