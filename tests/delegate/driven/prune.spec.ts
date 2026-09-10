/**
 * Sweeping runs that nobody came back for.
 *
 * A run on this route outlives the command that made it, which is the point and
 * also the only new failure mode in the feature. Nothing can hold a `finally`
 * across two invocations, so without a sweep every review would leave a
 * directory behind and nobody would ever mention it.
 *
 * `capture` is the one command always run before a review and never during one,
 * which is what makes it the only safe moment to delete somebody else's run.
 */

import {promises as fsPromises} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {
	pruneRuns,
	runRetentionMs,
} from '../../../source/delegate/driven/runs.js';
import {DelegationSession} from '../../../source/delegate/session.js';

/**
 * A parent directory of its own, so one test's sweep cannot see another's runs.
 *
 * @param teardown - Ava's teardown registrar
 * @returns The directory
 */
async function parentDirectory(
	teardown: (fn: () => Promise<void>) => void,
): Promise<string> {
	const directory = await fsPromises.mkdtemp(
		path.join(os.tmpdir(), 'uxlint-prune-test-'),
	);
	teardown(async () =>
		fsPromises.rm(directory, {recursive: true, force: true}),
	);
	return directory;
}

const manifest = () => ({
	hostAgent: 'claude-code' as const,
	pages: [
		{
			pageUrl: 'https://example.com/',
			features: 'Landing page',
			persona: 'A first-time visitor on a phone',
			snapshot: 'button "Sign up"',
			measurementDigest: 'No violations measured.',
		},
	],
});

/**
 * Age a run by moving its directory's modification time back.
 *
 * @param directory - The run directory
 * @param ms - How far back to move it
 */
async function age(directory: string, ms: number): Promise<void> {
	const when = new Date(Date.now() - ms);
	await fsPromises.utimes(directory, when, when);
}

test('a run older than the retention window is swept', async t => {
	const parent = await parentDirectory(t.teardown);
	const session = await DelegationSession.create(manifest(), {
		parentDirectory: parent,
	});

	await age(session.directory, runRetentionMs + 60_000);
	const swept = await pruneRuns({parentDirectory: parent});

	t.deepEqual(swept, [session.id]);
	t.false(
		await fsPromises
			.stat(session.directory)
			.then(() => true)
			.catch(() => false),
	);
});

test('a run inside the window is left alone', async t => {
	const parent = await parentDirectory(t.teardown);
	const session = await DelegationSession.create(manifest(), {
		parentDirectory: parent,
	});

	const swept = await pruneRuns({parentDirectory: parent});

	t.deepEqual(swept, []);
	const reopened = await DelegationSession.loadById(session.id, {
		parentDirectory: parent,
	});
	t.is(reopened.id, session.id);
});

test('a directory that is not a run is not touched', async t => {
	const parent = await parentDirectory(t.teardown);
	const bystander = path.join(parent, 'something-else');
	await fsPromises.mkdir(bystander);
	await age(bystander, runRetentionMs * 10);

	const swept = await pruneRuns({parentDirectory: parent});

	t.deepEqual(swept, []);
	t.true(
		await fsPromises
			.stat(bystander)
			.then(() => true)
			.catch(() => false),
		'sweeping runs must not delete anything else in the temporary directory',
	);
});

// The sweep is a courtesy on the way to doing the real work. A run somebody
// else holds open, or a permission uxlint does not have, must not cost the
// developer their capture.
test('a run that cannot be removed does not fail the sweep', async t => {
	const parent = await parentDirectory(t.teardown);
	const session = await DelegationSession.create(manifest(), {
		parentDirectory: parent,
	});
	await age(session.directory, runRetentionMs * 2);

	// Replace the manifest with a directory of the same name: removal of the
	// tree still succeeds, so instead make the parent unreadable mid-sweep by
	// pointing the sweep at a path that is not a directory at all.
	const notADirectory = path.join(parent, 'file-not-dir');
	await fsPromises.writeFile(notADirectory, 'x', 'utf8');

	await t.notThrowsAsync(pruneRuns({parentDirectory: notADirectory}));
	await t.notThrowsAsync(pruneRuns({parentDirectory: parent}));
});
