/**
 * Tests for log durability across process exit
 *
 * The rotating file transport writes asynchronously and its stream may not be
 * open yet when a fast failure logs, so an immediate exit drops the entry.
 * Spawning the real binary is the only way to cover that race.
 */

import {spawnSync} from 'node:child_process';
import {promises as fsPromises} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';

test('a CI-mode rejection survives process.exit', async t => {
	// The entry has to be on disk after the CLI has exited, not merely written.
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
