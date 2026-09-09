import fs from 'node:fs/promises';
import {promises as fsPromises} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';
import {
	runDelegatedAnalysis,
	type DelegateDependencies,
} from '../../source/delegate/runner.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import {
	configFor,
	fakeBrowser,
	readyVerdict,
	scriptedHost,
	temporaryDirectory,
} from './helpers.js';

/**
 * Run a delegated analysis, holding the builder so the report can be read back
 * the way `ci-runner` does rather than by parsing the rendered markdown.
 */
async function runAndRead(
	t: {teardown: (fn: () => void) => void},
	options: Partial<DelegateDependencies> &
		Pick<DelegateDependencies, 'adapter'> & {pages?: number},
) {
	const {pages = 1, ...dependencies} = options;
	const directory = temporaryDirectory(t.teardown);
	const output = path.join(directory, 'report.md');
	const builder = new ReportBuilder(fsPromises);
	const config = configFor(pages, output);

	const exitCode = await runDelegatedAnalysis(config, {
		client: fakeBrowser(),
		builder,
		async runPreflight() {
			return readyVerdict;
		},
		emitVerdict() {
			// Nothing is printed during a test.
		},
		...dependencies,
	});

	return {exitCode, report: builder.generateFinalReport(), output};
}

test.serial('a report is written with no model credential present', async t => {
	const previous = process.env['UXLINT_AI_API_KEY'];
	delete process.env['UXLINT_AI_API_KEY'];
	t.teardown(() => {
		if (previous !== undefined) {
			process.env['UXLINT_AI_API_KEY'] = previous;
		}
	});

	const {exitCode, report, output} = await runAndRead(t, {
		adapter: scriptedHost([{findings: 2, note: true, complete: true}]),
	});

	t.is(exitCode, 0);
	await t.notThrowsAsync(fs.stat(output));
	t.true(
		report.prioritizedFindings.some(finding => finding.origin === 'judgement'),
		'the host agent judgement reached the report',
	);
	t.true(
		report.prioritizedFindings.some(finding => finding.origin === 'audit'),
		'the measured findings reached the report',
	);
});

test('a judgement finding is attributed to the page it was submitted against', async t => {
	const {report} = await runAndRead(t, {
		pages: 2,
		adapter: scriptedHost([
			{findings: 1, complete: true},
			{findings: 3, complete: true},
		]),
	});

	const judged = report.prioritizedFindings.filter(
		finding => finding.origin === 'judgement',
	);

	t.is(
		judged.filter(finding => finding.pageUrl === 'https://example.com/page-1')
			.length,
		1,
	);
	t.is(
		judged.filter(finding => finding.pageUrl === 'https://example.com/page-2')
			.length,
		3,
	);
});

test('every page is captured and measured before the host agent is launched', async t => {
	const order: string[] = [];

	await runAndRead(t, {
		pages: 2,
		onPageCaptured(pageUrl: string) {
			order.push(`captured:${pageUrl}`);
		},
		adapter: scriptedHost([{complete: true}, {complete: true}], {
			onLaunch() {
				order.push('launched');
			},
		}),
	});

	t.deepEqual(order, [
		'captured:https://example.com/page-1',
		'captured:https://example.com/page-2',
		'launched',
	]);
});

test('the report records which host agent produced the judgement', async t => {
	const {report} = await runAndRead(t, {
		adapter: scriptedHost([{complete: true}]),
	});

	t.is(report.metadata.tooling.hostAgent, 'claude-code');
	t.is(report.metadata.tooling.browserServer, 'chrome-devtools-mcp');
});

test('a page the host agent judged clean is complete rather than partial', async t => {
	const {report} = await runAndRead(t, {
		adapter: scriptedHost([{complete: true}]),
	});

	t.deepEqual(report.metadata.analyzedPages, ['https://example.com/page-1']);
	t.deepEqual(report.metadata.partialPages, []);
});

test('the measurement note the host agent recorded reaches the page', async t => {
	const {report} = await runAndRead(t, {
		adapter: scriptedHost([{note: true, complete: true}]),
	});

	t.regex(report.pages[0]!.measurementNote!, /what the measurements mean/i);
});

// FR-016 and the preflight edge case: a browser that cannot run must stop the
// run before a host agent is launched, and must say so the way the existing
// modes say it.
test('a failing preflight stops the run before any host agent is launched', async t => {
	const directory = temporaryDirectory(t.teardown);
	const config = configFor(1, path.join(directory, 'report.md'));
	const messages: string[] = [];
	let launched = false;

	const exitCode = await runDelegatedAnalysis(config, {
		client: fakeBrowser(),
		async runPreflight() {
			return {
				kind: 'unmet',
				requirement: {
					kind: 'browser-absent',
					searchedPaths: ['/opt/google/chrome'],
				},
			};
		},
		emitVerdict(message: string) {
			messages.push(message);
		},
		adapter: scriptedHost([{complete: true}], {
			onLaunch() {
				launched = true;
			},
		}),
	});

	t.is(exitCode, 1);
	t.false(launched, 'a capture pass must not be spent on an unusable browser');
	t.true(messages.join(' ').length > 0);
	await t.throwsAsync(fs.stat(path.join(directory, 'report.md')));
});

test('a host agent that cannot run stops the analysis before a browser opens', async t => {
	const directory = temporaryDirectory(t.teardown);
	const config = configFor(1, path.join(directory, 'report.md'));
	const messages: string[] = [];
	let preflightRan = false;

	const exitCode = await runDelegatedAnalysis(config, {
		client: fakeBrowser(),
		async runPreflight() {
			preflightRan = true;
			return readyVerdict;
		},
		emitVerdict(message: string) {
			messages.push(message);
		},
		adapter: {
			...scriptedHost([]),
			async detect() {
				return {
					kind: 'not-authenticated',
					message: 'Run `claude login` first.',
				};
			},
		},
	});

	t.is(exitCode, 1);
	t.false(preflightRan, 'availability is settled before a browser is started');
	t.regex(messages.join(' '), /login/);
});
