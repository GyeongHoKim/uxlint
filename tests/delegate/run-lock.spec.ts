/**
 * The lock that makes a run have one writer.
 *
 * Exercised directly rather than only through `submit`, because what it
 * promises is a property of the lock itself: while one caller holds a run, no
 * other caller is inside it, and a caller that died holding it does not take
 * the run with it.
 */

import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {RunBusy, withRunLock} from '../../source/delegate/run-lock.js';

/**
 * A directory standing in for a run.
 *
 * @param teardown - Ava's teardown registrar
 * @returns Its path
 */
async function runDirectory(
	teardown: (fn: () => Promise<void>) => void,
): Promise<string> {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), 'uxlint-run-lock-test-'),
	);
	teardown(async () => {
		await fs.rm(directory, {recursive: true, force: true});
	});

	return directory;
}

test('two holders never overlap', async t => {
	const directory = await runDirectory(t.teardown);
	const order: string[] = [];

	const hold = async (name: string) =>
		withRunLock(directory, async () => {
			order.push(`${name} in`);
			await new Promise(resolve => {
				setTimeout(resolve, 20);
			});
			order.push(`${name} out`);
		});

	await Promise.all([hold('first'), hold('second')]);

	// Whichever went first, it left before the other arrived.
	t.is(order.length, 4);
	t.is(order[1], order[0]!.replace(' in', ' out'));
	t.is(order[3], order[2]!.replace(' in', ' out'));
});

test('the lock is released when the work fails', async t => {
	const directory = await runDirectory(t.teardown);

	await t.throwsAsync(
		withRunLock(directory, async () => {
			throw new Error('the document was refused');
		}),
		{message: 'the document was refused'},
	);

	// A lock left behind by a command that merely said no would cost the next
	// submission its whole wait.
	await t.notThrowsAsync(
		withRunLock(directory, async () => undefined, {waitMs: 50}),
	);
});

test('a holder that will not let go is reported rather than waited on forever', async t => {
	const directory = await runDirectory(t.teardown);

	// Held for longer than the second caller is prepared to wait, and nowhere
	// near old enough to count as abandoned.
	const holder = withRunLock(directory, async () => {
		await new Promise(resolve => {
			setTimeout(resolve, 300);
		});
	});

	const error = await t.throwsAsync<RunBusy>(
		withRunLock(directory, async () => undefined, {
			waitMs: 50,
			staleAfterMs: 60_000,
		}),
		{instanceOf: RunBusy},
	);

	t.regex(error.message, /still writing to this run/);

	await holder;
});

// A run outlives the command that made it, so a process killed while holding
// the lock would otherwise leave the run permanently unsubmittable.
test('a lock nobody is using any more is broken rather than obeyed', async t => {
	const directory = await runDirectory(t.teardown);

	await fs.writeFile(
		path.join(directory, 'writer.lock'),
		JSON.stringify({pid: 1, takenAt: new Date().toISOString()}),
		'utf8',
	);

	await t.notThrowsAsync(
		withRunLock(directory, async () => undefined, {
			waitMs: 50,
			// Anything at all counts as abandoned, which is what the age check
			// decides in production.
			staleAfterMs: 0,
		}),
	);
});
