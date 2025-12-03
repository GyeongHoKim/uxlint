/**
 * Configuration File I/O
 * Class-based implementation with dependency injection for fs module
 */

import * as fs from 'node:fs';
import {join} from 'node:path';
import process from 'node:process';
import {load as parseYaml, dump as yamlDump} from 'js-yaml';
import type {UxLintConfig} from '../../models/config.js';
import {ConfigurationError} from '../../models/errors.js';
import type {SaveOptions} from '../../models/wizard-state.js';

type FsSyncMethods = Pick<
	typeof fs,
	'existsSync' | 'statSync' | 'readFileSync'
>;
type FsAsyncMethods = typeof fs.promises;

/**
 * Result of saving configuration
 */
export type SaveResult = {
	readonly success: boolean;
	readonly filePath?: string;
	readonly fileSize?: number;
	readonly error?: string;
};

/**
 * Configuration I/O handler with injectable fs dependency
 */
export class ConfigIO {
	// Configuration file names in order of precedence
	private static readonly configFiles = [
		'.uxlintrc.json',
		'.uxlintrc.yaml',
		'.uxlintrc.yml',
	] as const;

	// Maximum file size in bytes (10MB)
	private static readonly maxFileSize = 10 * 1024 * 1024;

	constructor(
		private readonly fsSync: FsSyncMethods = fs,
		private readonly fsAsync: FsAsyncMethods = fs.promises,
	) {}

