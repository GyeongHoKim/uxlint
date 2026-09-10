/**
 * Delegation session
 *
 * One delegated run: the evidence a host agent may ask for, the log its
 * submissions land in, and the state that decides which page each one belongs
 * to.
 *
 * The session lives on disk because the judgement server is a different
 * process from the orchestrator -- the host agent starts it, so it is a
 * grandchild rather than a child. Both ends of this file are uxlint, which is
 * what makes it internal plumbing rather than a contract with the agent.
 *
 * What it is not is private. The directory is a temporary one, and a host
 * agent that can write there can append to the log; a live Cursor Agent run,
 * asked to, did. So the log is written by the intake and validated again on
 * read -- see `submissions`.
 *
 * @packageDocumentation
 */

import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {logger} from '../infrastructure/logger.js';
import {
	recordedSubmissionSchema,
	type PageEvidence,
	type PageJudgementState,
	type RecordedSubmission,
	type SessionManifest,
} from '../models/delegate.js';
import {SubmissionRejected} from './ingest.js';

/**
 * Prefix of a run directory's name.
 *
 * Shared by creation, lookup by identity and the age sweep, so that the three
 * cannot disagree about what a run directory looks like.
 */
export const runDirectoryPrefix = 'uxlint-delegate-';

/** Name of the manifest inside a session directory. */
const manifestFile = 'session.json';

/** Name of the append-only submission log inside a session directory. */
const submissionsFile = 'submissions.jsonl';

/**
 * One delegated run's working state.
 */
export class DelegationSession {
	/**
	 * Start a session and write its manifest.
	 *
	 * The directory is created under the OS temporary directory, never inside
	 * the developer's repository: a delegated run must leave the working tree
	 * exactly as it found it, untracked files included.
	 *
	 * @param manifest - The host agent and the evidence set for this run
	 * @param options - Overrides for tests
	 * @param options.parentDirectory - Where the session directory is created
	 * @returns The started session
	 */
	static async create(
		manifest: Omit<SessionManifest, 'id'>,
		options: {parentDirectory?: string} = {},
	): Promise<DelegationSession> {
		const id = randomUUID();
		const parent = options.parentDirectory ?? os.tmpdir();
		const directory = path.join(parent, `${runDirectoryPrefix}${id}`);

		await fs.mkdir(directory, {recursive: true});

		const complete: SessionManifest = {...manifest, id};
		await fs.writeFile(
			path.join(directory, manifestFile),
			JSON.stringify(complete, undefined, '\t'),
			'utf8',
		);
		await fs.writeFile(path.join(directory, submissionsFile), '', 'utf8');

		logger.info('Delegation session created', {
			id,
			directory,
			hostAgent: manifest.hostAgent,
			pages: manifest.pages.length,
		});

		return new DelegationSession(directory, complete);
	}

	/**
	 * Open a run by the identity `capture` printed.
	 *
	 * The agent-driven route spans separate invocations, so the identity is the
	 * only handle an agent has. Resolved to a directory here rather than by the
	 * caller, so that where runs live stays this class's business.
	 *
	 * @param id - The run identity
	 * @param options - Overrides for tests
	 * @param options.parentDirectory - Where run directories live
	 * @returns The run
	 * @throws Error when the identity names no run
	 */
	static async loadById(
		id: string,
		options: {parentDirectory?: string} = {},
	): Promise<DelegationSession> {
		const parent = options.parentDirectory ?? os.tmpdir();
		return this.load(path.join(parent, `${runDirectoryPrefix}${id}`));
	}

	/**
	 * Open a session another process started.
	 *
	 * @param directory - The session directory, from the environment
	 * @returns The session
	 * @throws Error when the directory holds no manifest
	 */
	static async load(directory: string): Promise<DelegationSession> {
		let raw: string;

		try {
			raw = await fs.readFile(path.join(directory, manifestFile), 'utf8');
		} catch (error) {
			// Named rather than left to surface as a file-not-found: a server
			// that guesses which run it belongs to writes findings into
			// somebody else's report.
			throw new Error(
				`No delegation session at ${directory}. The judgement server must be started by uxlint, not by hand.`,
				{cause: error},
			);
		}

		return new DelegationSession(directory, JSON.parse(raw) as SessionManifest);
	}

	private constructor(
		readonly directory: string,
		private readonly session: SessionManifest,
	) {}

	/** Identity of this run. */
	get id(): string {
		return this.session.id;
	}

	/** The host agent and evidence set this run was started with. */
	get manifest(): SessionManifest {
		return this.session;
	}

