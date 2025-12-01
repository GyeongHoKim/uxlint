import {
	experimental_createMCPClient as createMCPClient,
	type experimental_MCPClient as MCPClient,
} from '@ai-sdk/mcp';
import {Experimental_StdioMCPTransport as StdioMCPTransport} from '@ai-sdk/mcp/mcp-stdio';

/**
 * Singleton instance of MCP client
 */
let mcpClientInstance: MCPClient | undefined;

/**
 * Create Playwright MCP client
 */
async function createPlaywrightMCPClient(): Promise<MCPClient> {
	const transport = new StdioMCPTransport({
		command: 'npx',
		args: ['@playwright/mcp@latest'],
	});

	return createMCPClient({transport});
}

/**
 * Get or create MCP client instance (lazy initialization)
 */
export async function getMCPClient(): Promise<MCPClient> {
	mcpClientInstance ??= await createPlaywrightMCPClient();
	return mcpClientInstance;
}

/**
 * Reset MCP client instance (useful for testing)
 */
export function resetMCPClient(): void {
	mcpClientInstance = undefined;
}
