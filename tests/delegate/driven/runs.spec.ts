/**
 * `delegate runs` and `delegate discard`.
 *
 * These exist for one requirement: a run that outlives the command that made it
 * must be discoverable and disposable. Without them every abandoned review would
 * leave a directory nobody ever mentions.
 */

import {promises as fsPromises} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {discardRun, listRuns} from '../../../source/delegate/driven/runs.js';
import {DelegationSession} from '../../../source/delegate/session.js';

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
		path.join(os.tmpdir(), 'uxlint-runs-test-'),
	);
	teardown(async () => {
		await fsPromises.rm(directory, {recursive: true, force: true});
	});
	return directory;
}

const twoPages = () => ({
	hostAgent: 'agent-driven' as const,
	pages: [
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
		},
	],
});

test('a run is listed with how far it got', async t => {
	const parent = await parentDirectory(t.teardown);
	const session = await DelegationSession.create(twoPages(), {
		parentDirectory: parent,
	});

	await session.recordOpened('https://example.com/page-1');
	await session.append({
		kind: 'complete',
		pageUrl: 'https://example.com/page-1',
	});

	const listed = await listRuns({parentDirectory: parent});

	t.is(listed.length, 1);
	t.is(listed[0]!.id, session.id);
	t.is(listed[0]!.pages, 2);
	t.is(listed[0]!.judged, 1, 'one of the two pages is finished');
	t.true(listed[0]!.capturedAt instanceof Date);
});

test('no runs is an empty list, not a failure', async t => {
	const parent = await parentDirectory(t.teardown);

	t.deepEqual(await listRuns({parentDirectory: parent}), []);
});

test('a directory that is not a run is not listed', async t => {
	const parent = await parentDirectory(t.teardown);
	await fsPromises.mkdir(path.join(parent, 'uxlint-delegate-half-written'));

	// A directory with no readable manifest is not a review anybody abandoned,
	// and reporting it as one would send a developer looking for something that
	// was never there.
	t.deepEqual(await listRuns({parentDirectory: parent}), []);
});

test('runs are listed newest first', async t => {
	const parent = await parentDirectory(t.teardown);
	const older = await DelegationSession.create(twoPages(), {
		parentDirectory: parent,
	});
	const newer = await DelegationSession.create(twoPages(), {
		parentDirectory: parent,
	});

	const backdated = new Date(Date.now() - 60 * 60 * 1000);
	await fsPromises.utimes(older.directory, backdated, backdated);

	const listed = await listRuns({parentDirectory: parent});

	t.deepEqual(
		listed.map(run => run.id),
		[newer.id, older.id],
	);
});

test('discard removes a run', async t => {
	const parent = await parentDirectory(t.teardown);
	const session = await DelegationSession.create(twoPages(), {
		parentDirectory: parent,
	});

	await discardRun(session.id, {parentDirectory: parent});

	t.deepEqual(await listRuns({parentDirectory: parent}), []);
	await t.throwsAsync(
		DelegationSession.loadById(session.id, {parentDirectory: parent}),
		{message: /No delegation session/},
	);
});

// A cleanup command that fails the second time you run it is one a developer
// stops trusting.
test('discarding the same run twice is not an error', async t => {
	const parent = await parentDirectory(t.teardown);
	const session = await DelegationSession.create(twoPages(), {
		parentDirectory: parent,
	});

	await discardRun(session.id, {parentDirectory: parent});
	await t.notThrowsAsync(discardRun(session.id, {parentDirectory: parent}));
});

// The identity arrives on a command line an agent writes, and discard deletes
// recursively. Joined onto a path unchecked, `../keep-me` names a sibling of
// the runs rather than a run.
test('discard refuses an identity that is not one, and deletes nothing', async t => {
	const parent = await parentDirectory(t.teardown);
	const bystander = path.join(parent, 'keep-me');
	await fsPromises.mkdir(bystander);

	await t.throwsAsync(discardRun('../keep-me', {parentDirectory: parent}), {
		message: /not a run identity/,
	});
	await t.notThrowsAsync(fsPromises.stat(bystander));
});

test('discarding a run that never existed is not an error', async t => {
	const parent = await parentDirectory(t.teardown);

	await t.notThrowsAsync(
		discardRun('00000000-0000-4000-8000-000000000000', {
			parentDirectory: parent,
		}),
	);
});
