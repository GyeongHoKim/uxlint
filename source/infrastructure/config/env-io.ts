/**
 * Environment Variable I/O
 * Handles loading and validation of sensitive configuration from .env files
 *
 * SECURITY: This module isolates sensitive data (API keys, credentials) from
 * git-tracked configuration files (.uxlintrc). All sensitive data MUST be
 * stored in .env files which are excluded from version control.
 */

import process from 'node:process';
import {config} from 'dotenv';
import {ConfigurationError} from '../../models/errors.js';

// Load .env file (quiet mode - don't throw if .env doesn't exist)
config({quiet: true});

/**
 * Supported AI provider types
 */
export type ProviderType = 'anthropic' | 'openai' | 'ollama' | 'xai' | 'google';

/**
 * Anthropic provider environment configuration
 */
export type AnthropicEnvConfig = {
	readonly provider: 'anthropic';
	readonly apiKey: string;
	readonly model?: string;
};

/**
 * OpenAI provider environment configuration
 */
export type OpenAiEnvConfig = {
	readonly provider: 'openai';
	readonly apiKey: string;
	readonly model?: string;
};

/**
 * Ollama provider environment configuration
 */
export type OllamaEnvConfig = {
	readonly provider: 'ollama';
	readonly model?: string;
	readonly baseUrl?: string;
};

/**
 * XAI (Grok) provider environment configuration
 */
export type XaiEnvConfig = {
	readonly provider: 'xai';
	readonly apiKey: string;
	readonly model?: string;
};

/**
 * Google (Gemini) provider environment configuration
 */
export type GoogleEnvConfig = {
	readonly provider: 'google';
	readonly apiKey: string;
	readonly model?: string;
};

/**
 * AI service environment configuration (discriminated union)
 */
export type AiEnvConfig =
	| AnthropicEnvConfig
	| OpenAiEnvConfig
	| OllamaEnvConfig
	| XaiEnvConfig
	| GoogleEnvConfig;

/**
 * Cloud/OAuth environment configuration
 */
export type CloudEnvConfig = {
	/** Client ID for OAuth authentication */
	readonly clientId: string;
	/** API base URL for UXLint Cloud */
	readonly apiBaseUrl: string;
	/** Redirect URI for OAuth callback */
	readonly redirectUri: string;
};

/**
 * Complete environment configuration
 */
export type EnvConfig = {
	/** AI service configuration */
	readonly ai: AiEnvConfig;
	/** Cloud/OAuth configuration */
	readonly cloud: CloudEnvConfig;
};

/**
 * Default values for configuration
 */
const defaults = {
	cloud: {
		clientId: 'uxlint-cli',
		apiBaseUrl: 'https://hyvuqqbpiitcsjwztsyb.supabase.co',
		redirectUri: 'http://localhost:8080/callback',
	},
	ai: {
		models: {
			anthropic: 'claude-sonnet-4-5-20250929',
			openai: 'gpt-5',
			ollama: 'qwen3-vl',
			xai: 'grok-4',
			google: 'gemini-2.5-pro',
		},
		ollamaBaseUrl: 'http://localhost:11434/api',
	},
} as const;

/**
 * Environment variable I/O handler
 */
export class EnvIO {
	constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

	/**
	 * Load and validate cloud/OAuth configuration from environment
	 *
	 * @returns CloudEnvConfig with defaults applied
	 *
	 * @example
	 * const envIO = new EnvIO();
	 * const cloudConfig = envIO.loadCloudConfig();
	 * // cloudConfig.clientId, cloudConfig.apiBaseUrl, cloudConfig.redirectUri
	 */
	loadCloudConfig(): CloudEnvConfig {
		return {
			clientId: this.env['UXLINT_CLOUD_CLIENT_ID'] ?? defaults.cloud.clientId,
			apiBaseUrl:
				this.env['UXLINT_CLOUD_API_BASE_URL'] ?? defaults.cloud.apiBaseUrl,
			redirectUri:
				this.env['UXLINT_CLOUD_REDIRECT_URI'] ?? defaults.cloud.redirectUri,
		};
	}

