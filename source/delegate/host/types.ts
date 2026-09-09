/**
 * Host agent adapters
 *
 * The knowledge of how one coding agent CLI is driven non-interactively. There
 * is no common command form to abstract over: Claude Code prints with `-p`,
 * Codex has no print flag at all and runs through an `exec` subcommand, and
 * Cursor Agent discovers servers only from a file. The seam therefore sits at
 * "launch this agent and tell me how it went", not at individual flags.
 *
 * @packageDocumentation
 */

import type {DelegateHostId} from '../../models/delegate.js';

/**
 * The judgement tools a host agent is allowed to call.
 *
 * Named here rather than at the server, because this is the list an adapter
 * has to pre-approve. Keeping them in one place is what stops an approval list
 * from drifting away from the tool set and silently costing the run a page.
 */
export const judgementToolNames = [
	'listPages',
	'getPageEvidence',
	'addFinding',
	'noteOnMeasuredIssues',
	'completePageAnalysis',
] as const;

/**
 * Everything needed to start one host agent for one run.
 */
export type HostLaunch = {
	/** The executable */
	command: string;

	/** Its full argument vector */
	args: string[];

	/** Environment additions, always carrying the session */
	env: Record<string, string>;

	/**
	 * The prompt, when this agent takes it on stdin.
	 *
	 * Claude Code must, because `--allowedTools` is variadic and swallows a
	 * trailing positional argument.
	 */
	stdin?: string;
};

/**
 * Whether a host agent can be used, and why not when it cannot.
 */
export type HostAvailability =
	| {kind: 'ready'}
	| {kind: 'not-installed'; message: string}
	| {kind: 'not-authenticated'; message: string};

/**
 * How a host agent session ended.
 *
 * Explanation only. Page status is decided by what arrived at the judgement
 * server, never by the agent's account of itself: an exit code is not evidence
 * about a page.
 */
export type HostOutcome = {
	terminated: 'completed' | 'failed' | 'timed-out';
	exitCode?: number;
	stderrSummary?: string;
};

/**
 * What an adapter needs in order to build a launch.
 */
export type HostLaunchContext = {
	/** The session directory, which the server process reads from its environment */
	sessionDirectory: string;

	/** What the agent is being asked to do */
	prompt: string;

	/** How to start uxlint's judgement server */
	server: {command: string; args: string[]};
};

/**
 * One host agent, as the orchestrator sees it.
 */
export type HostAgentAdapter = {
	/** Which agent this is; recorded on the report */
	id: DelegateHostId;

	/** The executable this adapter looks for */
	binary: string;

	/**
	 * Whether this agent is installed and signed in.
	 *
	 * Runs before a browser is started: an availability failure discovered
	 * after the capture pass has already cost the developer a full navigation
	 * and measurement sweep for nothing.
	 */
	detect(): Promise<HostAvailability>;

	/**
	 * The command line for this run.
	 *
	 * Pure, so it can be asserted without spawning anything. That is what makes
	 * the read-only posture testable rather than merely intended.
	 */
	buildLaunch(context: HostLaunchContext): HostLaunch;

	/**
	 * Execute it.
	 *
	 * @param launch - What buildLaunch produced
	 * @param options - Execution controls
	 * @param options.timeoutMs - How long the session may take
	 */
	run(launch: HostLaunch, options?: {timeoutMs?: number}): Promise<HostOutcome>;
};

/**
 * The full pre-approval list one adapter passes to its agent.
 *
 * @param prefix - How that agent namespaces a server's tools
 * @returns The tool names, namespaced
 */
export function namespacedTools(prefix: string): string[] {
	return judgementToolNames.map(name => `${prefix}${name}`);
}
