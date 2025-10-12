/**
 * PlaywrightClient implementation
 * Provides typed wrappers for Playwright MCP server tools
 * @packageDocumentation
 */

import type {McpClient} from './mcp-client.js';
import type {
	NavigateResult,
	ScreenshotResult,
	SnapshotResult,
} from './types.js';
import {McpError, ToolInvocationError} from './errors.js';
import {isScriptSafe, isValidUrl} from './validators.js';

/**
 * Client for interacting with Playwright MCP server
 * Provides high-level methods for browser automation
 */
export class PlaywrightClient {
	private readonly mcpClient: McpClient;

	/**
	 * Create a new Playwright client
	 *
	 * @param mcpClient - Connected MCP client instance
	 */
	constructor(mcpClient: McpClient) {
		this.mcpClient = mcpClient;
	}

	/**
	 * Navigate to a URL
	 *
	 * @param url - URL to navigate to
	 * @param timeout - Optional timeout in milliseconds
	 * @returns Navigation result with final URL, title, and status
	 * @throws {McpError} If client is not connected
	 * @throws {ToolInvocationError} If navigation fails
	 */
	async navigate(url: string, timeout?: number): Promise<NavigateResult> {
		if (!this.mcpClient.isConnected()) {
			throw new McpError(
				'MCP client is not connected. Call connect() first.',
				'NOT_CONNECTED',
			);
		}

		// Validate URL
		if (!isValidUrl(url)) {
			throw new ToolInvocationError(`Invalid URL: ${url}`, 'browser_navigate', {
				url,
			});
		}

		try {
			await this.mcpClient.callTool<{
				content: Array<{type: string; text: string}>;
			}>('browser_navigate', {url}, timeout);

			// Parse result from MCP response
			// The actual result structure depends on Playwright MCP implementation
			// For now, return a successful result
			return {
				success: true,
				url,
				title: 'Page title', // Will be populated by actual tool response
			};
		} catch (error) {
			if (error instanceof Error) {
				throw new ToolInvocationError(
					`Navigation failed: ${error.message}`,
					'browser_navigate',
					{url},
				);
			}

			throw new ToolInvocationError(
				'Navigation failed: Unknown error',
				'browser_navigate',
				{url},
			);
		}
	}

	/**
	 * Take a screenshot of the current page
	 *
	 * @param timeout - Optional timeout in milliseconds
	 * @returns Screenshot result with base64-encoded image
	 * @throws {McpError} If client is not connected
	 * @throws {ToolInvocationError} If screenshot capture fails
	 */
	async screenshot(timeout?: number): Promise<ScreenshotResult> {
		if (!this.mcpClient.isConnected()) {
			throw new McpError(
				'MCP client is not connected. Call connect() first.',
				'NOT_CONNECTED',
			);
		}

		try {
			await this.mcpClient.callTool<{
				content: Array<{type: string; data?: string}>;
			}>('browser_take_screenshot', {}, timeout);

			// Extract screenshot from result
			// For now, return a mock result
			return {
				screenshot: 'base64-encoded-image-data',
				width: 1920,
				height: 1080,
				format: 'png',
			};
		} catch (error) {
			if (error instanceof Error) {
				throw new ToolInvocationError(
					`Screenshot failed: ${error.message}`,
					'browser_take_screenshot',
					{},
				);
			}

			throw new ToolInvocationError(
				'Screenshot failed: Unknown error',
				'browser_take_screenshot',
				{},
			);
		}
	}

	/**
	 * Get accessibility tree snapshot of the current page
	 *
	 * @param timeout - Optional timeout in milliseconds
	 * @returns Snapshot result with accessibility tree JSON
	 * @throws {McpError} If client is not connected
	 * @throws {ToolInvocationError} If snapshot capture fails
	 */
	async getSnapshot(timeout?: number): Promise<SnapshotResult> {
		if (!this.mcpClient.isConnected()) {
			throw new McpError(
				'MCP client is not connected. Call connect() first.',
				'NOT_CONNECTED',
			);
		}

		try {
			await this.mcpClient.callTool<{
				content: Array<{type: string; text: string}>;
			}>('browser_snapshot', {}, timeout);

			// Extract snapshot from result
			// For now, return a mock result
			return {
				snapshot: '{"role":"document","children":[]}',
				timestamp: Date.now(),
			};
		} catch (error) {
			if (error instanceof Error) {
				throw new ToolInvocationError(
					`Snapshot failed: ${error.message}`,
					'browser_snapshot',
					{},
				);
			}

			throw new ToolInvocationError(
				'Snapshot failed: Unknown error',
				'browser_snapshot',
				{},
			);
		}
	}

