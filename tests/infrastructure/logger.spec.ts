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
import test, {type ExecutionContext} from 'ava';
import {WinstonLogger} from '../../source/infrastructure/logger.js';
import {runSequentially} from '../../source/utils/run-sequentially.js';
import {
	createRedactor,
	redactedMarker,
} from '../../source/models/secret-redaction.js';

test('a CI-mode rejection survives process.exit', async t => {
	// The entry has to be on disk after the CLI has exited, not merely written.
	const workDirectory = await fsPromises.mkdtemp(
		path.join(tmpdir(), 'uxlint-cli-'),
	);
	const logDirectory = path.join(workDirectory, 'logs');

	t.teardown(async () =>
		fsPromises.rm(workDirectory, {recursive: true, force: true}),
	);

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
});

// --- secrets kept out of the log (011) --------------------------------------

const secret = 'correct-horse-battery-staple';

/** A logger writing to a directory of its own, removed when the test ends. */
async function loggerOnFreshDirectory(t: ExecutionContext) {
	const logDirectory = await fsPromises.mkdtemp(
		path.join(tmpdir(), 'uxlint-log-'),
	);

	t.teardown(async () =>
		fsPromises.rm(logDirectory, {recursive: true, force: true}),
	);

	return {logger: new WinstonLogger(logDirectory, true), logDirectory};
}

/** Everything the logger has written to its directory so far. */
async function writtenSoFar(logDirectory: string): Promise<string> {
	const entries = await fsPromises.readdir(logDirectory);
	const contents = await Promise.all(
		entries
			.filter(entry => entry.endsWith('.log'))
			.map(async entry =>
				fsPromises.readFile(path.join(logDirectory, entry), 'utf8'),
			),
	);

	return contents.join('');
}

/**
 * The log once an entry has reached disk.
 *
 * The transport writes asynchronously, so the file is polled for a marker the
 * awaited entry carries. Bounded, so a missing entry fails the test with the
 * log as it stood rather than hanging it.
 */
async function logOnceWritten(
	logDirectory: string,
	marker: string,
): Promise<string> {
	let written = '';

	await runSequentially(Array.from({length: 200}), async () => {
		if (written.includes(marker)) {
			return;
		}

		written = await writtenSoFar(logDirectory);
		if (!written.includes(marker)) {
			await new Promise(resolve => {
				setTimeout(resolve, 10);
			});
		}
	});

	return written;
}

/** The entries of a log, parsed, in the order they were written. */
const entriesOf = (written: string) =>
	written
		.split('\n')
		.filter(line => line.trim().length > 0)
		.map(line => JSON.parse(line) as Record<string, unknown>);

test('a secret in a log message is written as the marker', async t => {
	const {logger, logDirectory} = await loggerOnFreshDirectory(t);
	logger.setRedactor(createRedactor([secret]));

	logger.info(`message-entry: the page printed ${secret}`);

	const written = await logOnceWritten(logDirectory, 'message-entry');
	t.true(written.includes('message-entry'), 'the entry must reach the log');
	t.false(written.includes(secret));
	t.is(
		entriesOf(written)[0]?.['message'],
		`message-entry: the page printed ${redactedMarker}`,
	);
});

test('a secret in a metadata value is written as the marker', async t => {
	const {logger, logDirectory} = await loggerOnFreshDirectory(t);
	logger.setRedactor(createRedactor([secret]));

	logger.warn('metadata-entry', {
		pageUrl: `https://app.example.com/reset?token=${secret}`,
		attempt: 2,
	});

	const written = await logOnceWritten(logDirectory, 'metadata-entry');
	t.true(written.includes('metadata-entry'), 'the entry must reach the log');
	t.false(written.includes(secret));

	const entry = entriesOf(written)[0];
	t.is(
		entry?.['pageUrl'],
		`https://app.example.com/reset?token=${redactedMarker}`,
	);
	// What is not a secret is written as it was given.
	t.is(entry?.['attempt'], 2);
	t.is(entry?.['level'], 'warn');
});

test('a secret nested inside metadata is written as the marker', async t => {
	const {logger, logDirectory} = await loggerOnFreshDirectory(t);
	logger.setRedactor(createRedactor([secret]));

	logger.debug('nested-entry', {
		request: {
			name: 'fill',
			arguments: {uid: '1_4', value: secret},
			history: [`typed ${secret}`, 'clicked'],
		},
	});

	const written = await logOnceWritten(logDirectory, 'nested-entry');
	t.true(written.includes('nested-entry'), 'the entry must reach the log');
	t.false(written.includes(secret));
	t.deepEqual(entriesOf(written)[0]?.['request'], {
		name: 'fill',
		arguments: {uid: '1_4', value: redactedMarker},
		history: [`typed ${redactedMarker}`, 'clicked'],
	});
});

test('a secret in a logged error and its stack is written as the marker', async t => {
	const {logger, logDirectory} = await loggerOnFreshDirectory(t);
	logger.setRedactor(createRedactor([secret]));
	const failure = new Error(`The server rejected the value ${secret}`);

	logger.error('error-entry', {
		error: failure.message,
		stack: failure.stack,
	});

	const written = await logOnceWritten(logDirectory, 'error-entry');
	t.true(written.includes('error-entry'), 'the entry must reach the log');
	t.false(written.includes(secret));

	const entry = entriesOf(written)[0];
	t.is(entry?.['error'], `The server rejected the value ${redactedMarker}`);
	t.true(String(entry?.['stack']).includes(redactedMarker));
});

test('a secret in another spelling is written as the marker too', async t => {
	// The log is JSON, so a value holding a quote reaches the file escaped; a
	// redactor run over the raw value alone would have to be run early enough.
	const quoted = String.raw`correct-"horse"-battery\staple`;
	const {logger, logDirectory} = await loggerOnFreshDirectory(t);
	logger.setRedactor(createRedactor([quoted]));

	logger.info('spelling-entry', {
		typed: quoted,
		address: `https://app.example.com/?q=${encodeURIComponent(quoted)}`,
	});

	const written = await logOnceWritten(logDirectory, 'spelling-entry');
	t.true(written.includes('spelling-entry'), 'the entry must reach the log');

	const entry = entriesOf(written)[0];
	t.is(entry?.['typed'], redactedMarker);
	t.is(entry?.['address'], `https://app.example.com/?q=${redactedMarker}`);
});

test('with no redactor installed an entry is written as it was given', async t => {
	const {logger, logDirectory} = await loggerOnFreshDirectory(t);

	logger.info(`plain-entry: ${secret}`, {detail: {value: secret}});

	const written = await logOnceWritten(logDirectory, 'plain-entry');
	const entry = entriesOf(written)[0];
	t.is(entry?.['message'], `plain-entry: ${secret}`);
	t.deepEqual(entry?.['detail'], {value: secret});
});

test('removing the redactor stops redacting from then on', async t => {
	const {logger, logDirectory} = await loggerOnFreshDirectory(t);

	logger.setRedactor(createRedactor([secret]));
	logger.info('first-entry', {value: secret});
	logger.setRedactor(undefined);
	logger.info('second-entry', {value: secret});

	const written = await logOnceWritten(logDirectory, 'second-entry');
	const entries = entriesOf(written);

	t.deepEqual(
		entries.map(entry => [entry['message'], entry['value']]),
		[
			['first-entry', redactedMarker],
			['second-entry', secret],
		],
	);
});
