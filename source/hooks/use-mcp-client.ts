/**
 * React hook for MCP client management
 * @packageDocumentation
 */

import {useState, useCallback, useEffect, useRef} from 'react';
import {McpClient} from '../mcp/client/mcp-client.js';
import type {UseMcpClientOptions, Tool} from '../mcp/client/types.js';

/**
 * Return type for useMcpClient hook
 */
export type UseMcpClientReturn = {
	/** MCP client instance (undefined if not connected) */
	client: McpClient | undefined;

	/** Current connection state */
	connected: boolean;

	/** Connection or operation error */
	error: Error | undefined;

	/** Connection health status */
	healthy: boolean;

	/** Connect to the MCP server */
	connect: () => Promise<void>;

	/** Disconnect from the MCP server */
	disconnect: () => Promise<void>;

	/** Reconnect to the MCP server (with retries) */
	reconnect: (maxAttempts?: number) => Promise<void>;

	/** List available tools on the server */
	listTools: () => Promise<Tool[]>;

	/** Get server capabilities */
	getCapabilities: () => Promise<Record<string, unknown>>;
};

/**
 * Hook for managing MCP client connection lifecycle
 *
 * @param options - Configuration options for the MCP client
 * @returns MCP client state and control functions
 *
 * @example
 * ```tsx
 * const { client, connected, error, connect, disconnect } = useMcpClient({
 *   serverCommand: 'npx',
 *   serverArgs: ['@playwright/mcp@latest', '--headless'],
 *   autoConnect: true
 * });
 * ```
 */
export function useMcpClient(options: UseMcpClientOptions): UseMcpClientReturn {
	const [client, setClient] = useState<McpClient | undefined>();
	const [connected, setConnected] = useState(false);
	const [error, setError] = useState<Error | undefined>();
	const [healthy, setHealthy] = useState(false);
	const reconnectAttempts = useRef(0);
	const maxReconnectAttempts = 3; // Per SC-010

	const connect = useCallback(async () => {
		try {
			setError(undefined);

			// Create new client if needed
			const newClient =
				client ??
				new McpClient(
					'uxlint',
					'1.0.0',
				); /* Use package version in production */

			// Connect to server
			await newClient.connect(options.serverCommand, options.serverArgs);

			setClient(newClient);
			setConnected(true);
			setHealthy(true);
			reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
		} catch (error_) {
			setError(error_ as Error);
			setConnected(false);
			setHealthy(false);
			throw error_;
		}
	}, [client, options.serverCommand, options.serverArgs]);

	const disconnect = useCallback(async () => {
		if (client) {
			try {
				await client.close();
			} catch (error_) {
				setError(error_ as Error);
			} finally {
				setConnected(false);
				setHealthy(false);
			}
		}
	}, [client]);

	const reconnect = useCallback(
		async (maxAttempts = maxReconnectAttempts) => {
			const attemptReconnection = async (
				attemptNumber: number,
			): Promise<void> => {
				reconnectAttempts.current = attemptNumber;

				// Disconnect first if connected
				if (client?.isConnected()) {
					await client.close();
				}

				// Create new client and connect
				const newClient = new McpClient('uxlint', '1.0.0');
				await newClient.connect(options.serverCommand, options.serverArgs);

				setClient(newClient);
				setConnected(true);
				setHealthy(true);
				setError(undefined);
				reconnectAttempts.current = 0;
			};

			for (let attempt = 1; attempt <= maxAttempts; attempt++) {
				try {
					// Sequential reconnection attempts - each must complete before deciding to retry
					// eslint-disable-next-line no-await-in-loop -- Required for sequential reconnection with retry logic
					await attemptReconnection(attempt);
					return; // Success
				} catch (error_) {
					setError(error_ as Error);
					setHealthy(false);

					if (attempt >= maxAttempts) {
						setConnected(false);
						throw error_; // Final attempt failed
					}

					// Wait before retry (exponential backoff)
					const waitTime = 1000 * attempt;
					// Sequential backoff delay must complete before next reconnection attempt
					// eslint-disable-next-line no-await-in-loop -- Required for exponential backoff between reconnection attempts
					await new Promise(resolve => {
						setTimeout(resolve, waitTime);
					});
				}
			}
		},
		[client, options.serverCommand, options.serverArgs],
	);

	const listTools = useCallback(async (): Promise<Tool[]> => {
		if (!client) {
			throw new Error('Client not initialized');
		}

		try {
			const tools = await client.listTools();
			setHealthy(true);
			return tools;
		} catch (error_) {
			setError(error_ as Error);
			setHealthy(false);
			throw error_;
		}
	}, [client]);

	const getCapabilities = useCallback(async (): Promise<
		Record<string, unknown>
	> => {
		if (!client) {
			throw new Error('Client not initialized');
		}

		try {
			// Capabilities are exposed through tool discovery
			const tools = await client.listTools();
			setHealthy(true);

			return {
				tools: tools.map(t => ({
					name: t.name,
					description: t.description,
				})),
				connected: client.isConnected(),
				reconnectAttempts: reconnectAttempts.current,
			};
		} catch (error_) {
			setError(error_ as Error);
			setHealthy(false);
			throw error_;
		}
	}, [client]);

	// Auto-connect on mount if requested
	useEffect(() => {
		if (options.autoConnect && !client && !connected) {
			void connect();
		}
	}, [options.autoConnect, client, connected, connect]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (client?.isConnected()) {
				// Use async IIFE to handle cleanup properly
				(async () => {
					try {
						await client.close();
					} catch (error_: unknown) {
						console.error('Error closing MCP client on unmount:', error_);
					}
				})();
			}
		};
	}, [client]);

	return {
		client,
		connected,
		error,
		healthy,
		connect,
		disconnect,
		reconnect,
		listTools,
		getCapabilities,
	};
}
