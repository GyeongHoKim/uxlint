/**
 * Judgement intake
 *
 * The single point where a host agent's judgement becomes a finding in the
 * report. Validation happens here, and so does origin assignment: a submitter
 * never declares what produced its own output.
 *
 * @packageDocumentation
 */

import type {z} from 'zod/v4';
import type {UxFinding} from '../models/analysis.js';
import {
	judgementFindingSchema,
	type JudgementSubmission,
	type RecordedSubmission,
} from '../models/delegate.js';

/**
 * A submission uxlint refused.
 *
 * Carries a message written for the submitter rather than for a log: the host
 * agent is the only party that can act on it, and it gets one chance to do so
 * on its next call.
 */
export class SubmissionRejected extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SubmissionRejected';
	}
}

/**
 * Render a validation failure as an instruction.
 *
 * Zod reports an unrecognised key with an empty path and the key in `keys`, so
 * naming the offending field means reading both. A rejection that says only
 * "invalid input" leaves the agent to guess, and it will guess the same way
 * again.
 *
 * @param error - What the schema reported
 * @returns One line per problem, each naming a field
 */
function describeIssues(error: z.ZodError): string {
	return error.issues
		.map(issue => {
			if (issue.code === 'unrecognized_keys') {
				return `${issue.keys.join(', ')}: not part of a judgement finding. uxlint assigns origin itself, and ruleId and affectedElements belong only to measured findings.`;
			}

			const field = issue.path.join('.') || 'the submission';
			return `${field}: ${issue.message}`;
		})
		.join('; ');
}

/**
 * Check one submitted finding against the contract and against this run.
 *
 * @param input - What arrived from the host agent
 * @param knownPages - Page URLs this run is judging
 * @returns The submission, typed
 * @throws SubmissionRejected when the contract or the page set is violated
 */
export function validateFinding(
	input: unknown,
	knownPages: readonly string[],
): JudgementSubmission {
	const parsed = judgementFindingSchema.safeParse(input);

	if (!parsed.success) {
		throw new SubmissionRejected(describeIssues(parsed.error));
	}

	if (!knownPages.includes(parsed.data.pageUrl)) {
		throw new SubmissionRejected(
			`pageUrl: ${parsed.data.pageUrl} is not a page in this run. The pages are: ${knownPages.join(', ')}.`,
		);
	}

	return parsed.data;
}

/**
 * Turn an accepted submission into a report finding.
 *
 * The origin is set here rather than accepted from the submitter. A model able
 * to declare its own output measured would make the distinction the report is
 * built on worthless, and no rule identifier is attached, because a judged
 * finding carrying one would claim a verification that never happened.
 *
 * @param submission - An accepted submission
 * @returns The finding as the report will hold it
 */
export function toUxFinding(submission: JudgementSubmission): UxFinding {
	return {
		severity: submission.severity,
		category: submission.category,
		description: submission.description,
		personaRelevance: submission.personaRelevance,
		recommendation: submission.recommendation,
		pageUrl: submission.pageUrl,
		origin: 'judgement',
	};
}

/**
 * What one session produced, grouped by the page it was submitted against.
 */
export type IngestResult = {
	/** Judgement findings, in submission order, per page */
	findingsByPage: Map<string, UxFinding[]>;

	/** The one measurement note a page may carry */
	noteByPage: Map<string, string>;

	/** Pages whose judgement the agent signalled as finished */
	finished: Set<string>;
};

/**
 * Replay a session's recorded submissions.
 *
 * Called by the orchestrator after the host agent has exited. Everything here
 * was already validated on arrival; the origin is assigned again on this side
 * because the report is assembled here and nothing else may set it.
 *
 * @param submissions - The session's log, in arrival order
 * @returns Findings, notes and completions grouped by page
 */
export function collect(
	submissions: readonly RecordedSubmission[],
): IngestResult {
	const findingsByPage = new Map<string, UxFinding[]>();
	const noteByPage = new Map<string, string>();
	const finished = new Set<string>();

	for (const submission of submissions) {
		applySubmission(submission, {findingsByPage, noteByPage, finished});
	}

	return {findingsByPage, noteByPage, finished};
}

/**
 * Fold one recorded submission into the result being built.
 *
 * A function rather than a switch inside the loop, so that each kind is matched
 * by name. The log also carries uxlint's own `open` records, and treating "not a
 * finding or a note" as a completion would report a page as judged the moment
 * its evidence was served.
 *
 * @param submission - One line of the log
 * @param into - The result being accumulated
 */
function applySubmission(
	submission: RecordedSubmission,
	into: IngestResult,
): void {
	switch (submission.kind) {
		case 'finding': {
			const existing = into.findingsByPage.get(submission.pageUrl) ?? [];
			existing.push(toUxFinding(submission.finding));
			into.findingsByPage.set(submission.pageUrl, existing);
			break;
		}

		case 'note': {
			into.noteByPage.set(submission.pageUrl, submission.note);
			break;
		}

		case 'complete': {
			into.finished.add(submission.pageUrl);
			break;
		}

		case 'open': {
			// Page state, which the tracker owns. It contributes nothing to the
			// report, and is matched by name so that a kind added later cannot
			// arrive here unnoticed.
			break;
		}
	}
}
