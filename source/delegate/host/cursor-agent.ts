/**
 * Cursor Agent adapter
 *
 * The one host that cannot be handed a server at launch time: Cursor discovers
 * MCP servers only from `.cursor/mcp.json` in the workspace or in the
 * developer's home directory. uxlint does not write either.
 *
 * Writing the workspace file would modify the developer's working tree, which
 * FR-013 forbids outright. Writing the home-level file at run time has the same
 * ownership problem one directory up, and a run that crashed mid-write would
 * leave a configuration they own damaged. So the registration is a documented
 * one-time step the developer performs, exactly as OCR's own delegate mode
 * requires a skill to be installed before first use.
 *
 * @packageDocumentation
 */

import {sessionEnvironmentVariable} from '../../models/delegate.js';
import type {HostAgentAdapter, HostLaunch, HostLaunchContext} from './types.js';
import {detectBinary, runLaunch} from './process.js';

/**
 * The Cursor Agent adapter.
 *
 * The executable is `agent`: that is the only name the Cursor CLI
 * documentation uses, and what its install script verifies with
 * `agent --version`. The host id stays `cursor-agent`, which is what the
 * developer types after `--host-agent` and what the report records.
 */
export const cursorAgent: HostAgentAdapter = {
	id: 'cursor-agent',
	binary: 'agent',

	async detect() {
		return detectBinary('agent', {
			installHint:
				'Install the Cursor CLI from https://cursor.com/docs/cli, or choose another agent with --host-agent.',
			authHint: 'Run `agent login`, then try again.',
		});
	},

	buildLaunch(context: HostLaunchContext): HostLaunch {
		return {
			command: 'agent',
			args: [
				'-p',
				'--output-format',
				'json',
				// Approves the servers the developer registered, which is what
				// lets the judgement tools be called. It does not grant file
				// access, and it is not `--force`.
				'--approve-mcps',
				context.prompt,
			],
			// `--force` and `--yolo` are absent and must stay absent. Without
			// them Cursor proposes changes and applies none, and that absence is
			// the whole of its read-only posture -- there is no narrower flag to
			// ask for one findings file.
			env: {[sessionEnvironmentVariable]: context.sessionDirectory},
		};
	},

	async run(launch, options) {
		return runLaunch(launch, options);
	},
};
