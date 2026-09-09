import {promises as fsPromises} from 'node:fs';
import path from 'node:path';
import test from 'ava';
import {runDelegatedAnalysis} from '../../source/delegate/runner.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import {
	configFor,
	fakeBrowser,
	readyVerdict,
	scriptedHost,
	temporaryDirectory,
} from './helpers.js';

// SC-008, and the measurement behind FR-021. A single trivial request to a
// host agent in print mode was observed costing 22,255 cache-creation tokens:
// that is the agent assembling its own context, and it is paid per process
// launch rather than per page. One launch per page would multiply it by the
// page count, which is the opposite of what delegate mode is for.
test('the host agent is started exactly once, whatever the page count', async t => {
	const directory = temporaryDirectory(t.teardown);
	const launches: string[] = [];

	const exitCode = await runDelegatedAnalysis(
		configFor(4, path.join(directory, 'report.md')),
		{
			client: fakeBrowser(),
			builder: new ReportBuilder(fsPromises),
			async runPreflight() {
				return readyVerdict;
			},
			emitVerdict() {
				// Nothing is printed during a test.
			},
			adapter: scriptedHost(
				Array.from({length: 4}, () => ({findings: 1, complete: true})),
				{
					onLaunch(launch) {
						launches.push(launch.command);
					},
				},
			),
		},
	);

	t.is(exitCode, 0);
	t.is(launches.length, 1, 'one session covers the whole run');
});

test('a one-page run starts the host agent once as well', async t => {
	const directory = temporaryDirectory(t.teardown);
	let launches = 0;

	await runDelegatedAnalysis(configFor(1, path.join(directory, 'report.md')), {
		client: fakeBrowser(),
		builder: new ReportBuilder(fsPromises),
		async runPreflight() {
			return readyVerdict;
		},
		emitVerdict() {
			// Nothing is printed during a test.
		},
		adapter: scriptedHost([{complete: true}], {
			onLaunch() {
				launches++;
			},
		}),
	});

	t.is(launches, 1);
});
