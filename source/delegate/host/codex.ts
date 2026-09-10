/**
 * Codex adapter
 *
 * Codex differs from the other two in the one place an abstraction would have
 * hidden: it has no print flag. `-p` is `--profile`, so passing it expecting
 * print mode selects a configuration profile that does not exist, and
 * non-interactive execution is the `exec` subcommand instead.
 *
 * @packageDocumentation
 */

import {sessionEnvironmentVariable} from '../../models/delegate.js';
import type {HostAgentAdapter, HostLaunch, HostLaunchContext} from './types.js';
import {detectBinary, probeAuthenticated, runLaunch} from './process.js';

/**
 * Render the judgement server as an inline TOML table.
 *
 * `-c` parses its value as TOML, so the server can be injected as an argument
 * and no configuration file has to be written into anything the developer
 * owns.
 *
 * `default_tools_approval_mode` is what makes the injection useful rather than
 * merely present. `codex exec` runs with `approval_policy = never`, and under
 * that policy Codex auto-approves an MCP call only when the sandbox has full
 * disk write access -- which `-s read-only` is precisely there to deny. So a
 * read-only `codex exec` registers the server, lists its tools, and then fails
 * every call with "MCP tool call requires approval, but approval policy is
 * never". Observed: a delegated run exited 0 in 26 s having judged nothing,
 * and the report recorded both pages as unjudged. Approving this one server's
 * tools resolves the deadlock without touching the sandbox, and is scoped to
 * `mcp_servers.uxlint` rather than to Codex as a whole.
 *
 * @param context - The launch context
 * @returns The `-c` value
 */
function inlineServerConfig(context: HostLaunchContext): string {
	const args = context.server.args
		.map(argument => JSON.stringify(argument))
		.join(', ');

	return `mcp_servers.uxlint={command=${JSON.stringify(context.server.command)}, args=[${args}], env={${sessionEnvironmentVariable}=${JSON.stringify(context.sessionDirectory)}}, default_tools_approval_mode="approve"}`;
}

/**
 * The Codex adapter.
 */
export const codex: HostAgentAdapter = {
	id: 'codex',
	binary: 'codex',

	async detect() {
		const installed = detectBinary('codex', {
			installHint:
				'Install Codex from https://developers.openai.com/codex/cli, or choose another agent with --host-agent.',
			authHint: 'Run `codex login`, then try again.',
		});

		if (installed.kind !== 'ready') {
			return installed;
		}

		// Codex is the one host that will say whether it is signed in, and
		// asking costs a fast local call. Without it an unauthenticated Codex
		// counts as available, gets chosen, and fails after a full capture pass
		// with a message about nothing in particular.
		if (!probeAuthenticated('codex', ['login', 'status'])) {
			return {
				kind: 'not-authenticated' as const,
				message:
					'uxlint: codex is installed but not signed in. Run `codex login`, then try again.',
			};
		}

		return installed;
	},

	buildLaunch(context: HostLaunchContext): HostLaunch {
		return {
			command: 'codex',
			args: [
				'exec',
				// The read-only posture. Codex sandboxes the commands its model
				// generates, and this is the policy that permits none of them to
				// write.
				'-s',
				'read-only',
				'--json',
				'-c',
				inlineServerConfig(context),
				context.prompt,
			],
			env: {[sessionEnvironmentVariable]: context.sessionDirectory},
		};
	},

	async run(launch, options) {
		return runLaunch(launch, options);
	},
};
