/**
 * React hook for MCP client management
 * @packageDocumentation
 */

import {useState, useCallback, useEffect} from 'react';
import {McpClient} from '../mcp/client/mcp-client.js';
import type {UseMcpClientOptions} from '../mcp/client/types.js';

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

	/** Connect to the MCP server */
	connect: () => Promise<void>;

	/** Disconnect from the MCP server */
	disconnect: () => Promise<void>;
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
		} catch (error_) {
			setError(error_ as Error);
			setConnected(false);
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
			}
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
		connect,
		disconnect,
	};
}
