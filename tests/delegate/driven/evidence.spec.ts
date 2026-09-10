/**
 * `delegate evidence` — reading a run's captured evidence back out.
 *
 * The verb that justifies `capture` and `evidence` being separate: an agent must
 * be able to take one page at a time without a browser being opened again.
 */

import {promises as fsPromises} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {serveEvidence} from '../../../source/delegate/driven/evidence.js';
import {DelegationSession} from '../../../source/delegate/session.js';
import type {PageEvidence} from '../../../source/models/delegate.js';

/** What `evidence` prints. */
type EvidencePayload = {run: string; pages: PageEvidence[]};

const pages: PageEvidence[] = [
	{
		pageUrl: 'https://example.com/page-1',
		features: 'Landing page',
		persona: 'A first-time visitor on a phone',
		snapshot: 'button "Sign up"',
		measurementDigest: 'Two violations measured.',
	},
	{
		pageUrl: 'https://example.com/page-2',
		features: 'Pricing table',
		persona: 'A first-time visitor on a phone',
		snapshot: 'table "Plans"',
		measurementDigest: 'No violations measured.',
		captureFailureReason: 'The page could not be opened: navigation failed',
	},
];

/**
 * A run to read evidence out of.
 *
 * @param teardown - Ava's teardown registrar
 * @returns The run and the directory it lives in
 */
async function runWithEvidence(
	teardown: (fn: () => Promise<void>) => void,
): Promise<{session: DelegationSession; parent: string}> {
	const parent = await fsPromises.mkdtemp(
		path.join(os.tmpdir(), 'uxlint-evidence-test-'),
	);
	teardown(async () => {
		await fsPromises.rm(parent, {recursive: true, force: true});
	});

	const session = await DelegationSession.create(
		{hostAgent: 'claude-code', pages},
		{parentDirectory: parent},
	);

	return {session, parent};
}

test('every page comes back, with everything needed to judge it', async t => {
	const {session, parent} = await runWithEvidence(t.teardown);
	let payload: EvidencePayload | undefined;

	const exitCode = await serveEvidence({
		run: session.id,
		parentDirectory: parent,
		emitPayload(value: unknown) {
			payload = value as EvidencePayload;
		},
		emitMessage() {
			t.fail('a successful read prints no message');
		},
	});

	t.is(exitCode, 0);
	t.is(payload!.run, session.id);
	t.deepEqual(payload!.pages, pages);
});

// A page uxlint could not read is served with its reason rather than withheld:
// withheld, it is indistinguishable to an agent from a page it has not reached.
test('a page whose capture failed is served with the reason', async t => {
	const {session, parent} = await runWithEvidence(t.teardown);
	let payload: EvidencePayload | undefined;

	await serveEvidence({
		run: session.id,
		page: 'https://example.com/page-2',
		parentDirectory: parent,
		emitPayload(value: unknown) {
			payload = value as EvidencePayload;
		},
	});

	t.is(payload!.pages.length, 1);
	t.regex(payload!.pages[0]!.captureFailureReason!, /could not be opened/);
});

test('one page can be taken at a time', async t => {
	const {session, parent} = await runWithEvidence(t.teardown);
	let payload: EvidencePayload | undefined;

	const exitCode = await serveEvidence({
		run: session.id,
		page: 'https://example.com/page-1',
		parentDirectory: parent,
		emitPayload(value: unknown) {
			payload = value as EvidencePayload;
		},
	});

	t.is(exitCode, 0);
	t.deepEqual(
		payload!.pages.map(page => page.pageUrl),
		['https://example.com/page-1'],
	);
});

test('reading evidence opens the page, so a later submission is accepted', async t => {
	const {session, parent} = await runWithEvidence(t.teardown);

	await serveEvidence({
		run: session.id,
		page: 'https://example.com/page-1',
		parentDirectory: parent,
		emitPayload() {
			// Discarded.
		},
	});

	// The record has to be on disk: `submit` runs in a different process and
	// would otherwise refuse a finding for a page the agent had properly read.
	const reopened = await DelegationSession.loadById(session.id, {
		parentDirectory: parent,
	});
	const tracker = await reopened.trackerFromLog();

	t.is(tracker.stateOf('https://example.com/page-1'), 'open');
	t.is(tracker.stateOf('https://example.com/page-2'), 'not-started');
});

test('a page outside the run is refused, and the run’s pages are named', async t => {
	const {session, parent} = await runWithEvidence(t.teardown);
	const messages: string[] = [];

	const exitCode = await serveEvidence({
		run: session.id,
		page: 'https://elsewhere.test/',
		parentDirectory: parent,
		emitPayload() {
			t.fail('a refused read prints no payload');
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	t.is(exitCode, 1);
	t.regex(messages.join('\n'), /page-1/);
	t.regex(messages.join('\n'), /page-2/);
});

test('a run that does not exist is refused rather than guessed at', async t => {
	const messages: string[] = [];

	const exitCode = await serveEvidence({
		run: '00000000-0000-4000-8000-000000000000',
		emitPayload() {
			t.fail('there is nothing to print');
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	t.is(exitCode, 1);
	t.regex(messages.join('\n'), /00000000-0000-4000-8000-000000000000/);
});
