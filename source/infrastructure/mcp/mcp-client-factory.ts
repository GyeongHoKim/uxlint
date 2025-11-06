/**
 * MCP Client Factory
 * Creates and configures MCP clients
 *
 * @packageDocumentation
 */

import {McpClient} from '../../mcp/client/mcp-client.js';
import {getMcpConfigFromEnv} from '../../mcp/client/config.js';

/**
 * MCP Client Factory
 * Encapsulates MCP client creation and configuration
 */
export class McpClientFactory {
	/**
	 * Create and connect a new MCP client
	 *
	 * @param clientName - Client name identifier
	 * @param clientVersion - Client version
	 * @returns Connected MCP client
	 */
	async createClient(
		clientName = 'uxlint',
		clientVersion = '1.0.0',
	): Promise<McpClient> {
		// Get MCP configuration from environment
		const config = getMcpConfigFromEnv();

		// Create and connect MCP client
		const client = new McpClient(clientName, clientVersion);
		await client.connect(config.serverCommand, config.serverArgs);

		return client;
	}
}
