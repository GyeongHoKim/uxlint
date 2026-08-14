/**
 * Unit tests for the CI gate evaluator
 *
 * The evaluator is a pure function over a report and a threshold set, which
 * is what makes the exit decision testable without a model, a browser or a
 * process. Fixtures are built through ReportBuilder rather than as object
 * literals, so a test cannot describe a report shape that production never
 * produces.
 */

import process from 'node:process';
import test from 'ava';
import type {FindingSeverity, UxReport} from '../../source/models/analysis.js';
import {
	evaluateGate,
	renderGateVerdict,
} from '../../source/models/gate-result.js';
import {ReportBuilder} from '../../source/services/report-builder.js';

type PageSpec = {
	url: string;
	status?: 'complete' | 'partial' | 'failed';
	error?: string;
	findings?: FindingSeverity[];
};

const buildReport = (pages: PageSpec[]): UxReport => {
	const builder = new ReportBuilder();
	builder.setPersona('Test persona');

	for (const page of pages) {
		builder.initializePageAnalysis(page.url, 'features');

		for (const [index, severity] of (page.findings ?? []).entries()) {
			builder.addFinding({
				severity,
				category: 'Accessibility',
				description: `${severity} issue ${index} on ${page.url}`,
				personaRelevance: ['Test persona'],
				recommendation: 'Fix it',
				pageUrl: page.url,
			});
		}

		if (page.status === 'failed') {
			builder.failCurrentPage(page.error ?? 'boom', {
				url: page.url,
				features: 'features',
			});
		} else {
			builder.completePageAnalysis(
				page.status === 'partial' ? 'partial' : 'complete',
			);
		}
	}

	return builder.generateFinalReport();
};

const clean = buildReport([
	{url: 'https://example.com/a', findings: ['high', 'low']},
]);

test('a count above the limit breaches', t => {
	const report = buildReport([
		{url: 'https://example.com/a', findings: ['critical', 'critical']},
	]);

	const result = evaluateGate(report, {maxCritical: 0});

	t.false(result.passed);
	t.deepEqual(result.breaches, [
		{kind: 'severity', severity: 'critical', limit: 0, count: 2},
	]);
});

test('a count below the limit passes', t => {
	const result = evaluateGate(clean, {maxHigh: 5});

	t.true(result.passed);
	t.deepEqual(result.breaches, []);
});

test('a count equal to the limit passes', t => {
	// The boundary. "Maximum" alone leaves this ambiguous, so it is fixed as
	// an inclusive maximum and pinned here.
	const result = evaluateGate(clean, {maxHigh: 1});

	t.true(result.passed, 'a limit of 1 must admit exactly 1 finding');
	t.deepEqual(result.evaluated, [{severity: 'high', limit: 1, count: 1}]);
});

test('one over the limit fails', t => {
	const result = evaluateGate(clean, {maxHigh: 0});

	t.false(result.passed);
});

test('a severity with no declared limit is not evaluated', t => {
	const result = evaluateGate(clean, {maxHigh: 5});

	t.deepEqual(
		result.evaluated.map(entry => entry.severity),
		['high'],
		'declaring maxHigh must not silently gate the other severities',
	);
});

test('a zero limit with zero findings passes', t => {
	const result = evaluateGate(clean, {maxCritical: 0});

	t.true(result.passed);
	t.deepEqual(result.evaluated, [{severity: 'critical', limit: 0, count: 0}]);
});

test('a zero limit is not the same as an absent one', t => {
	const report = buildReport([
		{url: 'https://example.com/a', findings: ['critical']},
	]);

	t.false(evaluateGate(report, {maxCritical: 0}).passed, 'zero permits none');
	t.true(evaluateGate(report, {}).passed, 'absent gates nothing');
});

test('every breached threshold is reported, not just the first', t => {
	const report = buildReport([
		{
			url: 'https://example.com/a',
			findings: ['critical', 'critical', 'high', 'high', 'high'],
		},
	]);

	const result = evaluateGate(report, {maxCritical: 0, maxHigh: 1});

	t.is(
		result.breaches.length,
		2,
		'fixing one breach should not require a rerun to discover the next',
	);
	t.deepEqual(result.breaches, [
		{kind: 'severity', severity: 'critical', limit: 0, count: 2},
		{kind: 'severity', severity: 'high', limit: 1, count: 3},
	]);
});

test('findings from partial and failed pages are counted', t => {
	// A page that ran out of iterations, or threw on iteration 15, still
	// observed what it observed. Severity is a property of the finding, not of
	// how far the sweep got.
	const report = buildReport([
		{
			url: 'https://example.com/partial',
			status: 'partial',
			findings: ['critical'],
		},
		{
			url: 'https://example.com/failed',
			status: 'failed',
			findings: ['critical'],
		},
	]);

	const result = evaluateGate(report, {maxCritical: 1});

	t.false(result.passed);
	t.deepEqual(result.evaluated, [{severity: 'critical', limit: 1, count: 2}]);
});

