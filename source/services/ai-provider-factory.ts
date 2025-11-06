/**
 * AI Provider Factory
 * Creates AI provider instances based on configuration using dependency injection pattern
 *
 * This module implements an extensible provider abstraction that allows:
 * - Easy addition of new LLM providers (Grok, Gemini, etc.)
 * - Type-safe provider configuration
 * - Centralized provider creation logic
 *
 * @packageDocumentation
 */

import {createAnthropic} from '@ai-sdk/anthropic';
import {createOpenAI} from '@ai-sdk/openai';
import {createOllama} from 'ollama-ai-provider-v2';
import type {LanguageModelV2} from '@ai-sdk/provider';
import type {
	EnvConfig,
	AnthropicConfig,
	OpenAiConfig,
	OllamaConfig,
} from '../infrastructure/config/env-config.js';

/**
 * AI Provider interface
 * Abstraction for all LLM providers to enable dependency injection
 */
export type AiProvider = {
	/**
	 * Provider name
	 */
	name: string;

	/**
	 * Get language model instance
	 */
	getModel: () => LanguageModelV2;
};

/**
 * Provider factory function type
 * Each provider implements this signature for consistent instantiation
 */
export type ProviderFactory<Config extends EnvConfig = EnvConfig> = (
	config: Config,
) => AiProvider;

/**
 * Create Anthropic provider instance
 *
 * @param config - Anthropic-specific configuration
 * @returns AiProvider instance for Anthropic
 *
 * @example
 * ```typescript
 * const provider = createAnthropicProvider({
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-5-20250929',
 *   apiKey: 'sk-...'
 * });
 * const model = provider.getModel();
 * ```
 */
export const createAnthropicProvider: ProviderFactory<
	AnthropicConfig
> = config => {
	const anthropic = createAnthropic({
		apiKey: config.apiKey,
	});

	return {
		name: 'anthropic',
		getModel: () => anthropic(config.model),
	};
};

/**
 * Create OpenAI provider instance
 *
 * @param config - OpenAI-specific configuration
 * @returns AiProvider instance for OpenAI
 *
 * @example
 * ```typescript
 * const provider = createOpenAiProvider({
 *   provider: 'openai',
 *   model: 'gpt-4o',
 *   apiKey: 'sk-...'
 * });
 * const model = provider.getModel();
 * ```
 */
export const createOpenAiProvider: ProviderFactory<OpenAiConfig> = config => {
	const openai = createOpenAI({
		apiKey: config.apiKey,
	});

	return {
		name: 'openai',
		getModel: () => openai(config.model),
	};
};

/**
 * Create Ollama provider instance
 *
 * @param config - Ollama-specific configuration
 * @returns AiProvider instance for Ollama
 *
 * @example
 * ```typescript
 * const provider = createOllamaProvider({
 *   provider: 'ollama',
 *   model: 'llama3.1',
 *   baseUrl: 'http://localhost:11434'
 * });
 * const model = provider.getModel();
 * ```
 */
export const createOllamaProvider: ProviderFactory<OllamaConfig> = config => {
	const ollamaProvider = createOllama({
		// eslint-disable-next-line @typescript-eslint/naming-convention -- baseURL is required by ollama-ai-provider-v2 API
		baseURL: config.baseUrl,
	});

	return {
		name: 'ollama',
		getModel: () => ollamaProvider(config.model),
	};
};

/**
 * Provider factory registry
 * Maps provider types to their factory functions
 *
 * To add a new provider:
 * 1. Add provider type to ProviderType in env-config.ts
 * 2. Add provider config type (e.g., GrokConfig) in env-config.ts
 * 3. Add to EnvConfig discriminated union in env-config.ts
 * 4. Create provider factory function (e.g., createGrokProvider)
 * 5. Register in this registry
 *
 * Example for adding Grok:
 * ```typescript
 * // In env-config.ts
 * export type GrokConfig = {
 *   provider: 'grok';
 *   model: string;
 *   apiKey: string;
 * };
 *
 * // In this file
 * export const createGrokProvider: ProviderFactory<GrokConfig> = (config) => {
 *   const grok = createGrok({ apiKey: config.apiKey });
 *   return {
 *     name: 'grok',
 *     getModel: () => grok(config.model),
 *   };
 * };
 *
 * // Add to registry
 * const providerFactories = {
 *   anthropic: createAnthropicProvider,
 *   openai: createOpenAIProvider,
 *   ollama: createOllamaProvider,
 *   grok: createGrokProvider,
 * };
 * ```
 */
const providerFactories = {
	anthropic: createAnthropicProvider,
	openai: createOpenAiProvider,
	ollama: createOllamaProvider,
} as const;

/**
 * Create AI provider from configuration
 * Main factory function that uses dependency injection to create the appropriate provider
 *
 * @param config - Environment configuration (discriminated union)
 * @returns AiProvider instance
 *
 * @example
 * ```typescript
 * const config = loadEnvConfig();
 * const provider = createAiProvider(config);
 * const model = provider.getModel();
 *
 * // Use with AI SDK
 * const result = await generateText({
 *   model: provider.getModel(),
 *   prompt: 'Hello, world!'
 * });
 * ```
 */
export function createAiProvider(config: EnvConfig): AiProvider {
	const factory = providerFactories[config.provider];

	if (!factory) {
		throw new Error(
			`No factory registered for provider: ${config.provider}. ` +
				`Available providers: ${Object.keys(providerFactories).join(', ')}`,
		);
	}

	// TypeScript narrowing: factory expects specific config type based on provider
	// The discriminated union ensures type safety here
	return factory(config as never);
}
