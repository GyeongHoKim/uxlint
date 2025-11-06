/**
 * Type definitions for MCP client configuration
 * @packageDocumentation
 */

/**
 * Supported browser types
 */
export type BrowserType = 'chrome' | 'firefox' | 'webkit' | 'msedge';

/**
 * Configuration for MCP client behavior
 */
export type McpConfig = {
	/** Server executable command (e.g., 'npx') */
	serverCommand: string;

	/** Server launch arguments */
	serverArgs: string[];

	/** Browser type to use */
	browser: BrowserType;

	/** Run browser in headless mode */
	headless: boolean;

	/** Tool invocation timeout in milliseconds */
	timeout: number;
};
