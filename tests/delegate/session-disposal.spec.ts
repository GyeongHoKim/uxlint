import fs from 'node:fs/promises';
import {promises as fsPromises} from 'node:fs';
import path from 'node:path';
import test from 'ava';
import {runDelegatedAnalysis} from '../../source/delegate/runner.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import type {HostAgentAdapter} from '../../source/delegate/host/types.js';
import {
	configFor,
	fakeBrowser,
	readyVerdict,
	scriptedHost,
	temporaryDirectory,
} from './helpers.js';

/**
 * Run one page against `adapter`, with the session directory created inside a
 * directory this test owns so its contents can be inspected afterwards.
 */
async function runWithSessionsIn(
	t: {teardown: (fn: () => void) => void},
	adapter: HostAgentAdapter,
	sessionTimeLimitMs?: number,
) {
	const workspace = temporaryDirectory(t.teardown);
	const sessions = path.join(workspace, 'sessions');
	await fs.mkdir(sessions);

	const exitCode = await runDelegatedAnalysis(
		configFor(1, path.join(workspace, 'report.md')),
		{
			client: fakeBrowser(),
			builder: new ReportBuilder(fsPromises),
			async runPreflight() {
				return readyVerdict;
			},
			emitVerdict() {
				// Nothing is printed during a test.
			},
			adapter,
			sessionParentDirectory: sessions,
			...(sessionTimeLimitMs !== undefined && {sessionTimeLimitMs}),
		},
	);

	return {exitCode, remaining: await fs.readdir(sessions)};
}

test('the session directory is removed after a successful run', async t => {
	const {exitCode, remaining} = await runWithSessionsIn(
		t,
		scriptedHost([{findings: 1, complete: true}]),
	);

	t.is(exitCode, 0);
	t.deepEqual(remaining, []);
});

test('the session directory is removed after the host agent fails', async t => {
	const {remaining} = await runWithSessionsIn(t, {
		...scriptedHost([]),
		async run() {
			return {terminated: 'failed' as const, exitCode: 1};
		},
	});

	t.deepEqual(remaining, []);
});

// A leftover directory is untidy; leaving one behind after a crash is how a
// developer's temporary space fills up over a week of failing runs.
test('the session directory is removed after the run throws', async t => {
	const {exitCode, remaining} = await runWithSessionsIn(t, {
		...scriptedHost([]),
		async run() {
			throw new Error('the host agent died');
		},
	});

	t.is(exitCode, 1);
	t.deepEqual(remaining, []);
});

test('the session directory is removed after the bound expires', async t => {
	const {remaining} = await runWithSessionsIn(
		t,
		{
			...scriptedHost([]),
			async run() {
				// Ignores the bound entirely, which is the case the run's own
				// timer exists for: a cancellation signal handed to a callee is
				// not a bound if the callee declines to honour it.
				return new Promise(resolve => {
					setTimeout(() => {
						resolve({terminated: 'completed', exitCode: 0});
					}, 5000);
				});
			},
		},
		50,
	);

	t.deepEqual(remaining, []);
});

test('a session that outlives its bound still produces a report', async t => {
	const workspace = temporaryDirectory(t.teardown);
	const output = path.join(workspace, 'report.md');
	const builder = new ReportBuilder(fsPromises);

	const exitCode = await runDelegatedAnalysis(configFor(2, output), {
		client: fakeBrowser(),
		builder,
		async runPreflight() {
			return readyVerdict;
		},
		emitVerdict() {
			// Nothing is printed during a test.
		},
		sessionTimeLimitMs: 50,
		adapter: {
			...scriptedHost([]),
			async run() {
				return new Promise(resolve => {
					setTimeout(() => {
						resolve({terminated: 'completed', exitCode: 0});
					}, 5000);
				});
			},
		},
	});

	const report = builder.generateFinalReport();

	t.is(exitCode, 0);
	await t.notThrowsAsync(fs.stat(output));
	t.is(report.pages.length, 2, 'every page is still accounted for');
	t.deepEqual(report.metadata.partialPages, [
		'https://example.com/page-1',
		'https://example.com/page-2',
	]);
});
