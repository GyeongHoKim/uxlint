/**
 * `delegate evidence`
 *
 * Reads a run's captured evidence back out. Opens no browser: everything it
 * serves was captured once, which is the reason this is a separate verb from
 * `capture`. Folded together, taking pages one at a time would re-open a browser
 * per page and turn eight seconds per page into eight seconds per page per read.
 *
 * Serving a page also records that it was served. On the launcher route the
 * judgement server holds that in memory for the life of one session; here
 * `submit` is a different process, and without the record it would refuse a
 * finding for a page the agent had properly read.
 *
 * @packageDocumentation
 */

import {logger} from '../../infrastructure/logger.js';
import {
	writeStructuredOutput,
	writeTerminalMessage,
} from '../../infrastructure/console-output.js';
import type {PageEvidence} from '../../models/delegate.js';
import {RunBusy, withRunLock} from '../run-lock.js';
import {DelegationSession} from '../session.js';

/**
 * What `evidence` needs.
 */
export type EvidenceOptions = {
	/** The run identity, from `--run` */
	run: string;

	/** One page URL, from `--page`; every page when absent */
	page?: string;

	/** Where run directories live */
	parentDirectory?: string;

	/** Where the payload goes */
	emitPayload?: (payload: unknown) => void;

	/** Where user-facing messages go */
	emitMessage?: (message: string) => void;
};

/**
 * Serve a run's evidence.
 *
 * @param options - The run, and optionally the one page wanted
 * @returns `0` on success, `1` when the run or the page does not exist
 */
export async function serveEvidence(options: EvidenceOptions): Promise<number> {
	const {
		run,
		page,
		parentDirectory,
		emitPayload = writeStructuredOutput,
		emitMessage = writeTerminalMessage,
	} = options;

	let session: DelegationSession;

	try {
		session = await DelegationSession.loadById(
			run,
			parentDirectory === undefined ? {} : {parentDirectory},
		);
	} catch {
		// Named rather than guessed at. A command that fell back to "the current
		// run" would serve one review's evidence for another's judgement.
		emitMessage(
			`uxlint: no run ${run}. Run \`uxlint delegate capture\` first, or \`uxlint delegate runs\` to see which runs exist.`,
		);
		return 1;
	}

	let pages: PageEvidence[];

	if (page === undefined) {
		pages = session.manifest.pages;
	} else {
		const one = session.evidenceFor(page);

		if (!one) {
			emitMessage(
				`uxlint: ${page} is not a page in run ${run}. The pages are: ${session.pageUrls.join(', ')}.`,
			);
			return 1;
		}

		pages = [one];
	}

	// Recorded before the payload goes out, so a crash between the two cannot
	// leave an agent holding evidence for a page uxlint does not think it read.
	// One append for all of them, in the order they are served, and under the
	// run's lock: a submission deciding what this run holds must not have these
	// lines appear in the middle of its own read.
	try {
		await withRunLock(session.directory, async () => {
			await session.recordOpened(...pages.map(served => served.pageUrl));
		});
	} catch (error) {
		if (error instanceof RunBusy) {
			emitMessage(`uxlint: ${error.message}`);
			return 1;
		}

		throw error;
	}

	logger.info('Evidence served', {run, pages: pages.length});
	emitPayload({run: session.id, pages});
	return 0;
}
