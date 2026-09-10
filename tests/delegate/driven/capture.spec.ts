/**
 * `delegate capture` — the deterministic half, run by the agent.
 *
 * Driven with an injected browser and no agent anywhere, which is the point of
 * the route: everything here is work uxlint does itself, and a model is not
 * involved in any of it.
 */

import {promises as fsPromises} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';
import {captureForAgent} from '../../../source/delegate/driven/capture.js';
import {DelegationSession} from '../../../source/delegate/session.js';
import type {PreflightVerdict} from '../../../source/models/browser-preflight.js';
import {configFor, fakeBrowser, readyVerdict} from '../helpers.js';

/**
 * A parent directory of its own, so one test's runs are invisible to another's.
 *
 * @param teardown - Ava's teardown registrar
 * @returns The directory
 */
async function parentDirectory(
	teardown: (fn: () => Promise<void>) => void,
): Promise<string> {
	const directory = await fsPromises.mkdtemp(
		path.join(os.tmpdir(), 'uxlint-capture-test-'),
	);
	teardown(async () => {
		await fsPromises.rm(directory, {recursive: true, force: true});
	});
	return directory;
}

/** What `capture` prints, as far as these tests need it. */
type CapturePayload = {
	run: string;
	pages: Array<{pageUrl: string; captured: boolean; failureReason?: string}>;
};

const silent = {
	async runPreflight() {
		return readyVerdict;
	},
	emitMessage() {
		// Nothing is printed during a test.
	},
};

test('every configured page is captured, and the run identity is printed', async t => {
	const parent = await parentDirectory(t.teardown);
	const payloads: unknown[] = [];

	const exitCode = await captureForAgent(configFor(2, 'report.md'), {
		...silent,
		client: fakeBrowser(),
		parentDirectory: parent,
		emitPayload(payload: unknown) {
			payloads.push(payload);
		},
	});

	t.is(exitCode, 0);
	t.is(payloads.length, 1, 'the payload is the command’s whole output');

	const payload = payloads[0] as CapturePayload;
	t.truthy(payload.run);
	t.deepEqual(
		payload.pages.map(page => page.pageUrl),
		['https://example.com/page-1', 'https://example.com/page-2'],
	);
	t.true(payload.pages.every(page => page.captured));
});

test('the run it printed is the run that exists afterwards', async t => {
	const parent = await parentDirectory(t.teardown);
	let payload: CapturePayload | undefined;

	await captureForAgent(configFor(2, 'report.md'), {
		...silent,
		client: fakeBrowser(),
		parentDirectory: parent,
		emitPayload(value: unknown) {
			payload = value as CapturePayload;
		},
	});

	const session = await DelegationSession.loadById(payload!.run, {
		parentDirectory: parent,
	});

	t.deepEqual(session.pageUrls, [
		'https://example.com/page-1',
		'https://example.com/page-2',
	]);

	// The evidence an agent will ask for has to be there already: `evidence`
	// opens no browser.
	const evidence = session.evidenceFor('https://example.com/page-1');
	t.truthy(evidence);
	t.is(evidence!.persona, 'A first-time visitor on a phone');
	t.true(evidence!.snapshot.length > 0);
	t.true(evidence!.measurementDigest.length > 0);
});

test('a page that could not be read is recorded with its reason', async t => {
	const parent = await parentDirectory(t.teardown);
	let payload: CapturePayload | undefined;

	const exitCode = await captureForAgent(configFor(1, 'report.md'), {
		...silent,
		client: fakeBrowser({navigateSucceeds: false}),
		parentDirectory: parent,
		emitPayload(value: unknown) {
			payload = value as CapturePayload;
		},
	});

	// A page uxlint could not open is a fact about the page, not a failure of
	// the command: the agent is still told, and still gets a run to work with.
	t.is(exitCode, 0);
	t.false(payload!.pages[0]!.captured);
	t.regex(payload!.pages[0]!.failureReason!, /could not be opened/);

	const session = await DelegationSession.loadById(payload!.run, {
		parentDirectory: parent,
	});
	t.regex(
		session.evidenceFor('https://example.com/page-1')!.captureFailureReason!,
		/could not be opened/,
	);
});

test('a browser the environment cannot run stops the command before it claims a capture', async t => {
	const parent = await parentDirectory(t.teardown);
	const messages: string[] = [];

	const exitCode = await captureForAgent(configFor(1, 'report.md'), {
		client: fakeBrowser(),
		parentDirectory: parent,
		async runPreflight(): Promise<PreflightVerdict> {
			return {
				kind: 'unmet',
				requirement: {kind: 'browser-absent', searchedPaths: ['/nowhere']},
			};
		},
		emitMessage(message: string) {
			messages.push(message);
		},
		emitPayload() {
			t.fail('nothing may be printed when nothing was captured');
		},
	});

	t.is(exitCode, 1);
	t.true(messages.length > 0);
});

// The feature's premise. A credential may be present and must still go unread.
// Watched at its real source, the environment, rather than through a hook the
// command could simply never call. Serial because it swaps a process global.
test.serial('no model provider credential is read', async t => {
	const parent = await parentDirectory(t.teardown);
	const credential = 'UXLINT_AI_API_KEY';
	const environment = process.env;
	let readCredential = false;

	process.env = new Proxy(environment, {
		get(target, key) {
			if (key === credential) {
				readCredential = true;
				return 'a-key';
			}

			return Reflect.get(target, key) as unknown;
		},
		has(target, key) {
			if (key === credential) {
				readCredential = true;
				return true;
			}

			return Reflect.has(target, key);
		},
	});
	t.teardown(() => {
		process.env = environment;
	});

	await captureForAgent(configFor(1, 'report.md'), {
		...silent,
		client: fakeBrowser(),
		parentDirectory: parent,
		emitPayload() {
			// Discarded.
		},
	});

	t.false(
		readCredential,
		'the deterministic half must not reach for a credential it has no use for',
	);
});

test('capture sweeps runs nobody came back for', async t => {
	const parent = await parentDirectory(t.teardown);

	const abandoned = await DelegationSession.create(
		{
			hostAgent: 'claude-code',
			pages: [
				{
					pageUrl: 'https://example.com/old',
					features: 'f',
					persona: 'p',
					snapshot: 's',
					measurementDigest: 'm',
				},
			],
		},
		{parentDirectory: parent},
	);

	const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
	await fsPromises.utimes(abandoned.directory, old, old);

	await captureForAgent(configFor(1, 'report.md'), {
		...silent,
		client: fakeBrowser(),
		parentDirectory: parent,
		emitPayload() {
			// Discarded.
		},
	});

	await t.throwsAsync(
		DelegationSession.loadById(abandoned.id, {parentDirectory: parent}),
		{message: /No delegation session/},
	);
});
