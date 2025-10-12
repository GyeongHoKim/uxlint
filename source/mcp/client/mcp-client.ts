/**
 * MCP Client implementation
 * @packageDocumentation
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import type {Tool} from './types.js';
import {
	McpError,
	ConnectionError,
	ServerNotAvailableError,
	ToolInvocationError,
	TimeoutError,
} from './errors.js';

/**
 * MCP client for connecting to and communicating with MCP servers
 */
export class McpClient {
	private readonly client: Client;
	private transport: StdioClientTransport | undefined;
	private connected = false;
	private readonly name: string;
	private readonly version: string;

	/**
	 * Create a new MCP client
	 *
	 * @param name - Client identifier
	 * @param version - Client version (semver)
	 */
	constructor(name: string, version: string) {
		this.name = name;
		this.version = version;

		// Initialize client with capabilities
		this.client = new Client(
			{
				name: this.name,
				version: this.version,
			},
			{
				capabilities: {
					tools: {}, // Support tools
					resources: {}, // Support resources
					prompts: {}, // Support prompts
				},
			},
		);
	}

	/**
	 * Connect to an MCP server
	 *
	 * @param serverCommand - Command to launch the server (e.g., 'npx')
	 * @param serverArgs - Arguments for the server command
	 * @throws {ConnectionError} If connection fails
	 * @throws {ServerNotAvailableError} If server cannot be reached
	 */
	async connect(serverCommand: string, serverArgs: string[]): Promise<void> {
		if (this.connected) {
			throw new McpError(
				'Client is already connected. Call close() before reconnecting.',
				'ALREADY_CONNECTED',
			);
		}

		try {
			// Create stdio transport
			this.transport = new StdioClientTransport({
				command: serverCommand,
				args: serverArgs,
			});

			// Connect to server
			await this.client.connect(this.transport);
			this.connected = true;
		} catch (error) {
			this.transport = undefined;
			this.connected = false;

			// Wrap error with more context
			if (error instanceof Error) {
				if (
					error.message.includes('ENOENT') ||
					error.message.includes('not found')
				) {
					throw new ConnectionError(
						`Failed to start MCP server: command '${serverCommand}' not found`,
						serverCommand,
					);
				}

				if (
					error.message.includes('EACCES') ||
					error.message.includes('permission denied')
				) {
					throw new ConnectionError(
						`Failed to start MCP server: permission denied for '${serverCommand}'`,
						serverCommand,
					);
				}

				throw new ConnectionError(
					`Failed to connect to MCP server: ${error.message}`,
					serverCommand,
				);
			}

			throw new ConnectionError(
				'Failed to connect to MCP server: Unknown error',
				serverCommand,
			);
		}
	}

	/**
	 * List all tools available on the connected server
	 *
	 * @returns Array of available tools with their schemas
	 * @throws {McpError} If client is not connected
	 */
	async listTools(): Promise<Tool[]> {
		if (!this.connected) {
			throw new McpError(
				'Client is not connected. Call connect() first.',
				'NOT_CONNECTED',
			);
		}

		try {
			const response = await this.client.listTools();
			return response.tools as Tool[];
		} catch (error) {
			if (error instanceof Error) {
				throw new ServerNotAvailableError(
					`Failed to list tools: ${error.message}`,
				);
			}

			throw new ServerNotAvailableError('Failed to list tools: Unknown error');
		}
	}

	/**
	 * Invoke a tool on the server
	 *
	 * @param name - Tool name to invoke
	 * @param args - Tool parameters
	 * @param timeout - Optional timeout in milliseconds (default: 30000)
	 * @returns Tool result
	 * @throws {ToolInvocationError} If tool execution fails
	 * @throws {TimeoutError} If tool execution exceeds timeout
	 * @throws {McpError} If client is not connected
	 */
	async callTool<T = unknown>(
		name: string,
		args: Record<string, unknown>,
		timeout = 30_000,
	): Promise<T> {
		if (!this.connected) {
			throw new McpError(
				'Client is not connected. Call connect() first.',
				'NOT_CONNECTED',
			);
		}

		try {
			// Create timeout promise
			const timeoutPromise = new Promise<never>((_resolve, reject) => {
				setTimeout(() => {
					reject(new TimeoutError(`Tool '${name}' timed out`, name, timeout));
				}, timeout);
			});

			// Race between tool call and timeout
			const result = await Promise.race([
				this.client.callTool({
					name,
					arguments: args,
				}),
				timeoutPromise,
			]);

			return result as T;
		} catch (error) {
			if (error instanceof TimeoutError) {
				throw error;
			}

			if (error instanceof Error) {
				throw new ToolInvocationError(
					`Tool '${name}' failed: ${error.message}`,
					name,
					args,
				);
			}

			throw new ToolInvocationError(
				`Tool '${name}' failed: Unknown error`,
				name,
				args,
			);
		}
	}

	/**
	 * Close the connection to the server
	 */
	async close(): Promise<void> {
		if (!this.connected || !this.transport) {
			// Safe to call close even when not connected
			this.connected = false;
			this.transport = undefined;
			return;
		}

		try {
			await this.client.close();
		} catch (error) {
			// Log error but don't throw - cleanup should always succeed
			console.error('Error closing MCP client:', error);
		} finally {
			this.connected = false;
			this.transport = undefined;
		}
	}

	/**
	 * Check if the client is currently connected
	 *
	 * @returns True if connected, false otherwise
	 */
	isConnected(): boolean {
		return this.connected;
	}
}
