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
 * What a run records in place of a launcher identity when nothing was launched.
 *
 * The agent-driven route has no host agent: the developer's own agent calls
 * uxlint, and uxlint never starts it. The field says which route made the run
 * rather than naming an adapter that had no part in it.
 */
export const agentDrivenRoute = 'agent-driven';

/**
 * What the orchestrator wrote for the server process to find.
 */
export type SessionManifest = {
	/** Identity of this run */
	id: string;

	/** Which adapter is performing the judgement, or the route when none did */
	hostAgent: DelegateHostId | typeof agentDrivenRoute;

	/** The evidence set, in configuration order */
	pages: PageEvidence[];

	/**
	 * Everything the report needs that the evidence does not carry.
	 *
	 * Present only on the agent-driven route, and load-bearing there. On the
	 * launcher route one process captures, judges and writes the report, so the
	 * measurements and the browser's identity are still in memory when the
	 * report is assembled. On that route the report is assembled by a *later
	 * command*, which has none of it -- so it is persisted here, or the measured
	 * half of the report would simply be missing and SC-003 could not hold.
	 *
	 * Untyped at this layer on purpose: it holds `CapturedPage` values, and
	 * naming that type here would make the model layer depend on the capture
	 * pass rather than the other way round.
	 */
	captured?: unknown[];

	/** Report provenance recorded at capture time, for the same reason */
	provenance?: {
		browserServer: string;
		browserServerVersion: string;
		browserVersion: string;
		externalDataAllowed: boolean;
	};

	/** The run's persona, so the later command need not re-derive it */
	persona?: string;
};

/**
 * One page's judgement, as an agent submits it.
 *
 * `findings` is deliberately left unvalidated here. This schema checks the
 * envelope; each finding inside it is checked one at a time by the same
 * `validateFinding` the judgement server uses.
 *
 * That split is what makes partial acceptance possible, and partial acceptance
 * is the normal case rather than an error path: validating findings as part of
 * the document would mean one malformed finding rejected the whole document and
 * cost an agent a page's work. It also keeps the promise that the document adds
 * a wrapper rather than a second definition of a finding -- there is exactly one
 * place a finding's shape is decided, and it is not here.
 */
const judgementPageSchema = z.strictObject({
	pageUrl: z.string().min(1),
	findings: z.array(z.unknown()).optional(),
	measurementNote: z.string().min(1).optional(),

	/**
	 * The agent's signal that it is done with this page.
	 *
	 * A signal, not a status. uxlint records it and then decides status itself,
	 * because page status is decided by what arrived and never by the agent's
	 * account of how the review went.
	 */
	finished: z.boolean().optional(),
});

/**
 * The document `delegate submit` accepts.
 *
 * One document per call covering one or more pages, because that is what an
 * agent driving a CLI can compose in one step -- as against the tool route,
 * where each finding is its own call.
 *
 * Strict at every level. An unrecognised key is a rejection rather than
 * something quietly dropped: a submitter that believed it had claimed something
 * uxlint silently discarded is worse off than one that was told no.
 */
export const judgementDocumentSchema = z.strictObject({
	run: z.string().min(1),
	pages: z.array(judgementPageSchema).min(1),
});

/**
 * A judgement document, typed.
 */
export type JudgementDocument = z.infer<typeof judgementDocumentSchema>;

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
	// Written by uxlint, never submitted: the record that a page's evidence was
	// served, so the state machine survives a route where no process outlives
	// one command. On the launcher route the tracker holds this in memory for
	// the life of a session; here `submit` runs in a different process from
	// `evidence`, and without it a finding would be refused for a page the
	// agent had properly read. It carries no provenance risk.
	z.strictObject({
		kind: z.literal('open'),
		pageUrl: z.string().min(1),
	}),
]);

/**
 * One thing a host agent submitted, as the server recorded it.
 */
export type RecordedSubmission = z.infer<typeof recordedSubmissionSchema>;
