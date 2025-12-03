/**
 * Test utilities for creating mock objects
 */

import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';

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
