import fs from 'node:fs/promises';
import {promises as fsPromises} from 'node:fs';
import path from 'node:path';
import test from 'ava';
import {runDelegatedAnalysis} from '../../source/delegate/runner.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import type {
	HostAgentAdapter,
	HostOutcome,
} from '../../source/delegate/host/types.js';
import {sessionEnvironmentVariable} from '../../source/models/delegate.js';
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

/**
 * A host agent that ignores the timeout it is handed.
 *
 * Left alone it would finish five seconds later; it ends sooner only because
 * the run's own bound aborts it. Its timer is released either way, so a test
 * does not keep its worker alive once the assertions are done.
 */
function ignoresItsTimeout(): HostAgentAdapter {
	return {
		...scriptedHost([]),
		async run(_launch, options) {
			return new Promise<HostOutcome>(resolve => {
				const late = setTimeout(() => {
					resolve({terminated: 'completed', exitCode: 0});
				}, 5000);
				late.unref();

				options?.signal?.addEventListener(
					'abort',
					() => {
						clearTimeout(late);
						resolve({terminated: 'timed-out'});
					},
					{once: true},
				);
			});
		},
	};
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
	const {remaining} = await runWithSessionsIn(t, ignoresItsTimeout(), 50);

	t.deepEqual(remaining, []);
});

// Expiry used to return while the session was still running, so the log was
// read and the directory removed underneath a judgement server that could still
// be writing into it. The session is now ended, and waited for, first.
test('an expired session is ended and waited for before its directory is removed', async t => {
	let directoryAtExit: boolean | undefined;

	const {remaining} = await runWithSessionsIn(
		t,
		{
			...scriptedHost([]),
			async run(launch, options) {
				// Ignores the timeout; only the run's own abort ends it.
				await new Promise<void>(resolve => {
					options?.signal?.addEventListener(
						'abort',
						() => {
							resolve();
						},
						{once: true},
					);
				});

				// A session takes a moment to wind down once it is told to.
				await new Promise(resolve => {
					setTimeout(resolve, 20);
				});

				try {
					await fs.stat(launch.env[sessionEnvironmentVariable]!);
					directoryAtExit = true;
				} catch {
					directoryAtExit = false;
				}

				return {terminated: 'timed-out' as const};
			},
		},
		50,
	);

	t.true(
		directoryAtExit,
		'the session ended while its directory was still there',
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
		adapter: ignoresItsTimeout(),
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
