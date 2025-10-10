/**
 * Configuration File Loader
 * Pure functions for discovering, reading, parsing, and validating UxLintConfig files
 */

import {existsSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import process from 'node:process';
import {load as parseYaml} from 'js-yaml';
import type {UxLintConfig} from './config.js';
import {ConfigurationError} from './errors.js';

// Configuration file names in order of precedence
const configFiles = ['.uxlintrc.json', '.uxlintrc.yaml'] as const;

// Maximum file size in bytes (10MB)
const maxFileSize = 10 * 1024 * 1024;

/**
 * Find configuration file in the given directory
 * @param baseDirectory - Directory to search for config files
 * @returns Path to config file or undefined if not found
 */
export function findConfigFile(baseDirectory: string): string | undefined {
	for (const configFile of configFiles) {
		const configPath = join(baseDirectory, configFile);
		if (existsSync(configPath)) {
			return configPath;
		}
	}

	return undefined;
}

/**
 * Read configuration file content
 * @param filePath - Path to the config file
 * @returns File content as string
 * @throws ConfigurationError if file cannot be read or exceeds size limit
 */
export function readConfigFile(filePath: string): string {
	try {
		// Check file size before reading
		const stats = statSync(filePath);
		if (stats.size > maxFileSize) {
			throw new ConfigurationError(
				`Configuration file is too large (${stats.size} bytes, maximum ${maxFileSize} bytes)`,
				filePath,
			);
		}

		// Read file content
		return readFileSync(filePath, 'utf8');
	} catch (error) {
		// If it's already a ConfigurationError, re-throw it
		if (error instanceof ConfigurationError) {
			throw error;
		}

		// Otherwise, wrap in ConfigurationError
		throw new ConfigurationError(
			`Cannot read configuration file: ${
				error instanceof Error ? error.message : String(error)
			}`,
			filePath,
		);
	}
}

/**
 * Parse configuration file content
 * @param content - File content to parse
 * @param format - File format (json or yaml)
 * @returns Parsed configuration object
 * @throws ConfigurationError if parsing fails
 */
export function parseConfigFile(
	content: string,
	format: 'json' | 'yaml',
): unknown {
	try {
		if (format === 'json') {
			return JSON.parse(content);
		}

		// Parse YAML
		return parseYaml(content);
	} catch (error) {
		const formatName = format.toUpperCase();
		throw new ConfigurationError(
			`Invalid ${formatName} syntax: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

/**
 * Validate a single page object
 * @param page - Page object to validate
 * @param index - Index of the page in the pages array
 * @param filePath - Path to config file (for error messages)
 * @throws ConfigurationError if validation fails
 */
function validatePage(page: unknown, index: number, filePath: string): void {
	if (!page || typeof page !== 'object') {
		throw new ConfigurationError(
			`pages[${index}] must be an object`,
			filePath,
			'pages',
		);
	}

	const pageObject = page as Record<string, unknown>;
	if (!pageObject['url'] || typeof pageObject['url'] !== 'string') {
		throw new ConfigurationError(
			`pages[${index}].url is required and must be a string`,
			filePath,
			'pages',
		);
	}

	if (!pageObject['features'] || typeof pageObject['features'] !== 'string') {
		throw new ConfigurationError(
			`pages[${index}].features is required and must be a string`,
			filePath,
			'pages',
		);
	}
}

/**
 * Validate parsed configuration
 * @param data - Parsed configuration data
 * @param filePath - Path to config file (for error messages)
 * @returns Validated UxLintConfig
 * @throws ConfigurationError if validation fails
 */
export function validateConfig(data: unknown, filePath: string): UxLintConfig {
	// Check if data is an object
	if (!data || typeof data !== 'object') {
		throw new ConfigurationError('Configuration must be an object', filePath);
	}

	const config = data as Record<string, unknown>;

	// Validate mainPageUrl
	if (!config['mainPageUrl'] || typeof config['mainPageUrl'] !== 'string') {
		throw new ConfigurationError(
			'mainPageUrl is required and must be a string',
			filePath,
			'mainPageUrl',
		);
	}

	// Validate subPageUrls
	if (!Array.isArray(config['subPageUrls'])) {
		throw new ConfigurationError(
			'subPageUrls is required and must be an array',
			filePath,
			'subPageUrls',
		);
	}

	// Validate pages
	if (!Array.isArray(config['pages']) || config['pages'].length === 0) {
		throw new ConfigurationError(
			'pages must be an array with at least one page',
			filePath,
			'pages',
		);
	}

	// Validate each page
	for (const [index, page] of (config['pages'] as unknown[]).entries()) {
		validatePage(page, index, filePath);
	}

	// Validate personas
	if (!Array.isArray(config['personas']) || config['personas'].length === 0) {
		throw new ConfigurationError(
			'personas must be an array with at least one persona',
			filePath,
			'personas',
		);
	}

	// Validate report
	if (!config['report'] || typeof config['report'] !== 'object') {
		throw new ConfigurationError(
			'report is required and must be an object',
			filePath,
			'report',
		);
	}

	const report = config['report'] as Record<string, unknown>;
	if (!report['output'] || typeof report['output'] !== 'string') {
		throw new ConfigurationError(
			'report.output is required and must be a string',
			filePath,
			'report',
		);
	}

	// Return the validated config (TypeScript now knows it's valid)
	return config as UxLintConfig;
}

/**
 * Load and validate configuration from directory
 * @param baseDirectory - Directory to search for config (defaults to cwd)
 * @returns Validated UxLintConfig
 * @throws ConfigurationError if config not found or invalid
 */
export function loadConfig(
	baseDirectory: string = process.cwd(),
): UxLintConfig {
	// Find config file
	const configPath = findConfigFile(baseDirectory);
	if (!configPath) {
		throw new ConfigurationError(
			`Configuration file not found in ${baseDirectory}. Expected .uxlintrc.json or .uxlintrc.yaml`,
			baseDirectory,
		);
	}

	// Determine format from file extension
	const format = configPath.endsWith('.json') ? 'json' : 'yaml';

	// Read, parse, and validate
	const content = readConfigFile(configPath);
	const parsed = parseConfigFile(content, format);
	return validateConfig(parsed, configPath);
}
