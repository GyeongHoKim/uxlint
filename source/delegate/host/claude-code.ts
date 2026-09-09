/**
 * Claude Code adapter
 *
 * The only host whose whole path -- server injection, tool pre-approval, tool
 * calls arriving with conforming arguments -- was verified by execution rather
 * than read about.
 *
 * @packageDocumentation
 */

import {sessionEnvironmentVariable} from '../../models/delegate.js';
import {
	namespacedTools,
	type HostAgentAdapter,
	type HostLaunch,
	type HostLaunchContext,
} from './types.js';
import {detectBinary, runLaunch} from './process.js';

/** How Claude Code namespaces a server's tools. */
const toolPrefix = 'mcp__uxlint__';

/**
 * The Claude Code adapter.
 */
export const claudeCode: HostAgentAdapter = {
	id: 'claude-code',
	binary: 'claude',

	async detect() {
		return detectBinary('claude', {
			installHint:
				'Install Claude Code from https://claude.com/claude-code, or choose another agent with --host-agent.',
			authHint: 'Run `claude` once and sign in, then try again.',
		});
	},

	buildLaunch(context: HostLaunchContext): HostLaunch {
		const {sessionDirectory, prompt, server} = context;

		const mcpConfig = JSON.stringify({
			mcpServers: {
				uxlint: {
					command: server.command,
					args: server.args,
					env: {[sessionEnvironmentVariable]: sessionDirectory},
				},
			},
		});

		return {
			command: 'claude',
			args: [
				'-p',
				'--output-format',
				'json',
				'--mcp-config',
				mcpConfig,
				// Without this the session also sees whatever servers the
				// developer has configured, which is a wider surface than a UX
				// review needs and a slower start than it deserves.
				'--strict-mcp-config',
				'--allowedTools',
				namespacedTools(toolPrefix).join(','),
				// The read-only posture. It removes the command- and code-running
				// tools and WebFetch, confines the file tools to the working
				// directory, refuses bypassPermissions, and -- the part FR-012
				// actually turns on -- ignores the user, project and local
				// settings files, so the developer's own configuration cannot
				// widen what uxlint just narrowed.
				'--restricted',
			],
			env: {[sessionEnvironmentVariable]: sessionDirectory},
			// Not an argument. `--allowedTools` is declared variadic, so it
			// consumes every following positional and a trailing prompt is
			// parsed as another tool name; Claude Code then exits saying no
			// input was provided. Observed, not theorised.
			stdin: prompt,
		};
	},

	async run(launch, options) {
		return runLaunch(launch, options);
	},
};
