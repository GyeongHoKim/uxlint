/**
 * Browser Automation Service
 * Manages browser navigation and page capture via Playwright MCP
 *
 * @packageDocumentation
 */

import type {McpClient} from '../mcp/client/mcp-client.js';
import {PlaywrightClient} from '../mcp/client/playwright-client.js';
import {ToolInvocationError} from '../mcp/client/errors.js';

/**
 * Page capture result from browser automation
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
 * Browser Automation Service
 * Handles browser navigation and snapshot capture
 */
export class BrowserAutomation {
	private readonly playwrightClient: PlaywrightClient;

	/**
	 * Create browser automation service
	 *
	 * @param mcpClient - Connected MCP client for browser control
	 */
	constructor(mcpClient: McpClient) {
		this.playwrightClient = new PlaywrightClient(mcpClient);
	}

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
	 * Close browser and cleanup resources
	 */
	async close(): Promise<void> {
		try {
			await this.playwrightClient.close();
		} catch (error) {
			console.error('Error closing Playwright client:', error);
		}
	}
}
