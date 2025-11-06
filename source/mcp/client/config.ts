/**
 * Configuration helpers for MCP client
 * @packageDocumentation
 */

import process from 'node:process';
import {ConfigurationError} from '../../models/errors.js';
import type {McpConfig} from './types.js';

/**
 * Allowed server commands to prevent command injection attacks
 * Only these commands can be used as MCP_SERVER_COMMAND
 */
const allowedServerCommands = new Set([
	'npx',
	'node',
	'python',
	'python3',
	'deno',
	'bun',
]);

/**
 * Validate server command to prevent command injection
 *
 * @param command - Server command to validate
 * @throws {ConfigurationError} If command is not in allowlist
 */
function validateServerCommand(command: string): void {
	if (!allowedServerCommands.has(command)) {
		throw new ConfigurationError(
			`Invalid MCP_SERVER_COMMAND: "${command}". Allowed commands: ${[
				...allowedServerCommands,
			].join(', ')}`,
		);
	}
}

/**
 * Get default MCP configuration
 *
 * @returns Default configuration for Playwright MCP server
 *
 * @example
 * ```typescript
 * const config = getDefaultMcpConfig();
 * // Returns: { serverCommand: 'npx', serverArgs: ['-y', '@modelcontextprotocol/server-playwright'], ... }
 * ```
 */
export function getDefaultMcpConfig(): McpConfig {
	return {
		serverCommand: 'npx',
		serverArgs: ['-y', '@modelcontextprotocol/server-playwright'],
		browser: 'chrome',
		headless: true,
		timeout: 30_000, // 30 seconds
	};
}

/**
 * Get MCP configuration from environment variables
 *
 * Reads configuration from the following environment variables:
 * - `MCP_SERVER_COMMAND`: Server command (default: 'npx') - must be in allowlist
 * - `MCP_SERVER_ARGS`: Server arguments (default: '-y,@modelcontextprotocol/server-playwright')
 * - `MCP_BROWSER`: Browser type ('chrome' | 'firefox' | 'webkit' | 'msedge')
 * - `MCP_HEADLESS`: Run headless (default: true, set to 'false' to disable)
 * - `MCP_TIMEOUT`: Operation timeout in milliseconds (default: 30000)
 *
 * @returns Configuration merged with defaults
 * @throws {ConfigurationError} If MCP_SERVER_COMMAND is not in allowlist
 *
 * @example
 * ```typescript
 * // Set environment variables
 * process.env.MCP_SERVER_ARGS = '-y,@modelcontextprotocol/server-playwright@0.12.6';
 * process.env.MCP_BROWSER = 'firefox';
 * process.env.MCP_HEADLESS = 'false';
 *
 * const config = getMcpConfigFromEnv();
 * // Returns config with custom args, Firefox browser and headless: false
 * ```
 */
export function getMcpConfigFromEnv(): McpConfig {
	const defaultConfig = getDefaultMcpConfig();

	// Validate and get server command
	const serverCommand =
		process.env['MCP_SERVER_COMMAND'] ?? defaultConfig.serverCommand;
	validateServerCommand(serverCommand);

	// Parse server arguments from environment variable (comma-separated)
	const serverArgs = process.env['MCP_SERVER_ARGS']
		? process.env['MCP_SERVER_ARGS'].split(',').map(arg => arg.trim())
		: defaultConfig.serverArgs;

	// Get browser configuration
	const browser =
		(process.env['MCP_BROWSER'] as McpConfig['browser']) ??
		defaultConfig.browser;
	const headless = process.env['MCP_HEADLESS'] !== 'false';
	const timeout = Number.parseInt(
		process.env['MCP_TIMEOUT'] ?? String(defaultConfig.timeout),
		10,
	);

	// Add browser flags to server arguments if not already present
	const hasBrowserFlag = serverArgs.includes('--browser');
	let finalServerArgs: string[];
	if (hasBrowserFlag) {
		finalServerArgs = serverArgs;
	} else {
		finalServerArgs = [
			...serverArgs,
			'--browser',
			browser,
			...(headless ? ['--headless'] : []),
		];
	}

	return {
		serverCommand,
		serverArgs: finalServerArgs,
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
