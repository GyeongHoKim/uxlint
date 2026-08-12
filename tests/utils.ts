/**
 * Test utilities for creating mock objects
 */

import net from 'node:net';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';

/**
 * Resolve once `port` accepts TCP connections, or throw once `timeout` elapses.
 *
 * Sleeping a fixed number of milliseconds and hoping a server has bound by
 * then is a race that only shows up when the whole suite runs in parallel.
 *
 * @param port Port to probe on localhost
 * @param options Timeout and poll interval in milliseconds
 * @param options.timeout Milliseconds to wait before giving up
 * @param options.interval Milliseconds between probes
 */
export async function waitForPort(
	port: number,
	{timeout = 5000, interval = 10}: {timeout?: number; interval?: number} = {},
): Promise<void> {
	const deadline = Date.now() + timeout;

	const canConnect = async () =>
		new Promise<boolean>(resolve => {
			const socket = net
				.connect({port, host: '127.0.0.1'})
				.on('connect', () => {
					socket.destroy();
					resolve(true);
				})
				.on('error', () => {
					socket.destroy();
					resolve(false);
				});
		});

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
			return {};
		},
		async close() {
			// Mock implementation - no-op
		},
	} as unknown as MCPClient;
}
