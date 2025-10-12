/**
 * React hook for browser automation via Playwright MCP
 * @packageDocumentation
 */

import {useState, useEffect, useCallback} from 'react';
import {PlaywrightClient} from '../mcp/client/playwright-client.js';
import type {
	UseMcpClientOptions,
	NavigateResult,
	ScreenshotResult,
	SnapshotResult,
} from '../mcp/client/types.js';
import {useMcpClient} from './use-mcp-client.js';

/**
 * Return type for useBrowserAutomation hook
 */
export type UseBrowserAutomationReturn = {
	/** Playwright client instance (undefined if not ready) */
	playwrightClient: PlaywrightClient | undefined;

	/** Loading state for operations */
	loading: boolean;

	/** Error from browser operations */
	error: Error | undefined;

	/** Navigate to a URL */
	navigate: (url: string, timeout?: number) => Promise<NavigateResult>;

	/** Take a screenshot */
	screenshot: (timeout?: number) => Promise<ScreenshotResult>;

	/** Get accessibility tree snapshot */
	getSnapshot: (timeout?: number) => Promise<SnapshotResult>;

	/** Evaluate JavaScript in page context */
	evaluate: (script: string, timeout?: number) => Promise<unknown>;
};

/**
 * Hook for browser automation using Playwright MCP server
 *
 * @param options - Configuration options for the MCP client
 * @returns Browser automation state and operations
 *
 * @example
 * ```tsx
 * const { navigate, screenshot, getSnapshot, loading, error } = useBrowserAutomation({
 *   serverCommand: 'npx',
 *   serverArgs: ['@playwright/mcp@latest', '--headless'],
 *   autoConnect: true
 * });
 *
 * // Later in your component
 * await navigate('https://example.com');
 * const screenshotResult = await screenshot();
 * ```
 */
export function useBrowserAutomation(
	options: UseMcpClientOptions,
): UseBrowserAutomationReturn {
	// Use underlying MCP client
	const {client: mcpClient, connected, error: mcpError} = useMcpClient(options);

	// Local state
	const [playwrightClient, setPlaywrightClient] = useState<
		PlaywrightClient | undefined
	>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | undefined>();

	// Create PlaywrightClient when MCPClient connects
	useEffect(() => {
		if (connected && mcpClient && !playwrightClient) {
			const client = new PlaywrightClient(mcpClient);
			setPlaywrightClient(client);
			setError(undefined);
		}

		// Clear PlaywrightClient when disconnected
		if (!connected && playwrightClient) {
			setPlaywrightClient(undefined);
		}
	}, [connected, mcpClient, playwrightClient]);

	// Propagate MCP errors
	useEffect(() => {
		if (mcpError) {
			setError(mcpError);
		}
	}, [mcpError]);

	// Navigate wrapper
	const navigate = useCallback(
		async (url: string, timeout?: number): Promise<NavigateResult> => {
			if (!playwrightClient) {
				const navigateError = new Error(
					'Browser automation not ready. Client not connected.',
				);
				setError(navigateError);
				throw navigateError;
			}

			try {
				setLoading(true);
				setError(undefined);
				const result = await playwrightClient.navigate(url, timeout);
				return result;
			} catch (error_) {
				const wrappedError = error_ as Error;
				setError(wrappedError);
				throw wrappedError;
			} finally {
				setLoading(false);
			}
		},
		[playwrightClient],
	);

	// Screenshot wrapper
	const screenshot = useCallback(
		async (timeout?: number): Promise<ScreenshotResult> => {
			if (!playwrightClient) {
				const screenshotError = new Error(
					'Browser automation not ready. Client not connected.',
				);
				setError(screenshotError);
				throw screenshotError;
			}

			try {
				setLoading(true);
				setError(undefined);
				const result = await playwrightClient.screenshot(timeout);
				return result;
			} catch (error_) {
				const wrappedError = error_ as Error;
				setError(wrappedError);
				throw wrappedError;
			} finally {
				setLoading(false);
			}
		},
		[playwrightClient],
	);

	// Get snapshot wrapper
	const getSnapshot = useCallback(
		async (timeout?: number): Promise<SnapshotResult> => {
			if (!playwrightClient) {
				const snapshotError = new Error(
					'Browser automation not ready. Client not connected.',
				);
				setError(snapshotError);
				throw snapshotError;
			}

			try {
				setLoading(true);
				setError(undefined);
				const result = await playwrightClient.getSnapshot(timeout);
				return result;
			} catch (error_) {
				const wrappedError = error_ as Error;
				setError(wrappedError);
				throw wrappedError;
			} finally {
				setLoading(false);
			}
		},
		[playwrightClient],
	);

	// Evaluate wrapper
	const evaluate = useCallback(
		async (script: string, timeout?: number): Promise<unknown> => {
			if (!playwrightClient) {
				const evaluateError = new Error(
					'Browser automation not ready. Client not connected.',
				);
				setError(evaluateError);
				throw evaluateError;
			}

			try {
				setLoading(true);
				setError(undefined);
				const result = await playwrightClient.evaluate(script, timeout);
				return result;
			} catch (error_) {
				const wrappedError = error_ as Error;
				setError(wrappedError);
				throw wrappedError;
			} finally {
				setLoading(false);
			}
		},
		[playwrightClient],
	);

	return {
		playwrightClient,
		loading,
		error,
		navigate,
		screenshot,
		getSnapshot,
		evaluate,
	};
}
