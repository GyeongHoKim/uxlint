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
export type ProviderType = 'anthropic' | 'openai' | 'ollama' | 'xai' | 'google';

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
	 * Defaults to 'gpt-5' if not specified
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
	 * Defaults to 'qwen3-vl' if not specified
	 * IMPORTANT: Must support both vision and tool calling
	 */
	model: string;

	/**
	 * Ollama server base URL (from UXLINT_OLLAMA_BASE_URL env var)
	 * Defaults to 'http://localhost:11434/api' if not specified
	 */
	baseUrl: string;
};

/**
 * XAI (Grok) provider configuration
 */
export type XaiConfig = {
	/**
	 * Provider type
	 */
	provider: 'xai';

	/**
	 * AI model name (from UXLINT_AI_MODEL env var)
	 * Defaults to 'grok-4' if not specified
	 */
	model: string;

	/**
	 * XAI API key (from UXLINT_XAI_API_KEY env var)
	 */
	apiKey: string;
};

/**
 * Google (Gemini) provider configuration
 */
export type GoogleConfig = {
	/**
	 * Provider type
	 */
	provider: 'google';

	/**
	 * AI model name (from UXLINT_AI_MODEL env var)
	 * Defaults to 'gemini-2.5-pro' if not specified
	 */
	model: string;

	/**
	 * Google API key (from UXLINT_GOOGLE_API_KEY env var)
	 */
	apiKey: string;
};

/**
 * Environment configuration for AI service (discriminated union)
 */
export type EnvConfig =
	| AnthropicConfig
	| OpenAiConfig
	| OllamaConfig
	| XaiConfig
	| GoogleConfig;

/**
 * Default AI models per provider
 */
const defaultModels: Record<ProviderType, string> = {
	anthropic: 'claude-sonnet-4-5-20250929',
	openai: 'gpt-5',
	ollama: 'qwen3-vl',
	xai: 'grok-4',
	google: 'gemini-2.5-pro',
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
	if (!['anthropic', 'openai', 'ollama', 'xai', 'google'].includes(provider)) {
		throw new Error(
			`Invalid UXLINT_AI_PROVIDER: "${provider}". Must be one of: anthropic, openai, ollama, xai, google`,
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
				process.env['UXLINT_OLLAMA_BASE_URL'] ?? 'http://localhost:11434/api';

			return {
				provider: 'ollama',
				model,
				baseUrl,
			};
		}

		case 'xai': {
			const apiKey = process.env['UXLINT_XAI_API_KEY'];
			if (!apiKey) {
				throw new Error(
					'UXLINT_XAI_API_KEY environment variable is required for xAI provider. ' +
						'Please set it in your .env file or environment.',
				);
			}

			return {
				provider: 'xai',
				model,
				apiKey,
			};
		}

		case 'google': {
			const apiKey = process.env['UXLINT_GOOGLE_API_KEY'];
			if (!apiKey) {
				throw new Error(
					'UXLINT_GOOGLE_API_KEY environment variable is required for Google provider. ' +
						'Please set it in your .env file or environment.',
				);
			}

			return {
				provider: 'google',
				model,
				apiKey,
			};
		}

		// No default case needed - TypeScript exhaustiveness check ensures all cases are handled
	}
}
