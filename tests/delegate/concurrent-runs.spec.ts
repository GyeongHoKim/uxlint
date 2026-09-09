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
} from './helpers.js';

/**
 * One delegated run, with its own report and its own scripted judgement.
 */
async function delegatedRun(
	directory: string,
	name: string,
	findings: number,
): Promise<UxReport> {
	const builder = new ReportBuilder(fsPromises);

	await runDelegatedAnalysis(configFor(2, path.join(directory, `${name}.md`)), {
		client: fakeBrowser(),
		builder,
		async runPreflight() {
			return readyVerdict;
		},
		emitVerdict() {
			// Nothing is printed during a test.
		},
		adapter: scriptedHost([
			{findings, complete: true},
			{findings, complete: true},
		]),
	});

	return builder.generateFinalReport();
}

// SC-007. The session directory is the identity, and it is what the judgement
// server reads from its environment. Two runs therefore export two different
// paths, and neither server can reach the other's log.
test('two runs at once each produce a report holding only their own findings', async t => {
	const directory = temporaryDirectory(t.teardown);

	const [first, second] = await Promise.all([
		delegatedRun(directory, 'first', 2),
		delegatedRun(directory, 'second', 5),
	]);

	const judged = (report: UxReport) =>
		report.prioritizedFindings.filter(finding => finding.origin === 'judgement')
			.length;

	t.is(judged(first), 4, 'two pages at two findings each');
	t.is(judged(second), 10, 'two pages at five findings each');
});

test('neither run leaves a session behind for the other to find', async t => {
	const workspace = temporaryDirectory(t.teardown);
	const sessions = path.join(workspace, 'sessions');
	await fsPromises.mkdir(sessions);

	const run = async (name: string) =>
		runDelegatedAnalysis(configFor(1, path.join(workspace, `${name}.md`)), {
			client: fakeBrowser(),
			builder: new ReportBuilder(fsPromises),
			async runPreflight() {
				return readyVerdict;
			},
			emitVerdict() {
				// Nothing is printed during a test.
			},
			sessionParentDirectory: sessions,
			adapter: scriptedHost([{findings: 1, complete: true}]),
		});

	await Promise.all([run('a'), run('b')]);

	t.deepEqual(await fsPromises.readdir(sessions), []);
});
