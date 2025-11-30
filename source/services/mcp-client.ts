import {
	experimental_createMCPClient as createMCPClient,
	type experimental_MCPClient as MCPClient,
} from '@ai-sdk/mcp';
import {Experimental_StdioMCPTransport as StdioMCPTransport} from '@ai-sdk/mcp/mcp-stdio';

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

export const mcpClient = await createPlaywrightMCPClient();
