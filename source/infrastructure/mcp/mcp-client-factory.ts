/**
 * MCP Client Factory
 * Creates and configures MCP clients using official AI SDK integration
 *
 * @packageDocumentation
 */

import {experimental_createMCPClient, type experimental_MCPClient} from 'ai';
import {Experimental_StdioMCPTransport} from '@ai-sdk/mcp/mcp-stdio';
import {type McpConfig} from './config.js';

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
	async createClient(
		config: McpConfig,
		clientName = 'playwright',
	): Promise<experimental_MCPClient> {
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

		// Verify tools are available before returning (with retry)
		// The MCP server may need a moment to fully initialize
		await this.verifyToolsWithRetry(client);

		return client;
	}

	/**
	 * Verify that MCP tools are available with retry logic
	 *
	 * @param client - MCP client to verify
	 * @throws {Error} If tools are not available after retries
	 */
	private async verifyToolsWithRetry(
		client: experimental_MCPClient,
	): Promise<void> {
		const maxRetries = 3;
		const retryDelayMs = 500;

		const attempt = async (attemptNumber: number): Promise<void> => {
			try {
				await client.tools();
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);

				if (attemptNumber >= maxRetries) {
					throw new Error(
						`Failed to verify MCP tools after ${maxRetries} attempts: ${errorMessage}. The MCP server may not be properly initialized.`,
					);
				}

				// Wait before retrying
				await new Promise(resolve => {
					setTimeout(resolve, retryDelayMs);
				});
				return attempt(attemptNumber + 1);
			}
		};

		return attempt(1);
	}
}