	/** Page URLs this run is judging, in configuration order. */
	get pageUrls(): string[] {
		return this.session.pages.map(page => page.pageUrl);
	}

	/**
	 * The evidence for one page.
	 *
	 * @param pageUrl - Page to look up
	 * @returns Its evidence, or undefined when it is not part of this run
	 */
	evidenceFor(pageUrl: string): PageEvidence | undefined {
		return this.session.pages.find(page => page.pageUrl === pageUrl);
	}

	/**
	 * Record one accepted submission.
	 *
	 * Appended as a line rather than rewritten as a document, so a crash
	 * mid-run costs the last line instead of the whole log.
	 *
	 * @param submission - What the host agent submitted, already validated
	 */
	async append(submission: RecordedSubmission): Promise<void> {
		await fs.appendFile(
			path.join(this.directory, submissionsFile),
			JSON.stringify(submission) + '\n',
			'utf8',
		);
	}

	/**
	 * Everything the host agent submitted, in arrival order.
	 *
	 * Read as untrusted input. The log is a file in a temporary directory, and
	 * a host agent that can write there can append to it -- a live Cursor
	 * Agent run, asked to, did. A line that did not come from the intake is
	 * dropped rather than trusted: the strict schema refuses a finding
	 * claiming it was measured, and the page check refuses one attributed to a
	 * page this run never captured.
	 *
	 * Dropped rather than raised, because a report assembled from what
	 * genuinely arrived is worth more than no report at all.
	 *
	 * @returns The session's log, less anything the intake did not write
	 */
	async submissions(): Promise<RecordedSubmission[]> {
		const raw = await fs.readFile(
			path.join(this.directory, submissionsFile),
			'utf8',
		);

		const accepted: RecordedSubmission[] = [];

		for (const [index, line] of raw.split('\n').entries()) {
			if (line.trim().length === 0) {
				continue;
			}

			const submission = this.parseLine(line);

			if (submission) {
				accepted.push(submission);
			} else {
				logger.warn('Submission log line rejected on read', {
					id: this.id,
					line: index + 1,
				});
			}
		}

		return accepted;
	}

	/**
	 * Record that a page's evidence was served.
	 *
	 * The launcher route keeps this in memory for the life of one server
	 * process. This route has no such process -- `evidence` and `submit` are
	 * separate invocations -- so the fact has to survive on disk, or a finding
	 * would be refused for a page the agent had properly read.
	 *
	 * @param pageUrl - The page whose evidence was served
	 */
	async recordOpened(pageUrl: string): Promise<void> {
		await this.append({kind: 'open', pageUrl});
	}

	/**
	 * Rebuild the page judgement state from this run's log.
	 *
	 * Same transitions and same refusals as the live tracker, because a page's
	 * status must not depend on which route judged it.
	 *
	 * @returns A tracker holding the state the log implies
	 */
	async trackerFromLog(): Promise<PageJudgementTracker> {
		return PageJudgementTracker.fromLog(
			this.pageUrls,
			await this.submissions(),
		);
	}

	/**
	 * One log line, if it is one this run's intake could have written.
	 *
	 * @param line - A line of the submission log
	 * @returns The submission, or undefined when the line is not one
	 */
	private parseLine(line: string): RecordedSubmission | undefined {
		let parsed: unknown;

		try {
			parsed = JSON.parse(line);
		} catch {
			return undefined;
		}

		const validated = recordedSubmissionSchema.safeParse(parsed);

		if (!validated.success) {
			return undefined;
		}

		return this.pageUrls.includes(validated.data.pageUrl)
			? validated.data
			: undefined;
	}

