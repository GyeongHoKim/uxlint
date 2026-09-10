/**
 * Delegate mode types
 *
 * The contract between uxlint and a host agent that judges a run on its
 * behalf. Nothing here reaches a report: a submission becomes a `UxFinding`
 * only after ingest, which is where the origin is assigned.
 *
 * @packageDocumentation
 */

import {z} from 'zod/v4';

/**
 * Host agents delegate mode knows how to drive.
 */
export const delegateHostIds = [
	'claude-code',
	'codex',
	'cursor-agent',
] as const;

/**
 * Identity of one host agent.
 */
export type DelegateHostId = (typeof delegateHostIds)[number];

/**
 * Whether a string names a supported host agent.
 *
 * @param value - Candidate identifier, usually from the command line
 * @returns Whether it is one this project can drive
 */
export function isDelegateHostId(value: string): value is DelegateHostId {
	return (delegateHostIds as readonly string[]).includes(value);
}

/**
 * Environment variable carrying the session directory to the server process.
 *
 * The judgement server is started by the host agent, not by uxlint, so it is a
 * grandchild of the orchestrator. An inherited environment is what reaches it
 * without either intermediate process having to know this feature exists.
 */
export const sessionEnvironmentVariable = 'UXLINT_DELEGATE_SESSION';

/**
 * What a host agent may submit as a finding.
 *
 * Strict on purpose. `origin`, `ruleId` and `affectedElements` are absent, and
 * a submission carrying one is refused rather than quietly stripped: the first
 * is uxlint's to assign, and the other two exist only on measured findings, so
 * a submitter setting them would be claiming a verification that never
 * happened. Silently dropping them would leave the agent believing it had
 * claimed something it had not.
 */
export const judgementFindingSchema = z.strictObject({
	severity: z.enum(['critical', 'high', 'medium', 'low']),
	category: z.string().min(1),
	description: z.string().min(1),
	personaRelevance: z.array(z.string()),
	recommendation: z.string().min(1),
	pageUrl: z.string().min(1),
});

/**
 * A finding as it arrived, before uxlint stamped its origin.
 */
export type JudgementSubmission = z.infer<typeof judgementFindingSchema>;

/**
 * Where a page's judgement has reached, within the one session that covers the
 * whole run.
 */
export type PageJudgementState =
	'not-started' | 'open' | 'finished' | 'abandoned';

/**
 * Everything a host agent is given about one page.
 *
 * Produced entirely without a model, and served through tools rather than
 * embedded in a prompt: one session covers every page, and a captured page
 * structure is large enough that concatenating them all would spend the
 * session's context before judgement began.
 */
export type PageEvidence = {
	/** The page under judgement, and the key every submission names */
	pageUrl: string;

	/** The page's declared features, from the configuration */
	features: string;

	/** The run's persona */
	persona: string;

	/** The browser's own output, unaltered */
	snapshot: string;

	/** What was measured, described the way the built-in mode describes it */
	measurementDigest: string;

	/**
	 * Why the page was never read, when it was not.
	 *
	 * Present only on a page whose capture failed. Such a page is still served
	 * rather than withheld, so the agent can tell a page it has not reached
	 * from a page there is nothing to say about.
	 */
	captureFailureReason?: string;
};

/**
 * What the orchestrator wrote for the server process to find.
 */
export type SessionManifest = {
	/** Identity of this run */
	id: string;

	/** Which adapter is performing the judgement */
	hostAgent: DelegateHostId;

	/** The evidence set, in configuration order */
	pages: PageEvidence[];
};

/**
 * One thing a host agent submitted, as the server recorded it.
 *
 * The server validates on arrival so the agent can correct itself; the
 * orchestrator replays this log afterwards.
 *
 * Both ends are uxlint, but the file between them is not private to uxlint: it
 * sits in a temporary directory, and a host agent able to write there can
 * append to it. A live Cursor Agent run, asked to, did. So the log is
 * validated on the way back in as well, by this schema -- which is strict, and
 * so refuses the escalation that matters most: a line claiming its finding was
 * measured.
 */
export const recordedSubmissionSchema = z.discriminatedUnion('kind', [
	z.strictObject({
		kind: z.literal('finding'),
		pageUrl: z.string().min(1),
		finding: judgementFindingSchema,
	}),
	z.strictObject({
		kind: z.literal('note'),
		pageUrl: z.string().min(1),
		note: z.string().min(1),
	}),
	z.strictObject({
		kind: z.literal('complete'),
		pageUrl: z.string().min(1),
	}),
]);

/**
 * One thing a host agent submitted, as the server recorded it.
 */
export type RecordedSubmission = z.infer<typeof recordedSubmissionSchema>;
