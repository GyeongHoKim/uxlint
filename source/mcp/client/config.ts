/**
 * Configuration helpers for MCP client
 * @packageDocumentation
 */

import process from 'node:process';
import type {McpConfig} from './types.js';

/**
 * Get default MCP configuration
 *
 * @returns Default configuration for Playwright MCP server
 *
 * @example
 * ```typescript
 * const config = getDefaultMcpConfig();
 * // Returns: { serverCommand: 'npx', serverArgs: ['@playwright/mcp@latest'], ... }
 * ```
 */
export function getDefaultMcpConfig(): McpConfig {
	return {
		serverCommand: 'npx',
		serverArgs: ['@playwright/mcp@latest'],
		browser: 'chrome',
		headless: true,
		timeout: 30_000, // 30 seconds
	};
}

/**
 * Get MCP configuration from environment variables
 *
 * Reads configuration from the following environment variables:
 * - `MCP_SERVER_COMMAND`: Server command (default: 'npx')
 * - `MCP_BROWSER`: Browser type ('chrome' | 'firefox' | 'webkit' | 'msedge')
 * - `MCP_HEADLESS`: Run headless (default: true, set to 'false' to disable)
 * - `MCP_TIMEOUT`: Operation timeout in milliseconds (default: 30000)
 *
 * @returns Configuration merged with defaults
 *
 * @example
 * ```typescript
 * // Set environment variables
 * process.env.MCP_BROWSER = 'firefox';
 * process.env.MCP_HEADLESS = 'false';
 *
 * const config = getMcpConfigFromEnv();
 * // Returns config with Firefox browser and headless: false
 * ```
 */
export function getMcpConfigFromEnv(): McpConfig {
	const defaultConfig = getDefaultMcpConfig();

	const browser =
		(process.env['MCP_BROWSER'] as McpConfig['browser']) ??
		defaultConfig.browser;
	const headless = process.env['MCP_HEADLESS'] !== 'false';
	const timeout = Number.parseInt(
		process.env['MCP_TIMEOUT'] ?? String(defaultConfig.timeout),
		10,
	);

	return {
		serverCommand:
			process.env['MCP_SERVER_COMMAND'] ?? defaultConfig.serverCommand,
		serverArgs: [
			...defaultConfig.serverArgs,
			'--browser',
			browser,
			...(headless ? ['--headless'] : []),
		],
		browser,
		headless,
		timeout,
	};
}

/**
 * Merge partial configuration with defaults
 *
 * @param partial - Partial configuration to override defaults
 * @returns Complete configuration with defaults applied to missing fields
 *
 * @example
 * ```typescript
 * const config = mergeMcpConfig({
 *   browser: 'firefox',
 *   timeout: 60000
 * });
 * // Returns: { serverCommand: 'npx', serverArgs: [...], browser: 'firefox', timeout: 60000, headless: true }
 * ```
 */
export function mergeMcpConfig(partial: Partial<McpConfig>): McpConfig {
	const defaultConfig = getDefaultMcpConfig();

	return {
		serverCommand: partial.serverCommand ?? defaultConfig.serverCommand,
		serverArgs: partial.serverArgs ?? defaultConfig.serverArgs,
		browser: partial.browser ?? defaultConfig.browser,
		headless: partial.headless ?? defaultConfig.headless,
		timeout: partial.timeout ?? defaultConfig.timeout,
	};
}