	/**
	 * Find configuration file in the given directory
	 * @param baseDirectory - Directory to search for config files
	 * @returns Path to config file or undefined if not found
	 */
	findConfigFile(baseDirectory: string): string | undefined {
		const {existsSync} = this.fsSync;

		for (const configFile of ConfigIO.configFiles) {
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
	readConfigFile(filePath: string): string {
		const {statSync, readFileSync} = this.fsSync;

		try {
			// Check file size before reading
			const stats = statSync(filePath);
			if (stats.size > ConfigIO.maxFileSize) {
				throw new ConfigurationError(
					`Configuration file is too large (${stats.size} bytes, maximum ${ConfigIO.maxFileSize} bytes)`,
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
	parseConfigFile(content: string, format: 'json' | 'yaml' | 'yml'): unknown {
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
	 * Serialize UxLintConfig to YAML format
	 *
	 * @param config - Configuration to serialize
	 * @returns YAML string representation
	 *
	 * @example
	 * const yaml = configIO.serializeToYaml(config);
	 * // yaml is a formatted YAML string
	 */
	serializeToYaml(config: UxLintConfig): string {
		return yamlDump(config, {
			indent: 2,
			lineWidth: 80,
			noRefs: true,
			sortKeys: false,
		});
	}

	/**
	 * Serialize UxLintConfig to JSON format
	 *
	 * @param config - Configuration to serialize
	 * @returns JSON string representation (formatted with 2-space indentation)
	 *
	 * @example
	 * const json = configIO.serializeToJson(config);
	 * // json is a formatted JSON string with 2-space indentation
	 */
	serializeToJson(config: UxLintConfig): string {
		return JSON.stringify(config, null, 2);
	}

	/**
	 * Validate parsed configuration
	 * @param data - Parsed configuration data
	 * @param filePath - Path to config file (for error messages)
	 * @returns Validated UxLintConfig
	 * @throws ConfigurationError if validation fails
	 */
	validateConfig(data: unknown, filePath: string): UxLintConfig {
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
			this.validatePage(page, index, filePath);
		}

		// Validate persona
		if (!config['persona'] || typeof config['persona'] !== 'string') {
			throw new ConfigurationError(
				'persona is required and must be a string',
				filePath,
				'persona',
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
	loadConfig(baseDirectory: string = process.cwd()): UxLintConfig {
		// Find config file
		const configPath = this.findConfigFile(baseDirectory);
		if (!configPath) {
			throw new ConfigurationError(
				`Configuration file not found in ${baseDirectory}. Expected .uxlintrc.json or .uxlintrc.yaml`,
				baseDirectory,
			);
		}

		// Determine format from file extension
		const format = configPath.endsWith('.json') ? 'json' : 'yaml';

		// Read, parse, and validate
		const content = this.readConfigFile(configPath);
		const parsed = this.parseConfigFile(content, format);
		return this.validateConfig(parsed, configPath);
	}

	/**
	 * Determine file path for saving config
	 *
	 * @param saveOptions - User's save options
	 * @returns File path where config should be saved
	 *
	 * @example
	 * const path = configIO.determineFilePath({ shouldSave: true, format: 'yaml' });
	 * // path is '.uxlintrc.yaml'
	 */
	determineFilePath(saveOptions: SaveOptions): string {
		if (saveOptions.filePath) {
			return saveOptions.filePath;
		}

		// Default file name based on format
		const extension = saveOptions.format === 'json' ? 'json' : 'yaml';
		return `.uxlintrc.${extension}`;
	}

	/**
	 * Save configuration to file system
	 *
	 * @param config - Configuration to save
	 * @param saveOptions - Options specifying format and path
	 * @returns Promise that resolves to saved file path
	 * @throws Error if file cannot be written
	 *
	 * @example
	 * const filePath = await configIO.saveConfigToFile(config, {
	 *   shouldSave: true,
	 *   format: 'yaml',
	 *   filePath: '.uxlintrc.yaml'
	 * });
	 * // filePath is the path to saved file
	 */
	async saveConfigToFile(
		config: UxLintConfig,
		saveOptions: SaveOptions,
	): Promise<string> {
		if (!saveOptions.shouldSave) {
			throw new Error('Cannot save config when shouldSave is false');
		}

		const format = saveOptions.format ?? 'yaml';
		const filePath = this.determineFilePath({...saveOptions, format});

		// Serialize based on format
		const content =
			format === 'json'
				? this.serializeToJson(config)
				: this.serializeToYaml(config);

		// Write to file
		await this.fsAsync.writeFile(filePath, content, 'utf8');

		return filePath;
	}

	/**
	 * Format file size for display
	 *
	 * @param bytes - Size in bytes
	 * @returns Formatted string (e.g., "1.5 KB")
	 */
	formatFileSize(bytes: number): string {
		if (bytes < 1024) {
			return `${bytes} B`;
		}

		const kb = bytes / 1024;
		if (kb < 1024) {
			return `${kb.toFixed(1)} KB`;
		}

		const mb = kb / 1024;
		return `${mb.toFixed(1)} MB`;
	}

	/**
	 * Safe wrapper for saving configuration with error handling
	 *
	 * @param config - Configuration to save
	 * @param saveOptions - Save options
	 * @returns SaveResult with success status and details
	 */
	async trySaveConfig(
		config: UxLintConfig,
		saveOptions: SaveOptions,
	): Promise<SaveResult> {
		const {statSync} = this.fsSync;

		try {
			if (!saveOptions.shouldSave) {
				return {
					success: false,
					error: 'Save was not requested',
				};
			}

			const filePath = await this.saveConfigToFile(config, saveOptions);

			// Get file size
			const stats = statSync(filePath);
			const fileSize = stats.size;

			return {
				success: true,
				filePath,
				fileSize,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Get default report output path
	 *
	 * @returns Default report output path
	 */
	getDefaultReportPath(): string {
		return './ux-report.md';
	}

	/**
	 * Validate a single page object
	 * @param page - Page object to validate
	 * @param index - Index of the page in the pages array
	 * @param filePath - Path to config file (for error messages)
	 * @throws ConfigurationError if validation fails
	 */
	private validatePage(page: unknown, index: number, filePath: string): void {
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
}

/**
 * Default singleton instance
 */
export const configIO = new ConfigIO();
