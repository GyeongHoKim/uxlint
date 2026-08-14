/**
 * Tests for log durability across process exit
 *
 * Winston's rotating file transport writes asynchronously, and its stream is
 * not even open by the time a fast failure logs. `process.exit` therefore
 * killed the process before anything reached disk, and CI-mode failures --
 * the exact runs a user needs to diagnose -- left no trace anywhere: not on
 * stdout, which is reserved for MCP, and not in the log either.
 *
 * Spawning the real binary is the only honest way to cover that race.
 */

import {spawnSync} from 'node:child_process';
import {promises as fsPromises} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';

test('a CI-mode rejection survives process.exit', async t => {
	// The unit test above proves flush works in a process that keeps running.
	// This one proves the thing that actually matters: that the entry is on
	// disk after the CLI has exited. Spawning the real binary is the only way
	// to cover the exit race, and it is the path a user hits with a typo.
	const workDirectory = await fsPromises.mkdtemp(
		path.join(tmpdir(), 'uxlint-cli-'),
	);
	const logDirectory = path.join(workDirectory, 'logs');

	await fsPromises.writeFile(
		path.join(workDirectory, '.uxlintrc.yml'),
		[
			'mainPageUrl: https://example.com',
			'subPageUrls: []',
			'pages:',
			'  - url: https://example.com',
			'    features: landing',
			'persona: A busy shopper',
			'report:',
			'  output: ./ux-report.md',
			'thresholds:',
			'  maxCritcal: 0',
		].join('\n'),
		'utf8',
	);

	const cliPath = path.join(process.cwd(), 'dist', 'source', 'cli.js');
	const result = spawnSync(process.execPath, [cliPath], {
		cwd: workDirectory,
		env: {...process.env, LOG_DIRECTORY: logDirectory},
		encoding: 'utf8',
	});

	t.is(result.status, 1, 'a malformed threshold must stop the run');

	const entries = await fsPromises.readdir(logDirectory);
	const logFile = entries.find(entry => entry.endsWith('.log'));
	const contents = await fsPromises.readFile(
		path.join(logDirectory, logFile!),
		'utf8',
	);

	t.regex(
		contents,
		/maxCritcal/,
		'the offending key must reach the log, or the rejection tells the user nothing',
	);

	await fsPromises.rm(workDirectory, {recursive: true, force: true});
});
