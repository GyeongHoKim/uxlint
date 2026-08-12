/**
 * Test utilities for creating mock objects
 */

import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';

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
 * Create a mock MCP client for testing
 * Implements all MCPClient interface methods
 *
 * Note: Type assertions are necessary here because MCPClient uses complex
 * generic types (especially for tools()) that cannot be satisfied with
 * simple mock implementations. This is a common pattern in test mocking.
 *
 * @returns Mock MCPClient instance
 */
export function createMockMCPClient(): MCPClient {
	return {
		// Type assertion needed due to complex generic return type McpToolSet<TOOL_SCHEMAS>
		tools: (async () => {
			return {};
		}) as MCPClient['tools'],
		async close() {
			// Mock implementation - no-op
		},
		async listResources() {
			const result: Awaited<ReturnType<MCPClient['listResources']>> = {
				resources: [],
			};
			return result;
		},
		async readResource() {
			const result: Awaited<ReturnType<MCPClient['readResource']>> = {
				contents: [],
			};
			return result;
		},
		async listResourceTemplates() {
			const result: Awaited<ReturnType<MCPClient['listResourceTemplates']>> = {
				resourceTemplates: [],
			};
			return result;
		},
		async listPrompts() {
			const result: Awaited<ReturnType<MCPClient['listPrompts']>> = {
				prompts: [],
			};
			return result;
		},
		async getPrompt() {
			const result: Awaited<ReturnType<MCPClient['getPrompt']>> = {
				messages: [],
			};
			return result;
		},
	};
}
