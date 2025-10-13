/**
 * MCP Page Capture Service
 * Wraps Playwright MCP client for page analysis
 *
 * @packageDocumentation
 */

import {McpClient} from '../mcp/client/mcp-client.js';
import {PlaywrightClient} from '../mcp/client/playwright-client.js';
import {getMcpConfigFromEnv} from '../mcp/client/config.js';
import {ToolInvocationError} from '../mcp/client/errors.js';

/**
 * Page capture result from Playwright MCP
 */
export type PageCaptureResult = {
	url: string;
	snapshot: string;
	timestamp: number;
	title?: string;
	status?: number;
};

/**
 * Navigation error
 */
export class NavigationError extends Error {
	constructor(
		message: string,
		public readonly url: string,
		public readonly cause?: Error,
	) {
		super(message);
		this.name = 'NavigationError';
	}
}

/**
 * Snapshot capture error
 */
export class SnapshotError extends Error {
	constructor(
		message: string,
		public readonly url: string,
		public readonly cause?: Error,
	) {
		super(message);
		this.name = 'SnapshotError';
	}
}

/**
 * MCP Page Capture client
 * Wraps PlaywrightClient for UX analysis workflows
 */
export class McpPageCapture {
	private mcpClient: McpClient | undefined;
	private playwrightClient: PlaywrightClient | undefined;
	private initialized = false;

	/**
	 * Navigate to page and capture accessibility snapshot
	 *
	 * @param url - Target page URL
	 * @param timeout - Optional navigation timeout in milliseconds
	 * @returns Page capture result with snapshot and metadata
	 * @throws {NavigationError} If page fails to load
	 * @throws {SnapshotError} If snapshot capture fails
	 */
	async capturePage(url: string, timeout?: number): Promise<PageCaptureResult> {
		// Ensure clients are initialized
		await this.initialize();

		if (!this.playwrightClient) {
			throw new Error('Playwright client not initialized');
		}

		try {
			// Navigate to page
			const navigationResult = await this.playwrightClient.navigate(
				url,
				timeout,
			);

			// Check if navigation succeeded
			if (!navigationResult.success) {
				throw new NavigationError(
					`Failed to navigate to ${url}: Navigation unsuccessful`,
					url,
				);
			}

			// Capture accessibility snapshot
			try {
				const snapshotResult = await this.playwrightClient.getSnapshot(timeout);

				return {
					url: navigationResult.url,
					snapshot: snapshotResult.snapshot,
					timestamp: snapshotResult.timestamp ?? Date.now(),
					title: navigationResult.title,
					status: navigationResult.status,
				};
			} catch (error) {
				throw new SnapshotError(
					`Failed to capture snapshot for ${url}: ${
						error instanceof Error ? error.message : 'Unknown error'
					}`,
					url,
					error instanceof Error ? error : undefined,
				);
			}
		} catch (error) {
			// Re-throw if already our custom error types
			if (error instanceof NavigationError || error instanceof SnapshotError) {
				throw error;
			}

			// Wrap ToolInvocationError as NavigationError
			if (error instanceof ToolInvocationError) {
				throw new NavigationError(
					`Navigation failed: ${error.message}`,
					url,
					error,
				);
			}

			// Wrap generic errors
			if (error instanceof Error) {
				throw new NavigationError(
					`Failed to capture page ${url}: ${error.message}`,
					url,
					error,
				);
			}

			throw new NavigationError(
				`Failed to capture page ${url}: Unknown error`,
				url,
			);
		}
	}

	/**
	 * Cleanup resources
	 * Closes browser and MCP connection
	 */
	async close(): Promise<void> {
		if (!this.initialized) {
			return;
		}

		try {
			// Close Playwright browser
			if (this.playwrightClient) {
				await this.playwrightClient.close();
			}
		} catch (error) {
			console.error('Error closing Playwright client:', error);
		}

		try {
			// Close MCP connection
			if (this.mcpClient) {
				await this.mcpClient.close();
			}
		} catch (error) {
			console.error('Error closing MCP client:', error);
		} finally {
			this.initialized = false;
			this.playwrightClient = undefined;
			this.mcpClient = undefined;
		}
	}

	/**
	 * Initialize MCP and Playwright clients
	 */
	private async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		// Get MCP configuration from environment
		const config = getMcpConfigFromEnv();

		// Create and connect MCP client
		this.mcpClient = new McpClient('uxlint', '1.0.0');
		await this.mcpClient.connect(config.serverCommand, config.serverArgs);

		// Create Playwright client wrapper
		this.playwrightClient = new PlaywrightClient(this.mcpClient);

		this.initialized = true;
	}
}