test('an absent thresholds block gates nothing', t => {
	// SC-004 at the evaluator level: upgrading without adding configuration
	// must not start failing pipelines.
	const report = buildReport([
		{url: 'https://example.com/a', findings: ['critical', 'critical']},
		{url: 'https://example.com/b', status: 'failed'},
	]);

	const result = evaluateGate(report, undefined);

	t.true(result.passed);
	t.deepEqual(result.breaches, []);
	t.deepEqual(result.evaluated, []);
});

test('a passing run still reports what was evaluated', t => {
	// Without this a green log is indistinguishable from one where the gate
	// was silently misconfigured.
	const result = evaluateGate(clean, {maxCritical: 0, maxLow: 3});

	t.true(result.passed);
	t.deepEqual(result.evaluated, [
		{severity: 'critical', limit: 0, count: 0},
		{severity: 'low', limit: 3, count: 1},
	]);
});

test('evaluated thresholds are ordered by descending severity', t => {
	const result = evaluateGate(clean, {
		maxLow: 9,
		maxCritical: 9,
		maxMedium: 9,
		maxHigh: 9,
	});

	t.deepEqual(
		result.evaluated.map(entry => entry.severity),
		['critical', 'high', 'medium', 'low'],
		'output order must not depend on key order in the config file',
	);
});

test('evaluating a large report stays well inside the budget', t => {
	// SC-006 targets 50ms for 500 findings across 50 pages. Asserting a bare
	// wall clock would flake on a loaded runner, so the ceiling is generous
	// and the observed figure is logged -- the job here is to catch an
	// order-of-magnitude regression, not to police jitter.
	const severities: FindingSeverity[] = ['critical', 'high', 'medium', 'low'];
	const report = buildReport(
		Array.from({length: 50}, (_ignored, page) => ({
			url: `https://example.com/${page}`,
			findings: Array.from(
				{length: 10},
				(_unused, index) => severities[index % severities.length]!,
			),
		})),
	);

	t.is(report.metadata.totalFindings, 500);

	const started = process.hrtime.bigint();
	evaluateGate(report, {maxCritical: 0, maxHigh: 0, maxMedium: 0, maxLow: 0});
	const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

	t.log(`evaluateGate took ${elapsedMs.toFixed(2)}ms (SC-006 target: 50ms)`);
	t.true(
		elapsedMs < 500,
		`evaluateGate took ${elapsedMs.toFixed(2)}ms, an order of magnitude over the 50ms target`,
	);
});

test('a breached verdict names the limit and the observed count', t => {
	const report = buildReport([
		{
			url: 'https://example.com/a',
			findings: ['critical', 'critical', 'high', 'high', 'high'],
		},
	]);

	const rendered = renderGateVerdict(
		evaluateGate(report, {maxCritical: 0, maxHigh: 1}),
	);

	t.regex(rendered, /gate failed/);
	t.regex(rendered, /critical\s+2 findings, limit 0/);
	t.regex(
		rendered,
		/high\s+3 findings, limit 1/,
		'every breach appears, not just the first',
	);
});

test('a passing verdict still shows the gate was active', t => {
	// A green log that says nothing is indistinguishable from a green log
	// where the gate was misconfigured into doing nothing.
	const rendered = renderGateVerdict(
		evaluateGate(clean, {maxCritical: 0, maxHigh: 3}),
	);

	t.regex(rendered, /gate passed/);
	t.regex(rendered, /critical\s+0 findings, limit 0/);
	t.regex(rendered, /high\s+1 findings, limit 3/);
});

test('a verdict with no thresholds configured renders nothing', t => {
	// Nothing was gated, so there is nothing to report. Printing an empty
	// summary would imply a gate exists.
	t.is(renderGateVerdict(evaluateGate(clean, undefined)), '');
});

test('a partial page breaches when failOnPartialPage is set', t => {
	const report = buildReport([
		{url: 'https://example.com/a'},
		{url: 'https://example.com/cut', status: 'partial'},
	]);

	const result = evaluateGate(report, {failOnPartialPage: true});

	t.false(result.passed);
	t.deepEqual(result.breaches, [
		{kind: 'partial-pages', pages: [{pageUrl: 'https://example.com/cut'}]},
	]);
});

test('a failed page breaches when failOnFailedPage is set', t => {
	const report = buildReport([
		{url: 'https://example.com/a'},
		{
			url: 'https://example.com/died',
			status: 'failed',
			error: 'navigation timed out after 30s',
		},
	]);

	const result = evaluateGate(report, {failOnFailedPage: true});

	t.false(result.passed);
	t.deepEqual(result.breaches, [
		{
			kind: 'failed-pages',
			pages: [
				{
					pageUrl: 'https://example.com/died',
					error: 'navigation timed out after 30s',
				},
			],
		},
	]);
});

