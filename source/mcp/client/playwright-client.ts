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
	McpToolResponse,
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
			const result = await this.mcpClient.callTool<McpToolResponse>(
				'browser_navigate',
				{url},
				timeout,
			);

			// Parse result from MCP response
			// Playwright MCP returns text content with navigation info
			const textContent = result.content?.find(c => c.type === 'text');
			let parsedData: Record<string, unknown> = {};

			if (textContent?.text) {
				try {
					parsedData = JSON.parse(textContent.text) as Record<string, unknown>;
				} catch {
					// If parsing fails, treat as plain text response
					parsedData = {message: textContent.text};
				}
			}

			return {
				success: !result.isError,
				url: (parsedData['url'] as string) ?? url,
				title: parsedData['title'] as string | undefined,
				status: parsedData['status'] as number | undefined,
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

		// Extract options - handle number (timeout) or object
		const isNumberOption = typeof options === 'number';
		const timeoutOption = isNumberOption ? {timeout: options} : undefined;
		const objectOption = isNumberOption ? undefined : options;
		const screenshotOptions: ScreenshotOptions =
			timeoutOption ?? objectOption ?? {};

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

			const result = await this.mcpClient.callTool<McpToolResponse>(
				'browser_take_screenshot',
				toolArgs,
				screenshotOptions.timeout,
			);

			// Extract screenshot from result
			// Playwright MCP returns image content with base64 data
			const imageContent = result.content?.find(c => c.type === 'image');

			if (!imageContent?.data) {
				throw new ToolInvocationError(
					'Screenshot response did not contain image data',
					'browser_take_screenshot',
					toolArgs,
				);
			}

			return {
				screenshot: imageContent.data,
				width: 0, // Width/height not provided by Playwright MCP
				height: 0,
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
			const result = await this.mcpClient.callTool<McpToolResponse>(
				'browser_snapshot',
				{},
				timeout,
			);

			// Extract snapshot from result
			// Playwright MCP returns text content with accessibility tree JSON
			const textContent = result.content?.find(c => c.type === 'text');

			if (!textContent?.text) {
				throw new ToolInvocationError(
					'Snapshot response did not contain text data',
					'browser_snapshot',
					{},
				);
			}

			return {
				snapshot: textContent.text,
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
			// Wrap script in a function that returns the result
			// Format: () => { return <script>; } or () => (<script>)
			const wrappedScript = script.trim().endsWith(';')
				? `() => { ${script} }`
				: `() => (${script})`;

			const result = await this.mcpClient.callTool<McpToolResponse>(
				'browser_evaluate',
				{function: wrappedScript},
				timeout,
			);

			// Extract result from MCP response
			// Playwright MCP returns text content with evaluation result
			const textContent = result.content?.find(c => c.type === 'text');

			if (!textContent?.text) {
				// Return undefined if no result
				return undefined;
			}

			// Try to parse as JSON if possible
			try {
				return JSON.parse(textContent.text) as unknown;
			} catch {
				// Return as string if not valid JSON
				return textContent.text;
			}
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