	/**
	 * Remove the session directory.
	 *
	 * Idempotent, because it is called from a `finally` on every exit path and
	 * a second call must not turn a failed run into a crashed one.
	 */
	async dispose(): Promise<void> {
		try {
			await fs.rm(this.directory, {recursive: true, force: true});
			logger.debug('Delegation session disposed', {id: this.id});
		} catch (error) {
			// Reported, not raised. A leftover temporary directory is untidy;
			// losing the report that the run just produced is not.
			logger.warn('Delegation session could not be removed', {
				id: this.id,
				directory: this.directory,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

/**
 * Where each page's judgement has reached, inside the one shared session.
 *
 * The built-in mode drops tool results that outlive their page by comparing an
 * epoch, because only one page is ever open and a late result cannot say which
 * page it meant. Here every submission names its page, so the same rule is
 * enforceable by state -- and enforceable means the agent is told, rather than
 * having its work silently discarded.
 */
export class PageJudgementTracker {
	/**
	 * Rebuild the state a run's log implies.
	 *
	 * Replay applies state directly rather than going through `open` and
	 * `finish`, because those exist to refuse a *submitter*. Replaying a log
	 * through them would turn a line the log already holds into a rejection, and
	 * a tampered log would then fail the whole run instead of losing one line —
	 * the log is validated on read for exactly that reason.
	 *
	 * @param pageUrls - The run's pages, in configuration order
	 * @param submissions - Its log, already validated
	 * @returns A tracker holding the state the log implies
	 */
	static fromLog(
		pageUrls: readonly string[],
		submissions: readonly RecordedSubmission[],
	): PageJudgementTracker {
		const tracker = new PageJudgementTracker(pageUrls);

		for (const submission of submissions) {
			if (!tracker.states.has(submission.pageUrl)) {
				continue;
			}

			if (submission.kind === 'complete') {
				tracker.states.set(submission.pageUrl, 'finished');
			} else if (tracker.states.get(submission.pageUrl) === 'not-started') {
				// Anything else on a page means its evidence was served: the `open`
				// record says so outright, and a finding or note could not have
				// been accepted otherwise. A page already finished is not reopened.
				tracker.states.set(submission.pageUrl, 'open');
			}
		}

		return tracker;
	}

	private readonly states = new Map<string, PageJudgementState>();

	constructor(pageUrls: readonly string[]) {
		for (const pageUrl of pageUrls) {
			this.states.set(pageUrl, 'not-started');
		}
	}

	/**
	 * Where a page has reached.
	 *
	 * @param pageUrl - Page to look up
	 * @returns Its state, or undefined when it is not part of this run
	 */
	stateOf(pageUrl: string): PageJudgementState | undefined {
		return this.states.get(pageUrl);
	}

	/** Pages whose judgement was signalled as finished. */
	finished(): string[] {
		return [...this.states]
			.filter(([, state]) => state === 'finished')
			.map(([pageUrl]) => pageUrl);
	}

	/**
	 * Begin judging a page.
	 *
	 * Idempotent: an agent that asks for the same evidence twice is recovering
	 * its place, not making an error.
	 *
	 * @param pageUrl - Page whose evidence was requested
	 * @throws SubmissionRejected when the page is unknown or already finished
	 */
	open(pageUrl: string): void {
		const state = this.require(pageUrl);

		if (state === 'finished' || state === 'abandoned') {
			throw new SubmissionRejected(
				`${pageUrl} is already ${state}. Move on to a page that is not.`,
			);
		}

		this.states.set(pageUrl, 'open');
	}

	/**
	 * Signal that a page's judgement is done.
	 *
	 * @param pageUrl - Page being finished
	 * @throws SubmissionRejected when the page was never opened
	 */
	finish(pageUrl: string): void {
		this.requireOpen(pageUrl);
		this.states.set(pageUrl, 'finished');
	}

	/**
	 * Assert that a page is accepting submissions.
	 *
	 * @param pageUrl - Page a submission named
	 * @throws SubmissionRejected when it is unknown, unopened or closed
	 */
	requireOpen(pageUrl: string): void {
		const state = this.require(pageUrl);

		if (state === 'not-started') {
			throw new SubmissionRejected(
				`${pageUrl} has not been started. Call getPageEvidence for it first, so the judgement is made on the evidence rather than on the URL.`,
			);
		}

		if (state !== 'open') {
			throw new SubmissionRejected(
				`${pageUrl} is already ${state}; this submission arrived too late and was not recorded.`,
			);
		}
	}

	/**
	 * Close out every page still open, and report which they were.
	 *
	 * Called when a session ends before it worked through the page list. The
	 * pages named here kept whatever was submitted for them, but their sweep
	 * did not finish, which is the distinction the report has to preserve.
	 *
	 * @returns The pages that were left open
	 */
	abandonOpen(): string[] {
		const abandoned = [...this.states]
			.filter(([, state]) => state === 'open')
			.map(([pageUrl]) => pageUrl);

		for (const pageUrl of abandoned) {
			this.states.set(pageUrl, 'abandoned');
		}

		return abandoned;
	}

	/**
	 * The state of a page that must belong to this run.
	 *
	 * @param pageUrl - Page to look up
	 * @returns Its state
	 * @throws SubmissionRejected when it is not part of this run
	 */
	private require(pageUrl: string): PageJudgementState {
		const state = this.states.get(pageUrl);

		if (!state) {
			throw new SubmissionRejected(
				`${pageUrl} is not a page in this run. The pages are: ${[...this.states.keys()].join(', ')}.`,
			);
		}

		return state;
	}
}
