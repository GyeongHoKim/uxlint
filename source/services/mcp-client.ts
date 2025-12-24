import {
	experimental_createMCPClient as createMCPClient,
	type experimental_MCPClient as MCPClient,
} from '@ai-sdk/mcp';
import {Experimental_StdioMCPTransport as StdioMCPTransport} from '@ai-sdk/mcp/mcp-stdio';
import {logger} from '../infrastructure/logger.js';

/**
 * Singleton instance of MCP client
 */
let mcpClientInstance: MCPClient | undefined;

/**
 * Create Playwright MCP client
 */
async function createPlaywrightMCPClient(): Promise<MCPClient> {
	try {
		logger.info('Creating Playwright MCP client', {
			command: 'npx',
			args: '@playwright/mcp@latest --ignore-https-errors',
		});

		const transport = new StdioMCPTransport({
			command: 'npx',
			args: ['@playwright/mcp@latest', '--ignore-https-errors'],
		});

		const client = await createMCPClient({transport});

		logger.info('Playwright MCP client created successfully');

		return client;
	} catch (error) {
		logger.error('Failed to create MCP client', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		throw error;
	}
}

/**
 * Get or create MCP client instance (lazy initialization)
 */
export async function getMCPClient(): Promise<MCPClient> {
	logger.debug('Getting MCP client instance', {
		exists: mcpClientInstance !== undefined,
	});

	if (!mcpClientInstance) {
		mcpClientInstance = await createPlaywrightMCPClient();
		logger.info('MCP client initialized (lazy)');
	}

	return mcpClientInstance;
}

/**
 * Reset MCP client instance (useful for testing)
 */
export function resetMCPClient(): void {
	mcpClientInstance = undefined;
	logger.debug('MCP client instance reset');
}