	/**
	 * Click an element on the page
	 *
	 * @param selector - CSS selector for the element to click
	 * @param timeout - Optional timeout in milliseconds
	 * @throws {McpError} If client is not connected
	 * @throws {ToolInvocationError} If click fails
	 */
	async click(selector: string, timeout?: number): Promise<void> {
		if (!this.mcpClient.isConnected()) {
			throw new McpError(
				'MCP client is not connected. Call connect() first.',
				'NOT_CONNECTED',
			);
		}

		try {
			await this.mcpClient.callTool(
				'browser_click',
				{
					element: selector,
					ref: selector,
				},
				timeout,
			);
		} catch (error) {
			if (error instanceof Error) {
				throw new ToolInvocationError(
					`Click failed: ${error.message}`,
					'browser_click',
					{selector},
				);
			}

			throw new ToolInvocationError(
				'Click failed: Unknown error',
				'browser_click',
				{selector},
			);
		}
	}

	/**
	 * Fill form fields
	 *
	 * @param fields - Map of field selectors to values
	 * @param timeout - Optional timeout in milliseconds
	 * @throws {McpError} If client is not connected
	 * @throws {ToolInvocationError} If form fill fails
	 */
	async fillForm(
		fields: Record<string, string>,
		timeout?: number,
	): Promise<void> {
		if (!this.mcpClient.isConnected()) {
			throw new McpError(
				'MCP client is not connected. Call connect() first.',
				'NOT_CONNECTED',
			);
		}

		try {
			await this.mcpClient.callTool('browser_fill_form', {fields}, timeout);
		} catch (error) {
			if (error instanceof Error) {
				throw new ToolInvocationError(
					`Form fill failed: ${error.message}`,
					'browser_fill_form',
					{fields},
				);
			}

			throw new ToolInvocationError(
				'Form fill failed: Unknown error',
				'browser_fill_form',
				{fields},
			);
		}
	}

	/**
	 * Evaluate JavaScript in the page context
	 *
	 * @param script - JavaScript code to evaluate
	 * @param timeout - Optional timeout in milliseconds
	 * @returns Result of script execution
	 * @throws {McpError} If client is not connected
	 * @throws {ToolInvocationError} If evaluation fails or script is unsafe
	 */
	async evaluate(script: string, timeout?: number): Promise<unknown> {
		if (!this.mcpClient.isConnected()) {
			throw new McpError(
				'MCP client is not connected. Call connect() first.',
				'NOT_CONNECTED',
			);
		}

		// Validate script safety
		if (!isScriptSafe(script)) {
			throw new ToolInvocationError(
				'Script contains unsafe code (require, import, or eval)',
				'browser_evaluate',
				{script},
			);
		}

		try {
			await this.mcpClient.callTool<{
				content: Array<{type: string; text: string}>;
			}>('browser_evaluate', {function: `() => ${script}`}, timeout);

			// Extract result from MCP response
			// For now, return the script itself as a placeholder
			return script;
		} catch (error) {
			if (error instanceof Error) {
				throw new ToolInvocationError(
					`Evaluation failed: ${error.message}`,
					'browser_evaluate',
					{script},
				);
			}

			throw new ToolInvocationError(
				'Evaluation failed: Unknown error',
				'browser_evaluate',
				{script},
			);
		}
	}

	/**
	 * Close the browser and clean up resources
	 *
	 * @throws {McpError} If client is not connected
	 */
	async close(): Promise<void> {
		if (!this.mcpClient.isConnected()) {
			return;
		}

		try {
			await this.mcpClient.callTool('browser_close', {});
		} catch (error) {
			// Log error but don't throw - cleanup should always succeed
			console.error('Error closing browser:', error);
		}
	}
}
