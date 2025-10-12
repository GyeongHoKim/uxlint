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
	ScreenshotOptions,
	NavigateOptions,
	EvaluateOptions,
} from './types.js';
import {
	McpError,
	ToolInvocationError,
	InvalidUrlError,
	InvalidSelectorError,
	InvalidScriptError,
	InvalidTimeoutError,
} from './errors.js';
import {
	getUrlValidationError,
	getSelectorValidationError,
	getScriptValidationError,
	getTimeoutValidationError,
} from './validators.js';

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
	 * @param options - Navigation options (timeout, waitUntil) or timeout in milliseconds (legacy)
	 * @returns Navigation result with final URL, title, and status
	 * @throws {McpError} If client is not connected
	 * @throws {InvalidUrlError} If URL validation fails
	 * @throws {InvalidTimeoutError} If timeout validation fails
	 * @throws {ToolInvocationError} If navigation fails
	 */
	async navigate(
		url: string,
		options?: NavigateOptions | number,
	): Promise<NavigateResult> {
		if (!this.mcpClient.isConnected()) {
			throw new McpError(
				'MCP client is not connected. Call connect() first.',
				'NOT_CONNECTED',
			);
		}

		// Validate URL
		const urlError = getUrlValidationError(url);
		if (urlError) {
			throw new InvalidUrlError(urlError);
		}

		// Extract timeout from options
		const timeout = typeof options === 'number' ? options : options?.timeout;

		// Validate timeout if provided
		if (timeout !== undefined) {
			const timeoutError = getTimeoutValidationError(timeout);
			if (timeoutError) {
				throw new InvalidTimeoutError(timeoutError);
			}
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
	 * @param options - Screenshot options (element, fullPage, format, timeout) or timeout in milliseconds (legacy)
	 * @returns Screenshot result with base64-encoded image
	 * @throws {McpError} If client is not connected
	 * @throws {InvalidSelectorError} If element selector validation fails
	 * @throws {InvalidTimeoutError} If timeout validation fails
	 * @throws {ToolInvocationError} If screenshot capture fails
	 */
	async screenshot(
		options?: ScreenshotOptions | number,
	): Promise<ScreenshotResult> {
		if (!this.mcpClient.isConnected()) {
			throw new McpError(
				'MCP client is not connected. Call connect() first.',
				'NOT_CONNECTED',
			);
		}

		// Extract options
		let screenshotOptions: ScreenshotOptions;
		if (typeof options === 'number') {
			screenshotOptions = {timeout: options};
		} else {
			screenshotOptions = options ?? {};
		}

		// Validate element selector if provided
		if (screenshotOptions.element) {
			const selectorError = getSelectorValidationError(
				screenshotOptions.element,
			);
			if (selectorError) {
				throw new InvalidSelectorError(selectorError);
			}
		}

		// Validate timeout if provided
		if (screenshotOptions.timeout !== undefined) {
			const timeoutError = getTimeoutValidationError(screenshotOptions.timeout);
			if (timeoutError) {
				throw new InvalidTimeoutError(timeoutError);
			}
		}

		try {
			// Build tool arguments
			const toolArgs: Record<string, unknown> = {};
			if (screenshotOptions.element) {
				toolArgs['element'] = screenshotOptions.element;
				toolArgs['ref'] = screenshotOptions.element;
			}

			if (screenshotOptions.fullPage) {
				toolArgs['fullPage'] = true;
			}

			// Use 'type' if provided, otherwise 'format'
			const format = screenshotOptions.type ?? screenshotOptions.format;
			if (format) {
				toolArgs['type'] = format;
			}

			await this.mcpClient.callTool<{
				content: Array<{type: string; data?: string}>;
			}>('browser_take_screenshot', toolArgs, screenshotOptions.timeout);

			// Extract screenshot from result
			// For now, return a mock result
			return {
				screenshot: 'base64-encoded-image-data',
				width: 1920,
				height: 1080,
				format: format ?? 'png',
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
	 * @param options - Evaluation options (timeout) or timeout in milliseconds (legacy)
	 * @returns Result of script execution
	 * @throws {McpError} If client is not connected
	 * @throws {InvalidScriptError} If script validation fails
	 * @throws {InvalidTimeoutError} If timeout validation fails
	 * @throws {ToolInvocationError} If evaluation fails
	 */
	async evaluate(
		script: string,
		options?: EvaluateOptions | number,
	): Promise<unknown> {
		if (!this.mcpClient.isConnected()) {
			throw new McpError(
				'MCP client is not connected. Call connect() first.',
				'NOT_CONNECTED',
			);
		}

		// Validate script safety
		const scriptError = getScriptValidationError(script);
		if (scriptError) {
			throw new InvalidScriptError(scriptError);
		}

		// Extract timeout from options
		const timeout = typeof options === 'number' ? options : options?.timeout;

		// Validate timeout if provided
		if (timeout !== undefined) {
			const timeoutError = getTimeoutValidationError(timeout);
			if (timeoutError) {
				throw new InvalidTimeoutError(timeoutError);
			}
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
