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

import {
	writeStructuredOutput,
	writeTerminalMessage,
} from '../../infrastructure/console-output.js';
import type {UxLintConfig} from '../../models/config.js';
import {captureForAgent} from './capture.js';
import {serveEvidence} from './evidence.js';
import {discardRun, listRuns} from './runs.js';
import {submitJudgement} from './submit.js';

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
 * Insist on a run identity.
 *
 * Every verb but `capture` and `runs` needs one, and none of them may fall back
 * to "the current run": a command that guesses which review it belongs to writes
 * findings into somebody else's report.
 *
 * @param run - What `--run` supplied, if anything
 * @returns The identity
 * @throws Error when it is missing
 */
function requireRun(run: string | undefined): string {
	if (run === undefined || run.trim().length === 0) {
		throw new Error(
			'this command needs --run <id>, the identity `uxlint delegate capture` printed. `uxlint delegate runs` lists the runs that exist.',
		);
	}

	return run;
}

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
	try {
		switch (verb) {
			case 'capture': {
				return await captureForAgent(options.loadConfig());
			}

			case 'evidence': {
				return await serveEvidence({
					run: requireRun(options.run),
					...(options.page !== undefined && {page: options.page}),
				});
			}

			case 'submit': {
				return await submitJudgement(options.loadConfig(), {
					run: requireRun(options.run),
					...(options.file !== undefined && {file: options.file}),
				});
			}

			case 'runs': {
				const found = await listRuns();
				writeStructuredOutput({
					runs: found.map(run => ({
						...run,
						capturedAt: run.capturedAt.toISOString(),
					})),
				});
				return 0;
			}

			case 'discard': {
				await discardRun(requireRun(options.run));
				return 0;
			}

			default: {
				// Unreachable: the caller checks the verb against the known set
				// before dispatching, so that an unknown one is refused by name.
				throw new Error(`delegate ${verb} is not a command`);
			}
		}
	} catch (error) {
		writeTerminalMessage(
			`uxlint: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
		return 1;
	}
}
