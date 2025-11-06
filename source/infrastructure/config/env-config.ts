/**
 * Environment Configuration
 * Loads and validates environment variables for AI service
 *
 * @packageDocumentation
 */

import process from 'node:process';
// Side-effect import required: dotenv/config loads .env file into process.env at module initialization
// This import MUST execute its side effects before loadEnvConfig() reads from process.env
// eslint-disable-next-line import-x/no-unassigned-import -- Required side-effect import for .env file loading
import 'dotenv/config';

/**
 * Supported AI provider types
 */
export type ProviderType = 'anthropic' | 'openai' | 'ollama';

/**
 * Anthropic provider configuration
 */
export type AnthropicConfig = {
	/**
	 * Provider type
	 */
	provider: 'anthropic';

	/**
	 * AI model name (from UXLINT_AI_MODEL env var)
	 * Defaults to 'claude-sonnet-4-5-20250929' if not specified
	 */
	model: string;

	/**
	 * Anthropic API key (from UXLINT_ANTHROPIC_API_KEY env var)
	 */
	apiKey: string;
};

/**
 * OpenAI provider configuration
 */
export type OpenAiConfig = {
	/**
	 * Provider type
	 */
	provider: 'openai';

	/**
	 * AI model name (from UXLINT_AI_MODEL env var)
	 * Defaults to 'gpt-4o' if not specified
	 */
	model: string;

	/**
	 * OpenAI API key (from UXLINT_OPENAI_API_KEY env var)
	 */
	apiKey: string;
};

/**
 * Ollama provider configuration
 */
export type OllamaConfig = {
	/**
	 * Provider type
	 */
	provider: 'ollama';

	/**
	 * AI model name (from UXLINT_AI_MODEL env var)
	 * Defaults to 'llama3.1' if not specified
	 */
	model: string;

	/**
	 * Ollama server base URL (from UXLINT_OLLAMA_BASE_URL env var)
	 * Defaults to 'http://localhost:11434' if not specified
	 */
	baseUrl: string;
};

/**
 * Environment configuration for AI service (discriminated union)
 */
export type EnvConfig = AnthropicConfig | OpenAiConfig | OllamaConfig;

/**
 * Default AI models per provider
 */
const defaultModels: Record<ProviderType, string> = {
	anthropic: 'claude-sonnet-4-5-20250929',
	openai: 'gpt-4o',
	ollama: 'llama3.1',
};

/**
 * Load and validate environment configuration
 *
 * @returns Validated environment configuration
 * @throws {Error} If required API key or configuration is missing for the selected provider
 *
 * @example
 * ```typescript
 * try {
 *   const config = loadEnvConfig();
 *   console.log('Using provider:', config.provider);
 *   console.log('Using model:', config.model);
 * } catch (error) {
 *   console.error('Configuration error:', error.message);
 *   process.exit(1);
 * }
 * ```
 */
export function loadEnvConfig(): EnvConfig {
	// Determine which provider to use (default: anthropic for backward compatibility)
	const provider =
		(process.env['UXLINT_AI_PROVIDER'] as ProviderType) ?? 'anthropic';

	// Validate provider type
	if (!['anthropic', 'openai', 'ollama'].includes(provider)) {
		throw new Error(
			`Invalid UXLINT_AI_PROVIDER: "${provider}". Must be one of: anthropic, openai, ollama`,
		);
	}

	// Get model (provider-specific default or user-specified)
	const model = process.env['UXLINT_AI_MODEL'] ?? defaultModels[provider];

	// Load provider-specific configuration
	switch (provider) {
		case 'anthropic': {
			const apiKey = process.env['UXLINT_ANTHROPIC_API_KEY'];
			if (!apiKey) {
				throw new Error(
					'UXLINT_ANTHROPIC_API_KEY environment variable is required for Anthropic provider. ' +
						'Please set it in your .env file or environment.',
				);
			}

			return {
				provider: 'anthropic',
				model,
				apiKey,
			};
		}

		case 'openai': {
			const apiKey = process.env['UXLINT_OPENAI_API_KEY'];
			if (!apiKey) {
				throw new Error(
					'UXLINT_OPENAI_API_KEY environment variable is required for OpenAI provider. ' +
						'Please set it in your .env file or environment.',
				);
			}

			return {
				provider: 'openai',
				model,
				apiKey,
			};
		}

		case 'ollama': {
			const baseUrl =
				process.env['UXLINT_OLLAMA_BASE_URL'] ?? 'http://localhost:11434';

			return {
				provider: 'ollama',
				model,
				baseUrl,
			};
		}

		// No default case needed - TypeScript exhaustiveness check ensures all cases are handled
	}
}
