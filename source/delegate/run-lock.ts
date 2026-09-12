/**
 * One writer per run
 *
 * The agent-driven route spans separate invocations, so two of them can be in
 * a run at the same time -- an agent that submits a page as it finishes it has
 * nothing stopping it from starting the next submission first. Each invocation
 * reads the log, decides what the run already holds, appends, then reads the
 * whole log again to assemble the report and overwrite the file. Every one of
 * those steps is correct only if nobody else wrote in between.
 *
 * An in-process queue cannot express that, because the other writer is another
 * process. So the lock is a file, and `wx` is what makes it a lock: creating a
 * file that must not already exist is one atomic operation on every platform
 * this runs on.
 *
 * @packageDocumentation
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {logger} from '../infrastructure/logger.js';

/** Name of the lock file inside a run directory. */
const lockFile = 'writer.lock';

/**
 * How long a caller waits for the writer before giving up.
 *
 * A submission writes a handful of small files, so a wait this long means the
 * holder is not working -- it has died, or it is doing something this feature
 * does not do.
 */
const defaultWaitMs = 30_000;

/**
 * How old a lock has to be before it is treated as abandoned.
 *
 * A process killed between taking the lock and releasing it would otherwise
 * make its run permanently unsubmittable, and the run outlives the command by
 * design here. Longer than the wait above, so a live holder is never robbed of
 * a lock it is still using.
 */
const defaultStaleAfterMs = 120_000;

/** How long to wait between attempts. */
const pollMs = 25;

/**
 * Raised when another command holds the run and would not let go.
 */
export class RunBusy extends Error {
	constructor(directory: string) {
		super(
			`another uxlint command is still writing to this run. Wait for it to finish, then try again (${directory}).`,
		);
		this.name = 'RunBusy';
	}
}

/**
 * Take the lock, or say why not.
 *
 * @param file - The lock file's path
 * @returns Whether this caller now holds it
 */
async function acquire(file: string): Promise<boolean> {
	try {
		const handle = await fs.open(file, 'wx');

		try {
			// The holder's identity, for a developer looking at a run that will
			// not accept a submission.
			await handle.writeFile(
				JSON.stringify({pid: process.pid, takenAt: new Date().toISOString()}),
				'utf8',
			);
		} finally {
			await handle.close();
		}

		return true;
	} catch {
		return false;
	}
}

/**
 * Remove a lock nobody is using any more.
 *
 * @param file - The lock file's path
 * @param staleAfterMs - How old it has to be
 */
async function breakIfStale(file: string, staleAfterMs: number): Promise<void> {
	try {
		const stats = await fs.stat(file);

		if (Date.now() - stats.mtime.getTime() < staleAfterMs) {
			return;
		}

		await fs.rm(file, {force: true});
		logger.warn('Abandoned run lock removed', {file, age: stats.mtime});
	} catch {
		// Gone, or not ours to remove. Either way the next attempt decides.
	}
}

/**
 * Hold a run against every other writer while `work` runs.
 *
 * @param directory - The run directory
 * @param work - What to do while holding it
 * @param options - Overrides for tests
 * @param options.waitMs - How long to wait for the current holder
 * @param options.staleAfterMs - How old a lock has to be to be abandoned
 * @returns Whatever `work` returned
 * @throws RunBusy when the lock could not be taken within the wait
 */
export async function withRunLock<Result>(
	directory: string,
	work: () => Promise<Result>,
	options: {waitMs?: number; staleAfterMs?: number} = {},
): Promise<Result> {
	const {waitMs = defaultWaitMs, staleAfterMs = defaultStaleAfterMs} = options;
	const file = path.join(directory, lockFile);
	const deadline = Date.now() + waitMs;

	// Recursion rather than a polling loop, as `runSequentially` does it: each
	// attempt starts only once the previous one has settled, and the wait
	// between them is the point rather than something to be parallelised away.
	const take = async (): Promise<void> => {
		if (await acquire(file)) {
			return;
		}

		if (Date.now() >= deadline) {
			// One last try, in case the holder died and left its lock behind.
			await breakIfStale(file, staleAfterMs);

			if (await acquire(file)) {
				return;
			}

			throw new RunBusy(directory);
		}

		await new Promise(resolve => {
			setTimeout(resolve, pollMs);
		});

		return take();
	};

	await take();

	try {
		return await work();
	} finally {
		// Released even when the work failed. A lock left behind by a command
		// that merely refused a document would cost the next submission its
		// whole wait.
		await fs.rm(file, {force: true});
	}
}
