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
 * @packageDocumentation
 */

import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {logger} from '../infrastructure/logger.js';
import type {
	PageEvidence,
	PageJudgementState,
	RecordedSubmission,
	SessionManifest,
} from '../models/delegate.js';
import {SubmissionRejected} from './ingest.js';

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
		const directory = path.join(parent, `uxlint-delegate-${id}`);

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
	 * @returns The session's log
	 */
	async submissions(): Promise<RecordedSubmission[]> {
		const raw = await fs.readFile(
			path.join(this.directory, submissionsFile),
			'utf8',
		);

		return raw
			.split('\n')
			.filter(line => line.trim().length > 0)
			.map(line => JSON.parse(line) as RecordedSubmission);
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
