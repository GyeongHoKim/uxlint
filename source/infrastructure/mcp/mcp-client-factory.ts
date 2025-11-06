/**
 * MCP Client Factory
 * Creates and configures MCP clients using official AI SDK integration
 *
 * @packageDocumentation
 */

import {experimental_createMCPClient, type experimental_MCPClient} from 'ai';
import {Experimental_StdioMCPTransport} from '@ai-sdk/mcp/mcp-stdio';
import {getMcpConfigFromEnv} from '../../mcp/client/config.js';

/**
 * MCP Client Factory
 * Encapsulates MCP client creation and configuration using AI SDK
 */
export class McpClientFactory {
	/**
	 * Create and connect a new MCP client using AI SDK
	 *
	 * @param clientName - Client name identifier
	 * @returns Connected MCP client with AI SDK integration
	 */
	async createClient(clientName = 'uxlint'): Promise<experimental_MCPClient> {
		// Get MCP configuration from environment
		const config = getMcpConfigFromEnv();

		// Create stdio transport for local MCP server
		const transport = new Experimental_StdioMCPTransport({
			command: config.serverCommand,
			args: config.serverArgs,
		});

		// Create and connect MCP client using AI SDK
		const client = await experimental_createMCPClient({
			name: clientName,
			transport,
		});

		return client;
	}
}
