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

import type {LaunchableHostId} from '../../models/delegate.js';

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
	id: LaunchableHostId;

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
	 * @param options.cwd - Where to run it; the caller's directory by default
	 * @param options.signal - Aborted when the run's own bound expires; the
	 * session must end when it is, because the run removes its directory next
	 */
	run(
		launch: HostLaunch,
		options?: {timeoutMs?: number; cwd?: string; signal?: AbortSignal},
	): Promise<HostOutcome>;
};

/**
 * What a read-only launch looks like for each host agent.
 *
 * Declared as data so that a new adapter has to appear here to be launchable
 * at all, rather than inheriting the obligation by convention and quietly
 * skipping it.
 *
 * `cursor-agent` is absent, and its absence is the point. A live run showed that
 * no flag combination makes a launched Cursor Agent both submit findings and
 * refuse writes, so there is no posture to declare for it -- and an entry
 * claiming one would be this table asserting something already disproved. It is
 * supported through the agent-driven route instead, where uxlint launches
 * nothing and so has nothing to confine.
 */
export const readOnlyPosture: Record<
	LaunchableHostId,
	{
		/** Argv tokens that must all be present */
		required: string[];

		/** Flags that must be followed by a specific value */
		requiredValues: Array<[string, string]>;

		/** Argv tokens that must never be present */
		forbidden: string[];
	}
> = {
	'claude-code': {
		required: ['--restricted'],
		requiredValues: [],
		forbidden: ['--dangerously-skip-permissions', '--permission-mode'],
	},
	codex: {
		required: [],
		requiredValues: [['-s', 'read-only']],
		forbidden: [
			'--dangerously-bypass-approvals-and-sandbox',
			'--approve-for-me',
			'--dangerously-bypass-hook-trust',
		],
	},
};

/**
 * Every value a flag was given, in the order it was given them.
 *
 * Both forms count, because `--flag value` and `--flag=value` are one
 * instruction to an argument parser. Every occurrence counts too: a repeated
 * flag is resolved by the agent's own parser, and Codex takes the last `-s` it
 * is given -- so a launch checked at its first occurrence is a launch whose
 * effective sandbox nobody checked.
 *
 * @param args - The argument vector
 * @param flag - The flag to collect
 * @returns Its values, one per occurrence
 */
function valuesOf(args: readonly string[], flag: string): string[] {
	const values: string[] = [];

	for (const [index, argument] of args.entries()) {
		if (argument === flag) {
			// A trailing flag has no value at all, which is not the required one
			// either.
			values.push(args[index + 1] ?? '');
		} else if (argument.startsWith(`${flag}=`)) {
			values.push(argument.slice(flag.length + 1));
		}
	}

	return values;
}

/**
 * Whether an argument vector carries a flag, in either form it can be written.
 *
 * @param args - The argument vector
 * @param flag - The flag to look for
 * @returns Whether it is present in either form
 */
function carriesFlag(args: readonly string[], flag: string): boolean {
	return args.some(
		argument => argument === flag || argument.startsWith(`${flag}=`),
	);
}

/**
 * Refuse a launch that would let a host agent write.
 *
 * Called by the orchestrator on every built launch, not only by tests. FR-012
 * says the posture must survive the developer's own configuration; this is
 * what makes it survive a future edit to an adapter as well.
 *
 * @param id - Which agent the launch is for
 * @param launch - What the adapter built
 * @throws Error when the launch is not read-only
 */
export function assertReadOnly(id: LaunchableHostId, launch: HostLaunch): void {
	const posture = readOnlyPosture[id];

	const missing = posture.required.filter(
		flag => !carriesFlag(launch.args, flag),
	);
	if (missing.length > 0) {
		throw new Error(
			`The ${id} launch is missing ${missing.join(', ')}, which is what keeps a delegated run from modifying the repository.`,
		);
	}

	for (const [flag, value] of posture.requiredValues) {
		const given = valuesOf(launch.args, flag);

		if (given.length === 0 || given.some(one => one !== value)) {
			throw new Error(
				`The ${id} launch must pass ${flag} ${value} and no other value for it, which is what keeps a delegated run from modifying the repository.`,
			);
		}
	}

	const permitted = posture.forbidden.filter(flag =>
		carriesFlag(launch.args, flag),
	);
	if (permitted.length > 0) {
		throw new Error(
			`The ${id} launch carries ${permitted.join(', ')}, which would let the agent write to the repository.`,
		);
	}
}

/**
 * The full pre-approval list one adapter passes to its agent.
 *
 * @param prefix - How that agent namespaces a server's tools
 * @returns The tool names, namespaced
 */
export function namespacedTools(prefix: string): string[] {
	return judgementToolNames.map(name => `${prefix}${name}`);
}
