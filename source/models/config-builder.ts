/**
 * Config Builder
 * Transform wizard data to UxLintConfig format
 */

import type {ConfigurationData} from './wizard-state.js';
import type {UxLintConfig} from './config.js';

/**
 * Transform ConfigurationData to UxLintConfig
 *
 * @param data - Wizard configuration data
 * @returns UxLintConfig ready to be serialized or used
 *
 * @example
 * const config = buildConfig(wizardData);
 * // config is a valid UxLintConfig
 */
export function buildConfig(data: ConfigurationData): UxLintConfig {
	return {
		mainPageUrl: data.mainPageUrl,
		subPageUrls: [...data.subPageUrls],
		pages: [...data.pages],
		personas: [...data.personas],
		report: {
			output: data.reportOutput,
		},
	};
}

/**
 * Validate that configuration is complete and ready to build
 *
 * @param data - Configuration data to validate
 * @returns True if configuration can be safely converted to UxLintConfig
 */
export function canBuildConfig(
	data: ConfigurationData | undefined,
): data is ConfigurationData {
	return (
		data !== undefined &&
		typeof data.mainPageUrl === 'string' &&
		data.mainPageUrl.length > 0 &&
		Array.isArray(data.subPageUrls) &&
		Array.isArray(data.pages) &&
		data.pages.length > 0 &&
		Array.isArray(data.personas) &&
		data.personas.length > 0 &&
		typeof data.reportOutput === 'string' &&
		data.reportOutput.length > 0
	);
}
