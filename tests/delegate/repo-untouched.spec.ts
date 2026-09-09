import {execFileSync} from 'node:child_process';
import {promises as fsPromises} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import {runDelegatedAnalysis} from '../../source/delegate/runner.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import {locateRepoRoot} from '../utils.js';
import {
	configFor,
	fakeBrowser,
	readyVerdict,
	scriptedHost,
	temporaryDirectory,
} from './helpers.js';

const repoRoot = locateRepoRoot(fileURLToPath(import.meta.url));

/**
 * The working tree as git sees it, untracked files included.
 *
 * Untracked matters as much as modified: the failure this guards against is a
 * `.cursor/mcp.json` written on the developer's behalf, which git would report
 * as an addition rather than a change.
 *
 * @returns One line per changed path
 */
function workingTree(): string {
	return execFileSync('git', ['status', '--porcelain'], {
		cwd: repoRoot,
		encoding: 'utf8',
	});
}

test.serial(
	'a completed delegated run leaves the working tree as it found it',
	async t => {
		const before = workingTree();
		const directory = temporaryDirectory(t.teardown);

		const exitCode = await runDelegatedAnalysis(
			configFor(2, path.join(directory, 'report.md')),
			{
				client: fakeBrowser(),
				builder: new ReportBuilder(fsPromises),
				async runPreflight() {
					return readyVerdict;
				},
				emitVerdict() {
					// Nothing is printed during a test.
				},
				adapter: scriptedHost([
					{findings: 1, complete: true},
					{findings: 1, complete: true},
				]),
			},
		);

		t.is(exitCode, 0);
		t.is(
			workingTree(),
			before,
			'the repository is read-only to a delegated run',
		);
	},
);

test.serial(
	'a failing delegated run leaves the working tree as it found it too',
	async t => {
		const before = workingTree();
		const directory = temporaryDirectory(t.teardown);

		await runDelegatedAnalysis(
			configFor(1, path.join(directory, 'report.md')),
			{
				client: fakeBrowser(),
				builder: new ReportBuilder(fsPromises),
				async runPreflight() {
					return readyVerdict;
				},
				emitVerdict() {
					// Nothing is printed during a test.
				},
				adapter: {
					...scriptedHost([]),
					async run() {
						throw new Error('the host agent died');
					},
				},
			},
		);

		t.is(workingTree(), before);
	},
);

test('the report is the only file a run writes outside its own session', async t => {
	const directory = temporaryDirectory(t.teardown);
	const output = path.join(directory, 'report.md');

	await runDelegatedAnalysis(configFor(1, output), {
		client: fakeBrowser(),
		builder: new ReportBuilder(fsPromises),
		async runPreflight() {
			return readyVerdict;
		},
		emitVerdict() {
			// Nothing is printed during a test.
		},
		adapter: scriptedHost([{complete: true}]),
	});

	t.deepEqual(await fsPromises.readdir(directory), ['report.md']);
});
