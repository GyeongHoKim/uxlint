/**
 * Test utilities for creating mock objects
 */

import net from 'node:net';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {tool} from 'ai';
import {z} from 'zod/v4';

/**
 * Resolve once `port` accepts TCP connections, or throw once `timeout` elapses.
 *
 * Sleeping a fixed number of milliseconds and hoping a server has bound by
 * then is a race that only shows up when the whole suite runs in parallel.
 *
 * Probes both loopback families and accepts either. The servers under test
 * bind by name -- `listen(port, 'localhost')`, inside oauth-callback -- and
 * Node has not reordered lookup results since 17, so on a host whose
 * `localhost` resolves to `::1` first (GitHub's runners, for one) the server
 * ends up bound to IPv6 only. A probe hardcoded to `127.0.0.1` is then
 * refused until the deadline even though the server came up fine. Probing the
 * name instead would not fix it either: that leaves the outcome to whatever
 * the machine's `/etc/hosts` happens to list, which is how this passed
 * locally and failed in CI.
 *
 * @param port Port to probe on loopback
 * @param options Timeout and poll interval in milliseconds
 * @param options.timeout Milliseconds to wait before giving up
 * @param options.interval Milliseconds between probes
 */
export async function waitForPort(
	port: number,
	{timeout = 5000, interval = 10}: {timeout?: number; interval?: number} = {},
): Promise<void> {
	const deadline = Date.now() + timeout;

	const canConnectVia = async (host: string) =>
		new Promise<boolean>(resolve => {
			const socket = net
				.connect({port, host})
				.on('connect', () => {
					socket.destroy();
					resolve(true);
				})
				.on('error', () => {
					socket.destroy();
					resolve(false);
				});
		});

	const canConnect = async () => {
		const reachable = await Promise.all(
			['127.0.0.1', '::1'].map(async host => canConnectVia(host)),
		);
		return reachable.includes(true);
	};

	// eslint-disable-next-line no-await-in-loop -- probes are inherently sequential
	while (!(await canConnect())) {
		if (Date.now() > deadline) {
			throw new Error(`Port ${port} did not open within ${timeout}ms`);
		}

		// eslint-disable-next-line no-await-in-loop -- back off between probes
		await new Promise(resolve => {
			setTimeout(resolve, interval);
		});
	}
}

/**
 * Poll until `predicate` returns true, or throw once `timeout` elapses.
 *
 * Component tests render asynchronously, so asserting after a fixed sleep is
 * inherently racy: the sleep has to be long enough for the slowest machine
 * under the heaviest parallel load, and any value that satisfies that is
 * wasted time everywhere else. Polling a condition is both faster and stable.
 *
 * @param predicate Condition to wait for
 * @param options Timeout and poll interval in milliseconds
 * @param options.timeout Milliseconds to wait before giving up
 * @param options.interval Milliseconds between polls
 */
export async function waitFor(
	predicate: () => boolean,
	{timeout = 5000, interval = 10}: {timeout?: number; interval?: number} = {},
): Promise<void> {
	const deadline = Date.now() + timeout;

	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error(`waitFor timed out after ${timeout}ms`);
		}

		// eslint-disable-next-line no-await-in-loop
		await new Promise(resolve => {
			setTimeout(resolve, interval);
		});
	}
}

/**
 * Create a mock MCP client for testing.
 *
 * Only `tools()` and `close()` are implemented, because those are the only
 * members AIService ever calls. Spelling out the full MCPClient interface is
 * what made the previous version of this helper break on every `@ai-sdk/mcp`
 * release -- v2 alone added listTools, callTool, toolsFromDefinitions,
 * complete and onElicitationRequest, and renamed listPrompts/getPrompt to
 * experimental_*.
 *
 * @returns Mock MCPClient instance
 */
export function createMockMCPClient(): MCPClient {
	return {
		async tools() {
			// Offers the two tools the analysis requires. An empty set is no
			// longer a stand-in for "a browser server": the client narrows the
			// server's tools to the ones it needs and fails when they are
			// absent, because the prompt tells the model to call them.
			return {
				navigate_page: tool({
					description: 'Navigate to a URL',
					inputSchema: z.object({url: z.string()}),
					async execute() {
						return 'Successfully navigated.';
					},
				}),
				take_snapshot: tool({
					description: 'Capture the accessibility tree',
					inputSchema: z.object({}),
					async execute() {
						return 'button "Sign up"';
					},
				}),
			};
		},
		async close() {
			// Mock implementation - no-op
		},
	} as unknown as MCPClient;
}
