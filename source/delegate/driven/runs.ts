/**
 * Runs that outlive the command that made them
 *
 * On the launcher route one process covers a whole review, so the run is
 * removed in a `finally` and nothing can be left behind. This route spans
 * separate invocations and nothing can hold that `finally`, which is the only
 * genuinely new failure mode the route introduces: without a sweep, every review
 * would leave a directory in the temporary directory and nobody would ever
 * mention it.
 *
 * So disposal is explicit — `discard` — and everything nobody came back for is
 * swept by age. `capture` is the one command always run before a review and
 * never during one, which makes it the only safe moment to delete a run
 * somebody else may still be using.
 *
 * @packageDocumentation
 */

import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {logger} from '../../infrastructure/logger.js';
import {runSequentially} from '../../utils/run-sequentially.js';
import {DelegationSession, isRunId, runDirectoryPrefix} from '../session.js';

/**
 * How long a run nobody came back for is kept.
 *
 * Long enough that a developer can pick a review up the next morning; short
 * enough that an abandoned capture does not outlive the branch it was made on.
 */
export const runRetentionMs = 24 * 60 * 60 * 1000;

/**
 * What one run looks like from the outside.
 */
export type RunSummary = {
	/** The identity an agent passes to every other verb */
	id: string;

	/** When the run was captured */
	capturedAt: Date;

	/** Pages the run covers */
	pages: number;

	/** How many of them have been judged to completion */
	judged: number;
};

/**
 * One run directory, as found on disk.
 */
type RunDirectory = {id: string; directory: string; modified: Date};

/**
 * Where runs live.
 *
 * @param options - Overrides for tests
 * @param options.parentDirectory - Where run directories live
 * @returns The parent directory
 */
function parentOf(options: {parentDirectory?: string}): string {
	return options.parentDirectory ?? os.tmpdir();
}

/**
 * Every run directory under the parent, newest first.
 *
 * @param options - Overrides for tests
 * @param options.parentDirectory - Where run directories live
 * @returns Identity and directory of each run found
 */
async function runDirectories(
	options: {parentDirectory?: string} = {},
): Promise<RunDirectory[]> {
	const parent = parentOf(options);

	let entries;
	try {
		entries = await fs.readdir(parent, {withFileTypes: true});
	} catch (error) {
		// Reported, not raised. Listing runs is never the point of a command;
		// failing one because the temporary directory could not be read would
		// cost a developer their capture over housekeeping.
		logger.warn('Run directory could not be listed', {
			parent,
			error: error instanceof Error ? error.message : String(error),
		});
		return [];
	}

	const found: RunDirectory[] = [];
	const runs = entries.filter(
		entry => entry.isDirectory() && entry.name.startsWith(runDirectoryPrefix),
	);

	// One stat per run, and there are few.
	await runSequentially(runs, async entry => {
		const directory = path.join(parent, entry.name);

		try {
			const stats = await fs.stat(directory);
			found.push({
				id: entry.name.slice(runDirectoryPrefix.length),
				directory,
				modified: stats.mtime,
			});
		} catch {
			// Gone between the listing and the stat. Nothing to report.
		}
	});

	return found.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

/**
 * Remove runs older than the retention window.
 *
 * Never raises. A run somebody else holds open, or a permission uxlint does not
 * have, must not cost the developer the capture this sweep is a courtesy on the
 * way to.
 *
 * @param options - Overrides for tests
 * @param options.parentDirectory - Where run directories live
 * @returns Identities of the runs that were removed
 */
export async function pruneRuns(
	options: {parentDirectory?: string} = {},
): Promise<string[]> {
	const cutoff = Date.now() - runRetentionMs;
	const runs = await runDirectories(options);
	const expired = runs.filter(run => run.modified.getTime() < cutoff);
	const removed: string[] = [];

	// One removal at a time, in the order the runs were listed.
	await runSequentially(expired, async run => {
		try {
			await fs.rm(run.directory, {recursive: true, force: true});
			removed.push(run.id);
			logger.info('Abandoned run swept', {id: run.id});
		} catch (error) {
			logger.warn('Abandoned run could not be swept', {
				id: run.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});

	return removed;
}

/**
 * Every run that exists, and how far each got.
 *
 * A run whose manifest will not load is skipped rather than reported as broken:
 * this is how a developer finds a review they abandoned, and a half-written
 * directory is not one of those.
 *
 * @param options - Overrides for tests
 * @param options.parentDirectory - Where run directories live
 * @returns One summary per readable run, newest first
 */
export async function listRuns(
	options: {parentDirectory?: string} = {},
): Promise<RunSummary[]> {
	const summaries: RunSummary[] = [];

	// One run at a time, and there are few.
	await runSequentially(await runDirectories(options), async run => {
		try {
			const session = await DelegationSession.load(run.directory);
			const tracker = await session.trackerFromLog();

			summaries.push({
				id: session.id,
				capturedAt: run.modified,
				pages: session.pageUrls.length,
				judged: tracker.finished().length,
			});
		} catch {
			// Not a readable run. Skipped silently: an unreadable directory is
			// noise here, and the sweep will deal with it in time.
		}
	});

	return summaries;
}

/**
 * Delete one run.
 *
 * Idempotent, because a cleanup command that fails the second time you run it is
 * one a developer stops trusting.
 *
 * @param id - The run identity
 * @param options - Overrides for tests
 * @param options.parentDirectory - Where run directories live
 * @throws Error when `id` is not shaped like a run identity
 */
export async function discardRun(
	id: string,
	options: {parentDirectory?: string} = {},
): Promise<void> {
	// The identity arrives on a command line an agent writes, and the removal
	// below is recursive. One carrying a separator or a `..` would name a
	// directory outside the runs, so anything but the shape `capture` hands
	// out is refused before it becomes a path.
	if (!isRunId(id)) {
		throw new Error(
			`${id} is not a run identity. \`uxlint delegate runs\` lists the runs that exist.`,
		);
	}

	const directory = path.join(parentOf(options), `${runDirectoryPrefix}${id}`);
	await fs.rm(directory, {recursive: true, force: true});
	logger.info('Run discarded', {id});
}