	/**
	 * Load and validate AI configuration from environment
	 *
	 * Environment variables:
	 * - UXLINT_AI_PROVIDER: Provider name (anthropic, openai, ollama, xai, google)
	 * - UXLINT_AI_API_KEY: API key (required for all except ollama)
	 * - UXLINT_AI_MODEL: Model name (optional, provider-specific defaults used)
	 * - UXLINT_AI_BASE_URL: Base URL (optional, ollama only)
	 *
	 * @returns AiEnvConfig
	 * @throws ConfigurationError if required variables are missing or invalid
	 *
	 * @example
	 * const envIO = new EnvIO();
	 * const aiConfig = envIO.loadAiConfig();
	 * // aiConfig.provider, aiConfig.apiKey, aiConfig.model
	 */
	loadAiConfig(): AiEnvConfig {
		const provider = this.getProvider();
		const model = this.env['UXLINT_AI_MODEL'];

		switch (provider) {
			case 'anthropic': {
				const apiKey = this.getRequiredApiKey(provider);
				return {
					provider: 'anthropic',
					apiKey,
					model: model ?? defaults.ai.models.anthropic,
				};
			}

			case 'openai': {
				const apiKey = this.getRequiredApiKey(provider);
				return {
					provider: 'openai',
					apiKey,
					model: model ?? defaults.ai.models.openai,
				};
			}

			case 'ollama': {
				const baseUrl =
					this.env['UXLINT_AI_BASE_URL'] ?? defaults.ai.ollamaBaseUrl;
				return {
					provider: 'ollama',
					model: model ?? defaults.ai.models.ollama,
					baseUrl,
				};
			}

			case 'xai': {
				const apiKey = this.getRequiredApiKey(provider);
				return {
					provider: 'xai',
					apiKey,
					model: model ?? defaults.ai.models.xai,
				};
			}

			case 'google': {
				const apiKey = this.getRequiredApiKey(provider);
				return {
					provider: 'google',
					apiKey,
					model: model ?? defaults.ai.models.google,
				};
			}
		}
	}

	/**
	 * Load complete environment configuration
	 *
	 * @returns EnvConfig with AI and Cloud configurations
	 * @throws ConfigurationError if required variables are missing or invalid
	 *
	 * @example
	 * const envIO = new EnvIO();
	 * const config = envIO.loadConfig();
	 * // config.ai, config.cloud
	 */
	loadConfig(): EnvConfig {
		return {
			ai: this.loadAiConfig(),
			cloud: this.loadCloudConfig(),
		};
	}

	/**
	 * Get and validate provider from environment
	 *
	 * @returns ProviderType
	 * @throws ConfigurationError if provider is invalid or missing
	 */
	private getProvider(): ProviderType {
		const provider = this.env['UXLINT_AI_PROVIDER'];

		if (!provider) {
			throw new ConfigurationError(
				'UXLINT_AI_PROVIDER environment variable is required. Valid values: anthropic, openai, ollama, xai, google',
			);
		}

		const validProviders: ProviderType[] = [
			'anthropic',
			'openai',
			'ollama',
			'xai',
			'google',
		];

		if (!validProviders.includes(provider as ProviderType)) {
			throw new ConfigurationError(
				`Invalid AI provider: ${provider}. Valid values: ${validProviders.join(
					', ',
				)}`,
			);
		}

		return provider as ProviderType;
	}

	/**
	 * Get required API key for a provider
	 *
	 * @param provider - Provider name
	 * @returns API key string
	 * @throws ConfigurationError if API key is missing
	 */
	private getRequiredApiKey(provider: string): string {
		const apiKey = this.env['UXLINT_AI_API_KEY'];

		if (!apiKey) {
			throw new ConfigurationError(
				`UXLINT_AI_API_KEY environment variable is required for ${provider} provider`,
			);
		}

		if (apiKey.trim().length === 0) {
			throw new ConfigurationError(
				`UXLINT_AI_API_KEY environment variable cannot be empty for ${provider} provider`,
			);
		}

		return apiKey;
	}
}

/**
 * Default singleton instance
 */
export const envIO = new EnvIO();