test('a failed-page breach carries the recorded reason', t => {
	// FR-008: the reason has to reach the log, or the developer whose build
	// broke has to go fetch the report artifact to learn anything.
	const report = buildReport([
		{url: 'https://example.com/a'},
		{
			url: 'https://example.com/x',
			status: 'failed',
			error: 'DNS lookup failed',
		},
		{url: 'https://example.com/y', status: 'failed', error: 'HTTP 503'},
	]);

	const [breach] = evaluateGate(report, {failOnFailedPage: true}).breaches;

	t.is(breach?.kind, 'failed-pages');
	t.deepEqual(breach?.kind === 'failed-pages' ? breach.pages : [], [
		{pageUrl: 'https://example.com/x', error: 'DNS lookup failed'},
		{pageUrl: 'https://example.com/y', error: 'HTTP 503'},
	]);
});

test('coverage gating can be switched off', t => {
	const report = buildReport([
		{url: 'https://example.com/a'},
		{url: 'https://example.com/cut', status: 'partial'},
		{url: 'https://example.com/died', status: 'failed'},
	]);

	const result = evaluateGate(report, {
		failOnPartialPage: false,
		failOnFailedPage: false,
	});

	t.true(result.passed);
	t.deepEqual(result.breaches, []);
});

test('coverage gating is on by default once thresholds exist', t => {
	// Asymmetric with the severity limits by design: opting into gating at all
	// should not silently accept a verdict built on pages that never finished.
	const report = buildReport([
		{url: 'https://example.com/a'},
		{url: 'https://example.com/cut', status: 'partial'},
	]);

	t.false(
		evaluateGate(report, {}).passed,
		'an empty block still gates coverage',
	);
	t.true(
		evaluateGate(report, undefined).passed,
		'no block at all gates nothing',
	);
});

test('a run that analysed nothing fails even with coverage gating off', t => {
	// FR-012. This is why analyzedNothing is a separate field rather than a
	// breach kind: folding it in would let a user switch it off.
	const report = buildReport([
		{url: 'https://example.com/x', status: 'failed', error: 'boom'},
		{url: 'https://example.com/y', status: 'failed', error: 'boom'},
	]);

	const result = evaluateGate(report, {
		failOnPartialPage: false,
		failOnFailedPage: false,
	});

	t.true(result.analyzedNothing);
	t.false(result.passed, 'a report built from nothing is not evidence');
});

test('a partial page alone counts as something being analysed', t => {
	const report = buildReport([
		{url: 'https://example.com/cut', status: 'partial'},
	]);

	t.false(
		evaluateGate(report, {failOnPartialPage: false}).analyzedNothing,
		'a cut-short page still observed something',
	);
});

test('a breached verdict names the affected pages and reasons', t => {
	const report = buildReport([
		{url: 'https://example.com/a'},
		{url: 'https://example.com/cut', status: 'partial'},
		{url: 'https://example.com/died', status: 'failed', error: 'HTTP 503'},
	]);

	const rendered = renderGateVerdict(evaluateGate(report, {}));

	t.regex(rendered, /gate failed/);
	t.regex(rendered, /partial\s+1 page not fully analysed/);
	t.regex(rendered, /https:\/\/example\.com\/cut/);
	t.regex(rendered, /failed\s+1 page could not be analysed/);
	t.regex(rendered, /https:\/\/example\.com\/died — HTTP 503/);
});

test('a verdict for a run that analysed nothing says so plainly', t => {
	const report = buildReport([
		{url: 'https://example.com/x', status: 'failed', error: 'boom'},
	]);

	const rendered = renderGateVerdict(
		evaluateGate(report, {failOnFailedPage: false}),
	);

	t.regex(rendered, /gate failed/);
	t.regex(rendered, /no page was analysed successfully/);
});

test('a passing verdict still warns about incomplete coverage', t => {
	// Coverage gating is off, so the run passes -- but hiding the fact that a
	// page failed would make the pass look better founded than it is.
	const report = buildReport([
		{url: 'https://example.com/a', findings: ['low']},
		{url: 'https://example.com/died', status: 'failed', error: 'HTTP 503'},
	]);

	const rendered = renderGateVerdict(
		evaluateGate(report, {maxLow: 5, failOnFailedPage: false}),
	);

	t.regex(rendered, /gate passed/);
	t.regex(rendered, /1 page could not be analysed/);
});

test('the verdict renders as compact lines for a terminal', t => {
	// Interactive mode shows the same verdict the CI log gets, so the two
	// modes cannot disagree about what a threshold means. Splitting on
	// newlines is how the Ink component consumes it.
	const report = buildReport([
		{url: 'https://example.com/a', findings: ['critical']},
	]);

	const lines = renderGateVerdict(evaluateGate(report, {maxCritical: 0}))
		.split('\n')
		.filter(Boolean);

	t.is(lines[0], 'uxlint: gate failed');
	t.true(lines.length > 1, 'the reason must survive the split');
});
