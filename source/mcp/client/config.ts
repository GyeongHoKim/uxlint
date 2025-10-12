/**
 * Configuration helpers for MCP client
 * @packageDocumentation
 */

import process from 'node:process';
import type {McpConfig} from './types.js';

/**
 * Get default MCP configuration
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
