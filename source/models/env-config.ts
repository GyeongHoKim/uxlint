/**
 * Environment Configuration
 * Loads and validates environment variables for AI service
 *
 * @packageDocumentation
 */

import process from 'node:process';
// eslint-disable-next-line import-x/no-unassigned-import
import 'dotenv/config';

/**
 * Environment configuration for AI service
 */
export type EnvConfig = {
	/**
	 * Anthropic API key (from UXLINT_ANTHROPIC_API_KEY env var)
	 */
	apiKey: string;

	/**
	 * AI model name (from UXLINT_AI_MODEL env var)
	 * Defaults to 'claude-3-5-sonnet-20241022' if not specified
	 */
	model: string;
};

/**
 * Default AI model to use if not specified in environment
 */
const defaultModel = 'claude-3-5-sonnet-20241022';

/**
 * Load and validate environment configuration
 *
 * @returns Validated environment configuration
 * @throws {Error} If UXLINT_ANTHROPIC_API_KEY is not set
 *
 * @example
 * ```typescript
 * try {
 *   const config = loadEnvConfig();
 *   console.log('Using model:', config.model);
 * } catch (error) {
 *   console.error('Missing API key:', error.message);
 *   process.exit(1);
 * }
 * ```
 */
export function loadEnvConfig(): EnvConfig {
	const apiKey = process.env['UXLINT_ANTHROPIC_API_KEY'];

	if (!apiKey) {
		throw new Error(
			'UXLINT_ANTHROPIC_API_KEY environment variable is required. ' +
				'Please set it in your .env file or environment.',
		);
	}

	const model = process.env['UXLINT_AI_MODEL'] ?? defaultModel;

	return {
		apiKey,
		model,
	};
}
