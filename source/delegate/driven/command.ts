/**
 * The route where the agent drives
 *
 * Delegate mode (009) hands the UX judgement to a coding agent by **launching**
 * it as a child process and serving evidence over MCP. Everything in this
 * directory is the other direction: the agent the developer is already working
 * inside calls uxlint itself.
 *
 * That inversion is not a preference. Launching works for Claude Code and for
 * Codex, both of which accept an injected server and have a real read-only
 * posture. It cannot work for Cursor Agent, whose CLI refuses to start without
 * workspace trust, gives an MCP server child none of its own environment, and
 * offers no flag combination that both submits findings and refuses writes.
 * When uxlint does not launch the agent, it never has to confine it, never
 * needs trust, and never has to get a per-run session into a child it does not
 * control.
 *
 * **Nothing here may know which agent is calling.** That is the whole of the
 * route's host neutrality, and `tests/delegate/driven/host-neutrality.spec.ts`
 * enforces it structurally by proving no module in this directory can reach
 * `source/delegate/host/`. A behavioural test would not notice the property
 * being lost.
 *
 * **Nothing here may render Ink.** The caller is a program parsing stdout, so a
 * frame in the middle of a payload is a parse error rather than a cosmetic
 * problem.
 *
 * @packageDocumentation
 */

import type {UxLintConfig} from '../../models/config.js';

/**
 * What a verb needs from the command line.
 *
 * `loadConfig` is passed in rather than imported so that a verb can be driven in
 * a test without a configuration file on disk, and so that the verbs that do not
 * need a configuration never load one.
 */
export type DrivenOptions = {
	/** The run identity a verb acts on, from `--run` */
	run?: string;

	/** One page URL, from `--page` */
	page?: string;

	/** The judgement document's path, from `--file` */
	file?: string;

	/** Reads and validates this directory's configuration */
	loadConfig: () => UxLintConfig;
};

/**
 * Run one agent-driven verb.
 *
 * @param verb - The verb, already checked against the known set
 * @param options - What the command line supplied
 * @returns The exit code for the command
 */
export async function runDrivenCommand(
	verb: string,
	options: DrivenOptions,
): Promise<number> {
	// Each verb is wired here as it lands. Until then the command reports that
	// rather than doing something adjacent to what was asked.
	void options;

	throw new Error(`delegate ${verb} is not implemented yet`);
}
