import {promises as fsPromises} from 'node:fs';
import path from 'node:path';
import test from 'ava';
import {runDelegatedAnalysis} from '../../source/delegate/runner.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import type {UxReport} from '../../source/models/analysis.js';
import {
	configFor,
	fakeBrowser,
	readyVerdict,
	scriptedHost,
	temporaryDirectory,
	type PageScript,
} from './helpers.js';

/**
 * Run four pages against a script that stops partway.
 */
async function runPartial(
	t: {teardown: (fn: () => void) => void},
	script: PageScript[],
	terminated: 'completed' | 'failed' | 'timed-out' = 'failed',
): Promise<{exitCode: number; report: UxReport}> {
	const directory = temporaryDirectory(t.teardown);
	const builder = new ReportBuilder(fsPromises);

	const exitCode = await runDelegatedAnalysis(
		configFor(4, path.join(directory, 'report.md')),
		{
			client: fakeBrowser(),
			builder,
			async runPreflight() {
				return readyVerdict;
			},
			emitVerdict() {
				// Nothing is printed during a test.
			},
			adapter: scriptedHost(script, {terminated}),
		},
	);

	return {exitCode, report: builder.generateFinalReport()};
}

const judgedTwoOfFour: PageScript[] = [
	{findings: 2, complete: true},
	{findings: 1, complete: true},
];

test('a session that ends early still yields a report covering every page', async t => {
	const {report} = await runPartial(t, judgedTwoOfFour);

	const covered = [
		...report.metadata.analyzedPages,
		...report.metadata.partialPages,
		...report.metadata.failedPages,
	];

	t.is(covered.length, 4);
	t.is(report.pages.length, 4);
});

test('the pages the session finished are complete and keep their findings', async t => {
	const {report} = await runPartial(t, judgedTwoOfFour);

	t.deepEqual(report.metadata.analyzedPages, [
		'https://example.com/page-1',
		'https://example.com/page-2',
	]);

	const judged = report.prioritizedFindings
		.filter(finding => finding.origin === 'judgement')
		.map(finding => finding.pageUrl);

	t.is(judged.filter(url => url === 'https://example.com/page-1').length, 2);
	t.is(judged.filter(url => url === 'https://example.com/page-2').length, 1);
});

test('the pages it never reached are partial and keep their measured findings', async t => {
	const {report} = await runPartial(t, judgedTwoOfFour);

	t.deepEqual(report.metadata.partialPages, [
		'https://example.com/page-3',
		'https://example.com/page-4',
	]);

	const unreached = report.pages.find(
		page => page.pageUrl === 'https://example.com/page-3',
	)!;

	t.is(unreached.status, 'partial');
	t.true(
		unreached.findings.some(finding => finding.origin === 'audit'),
		'a page nobody judged was still measured, and the measurement is kept',
	);
	t.false(
		unreached.findings.some(finding => finding.origin === 'judgement'),
		'nothing was judged on it, so nothing may claim to have been',
	);
});

test('an unreached page carries a reason naming the end of the session', async t => {
	const {report} = await runPartial(t, judgedTwoOfFour);

	const unreached = report.pages.find(
		page => page.pageUrl === 'https://example.com/page-4',
	)!;

	t.truthy(unreached.error);
	t.regex(unreached.error!, /judgement|session/i);
});

// SC-009. The two states are the ones a reader most needs to tell apart, and
// they must be distinguishable from the report alone.
test('a page judged clean is distinguishable from a page never reached', async t => {
	const {report} = await runPartial(t, [
		// Page one: opened, judged, found nothing, finished.
		{complete: true},
		// Page two onwards: never touched.
	]);

	const judgedClean = report.pages.find(
		page => page.pageUrl === 'https://example.com/page-1',
	)!;
	const neverReached = report.pages.find(
		page => page.pageUrl === 'https://example.com/page-2',
	)!;

	t.is(judgedClean.status, 'complete');
	t.is(judgedClean.error, undefined);

	t.is(neverReached.status, 'partial');
	t.truthy(neverReached.error);
});

// A page the agent opened but never finished is not the same as one it never
// opened, and neither is the same as a finished one. All three are partial
// except the last, and the reason is what tells them apart.
test('a page left open when the session ended is partial with its own reason', async t => {
	const {report} = await runPartial(t, [
		{findings: 1, complete: true},
		{findings: 2},
	]);

	const abandoned = report.pages.find(
		page => page.pageUrl === 'https://example.com/page-2',
	)!;

	t.is(abandoned.status, 'partial');
	t.is(
		abandoned.findings.filter(finding => finding.origin === 'judgement').length,
		2,
		'what was submitted before the session ended is real and is kept',
	);
	t.regex(abandoned.error!, /finish|complete/i);
});

test('a session that ended badly still exits on the gate rather than on the failure', async t => {
	const {exitCode} = await runPartial(t, judgedTwoOfFour);

	// No thresholds are configured, so the gate cannot fail the run. The
	// exit code reports the gate, not the host agent's own fate: a partial
	// report is a result, not a crash.
	t.is(exitCode, 0);
});
