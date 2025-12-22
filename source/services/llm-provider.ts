import {type LanguageModelV2} from '@ai-sdk/provider';
import type {UxLintConfig} from '../models/config.js';
import {
	envIO,
	type AiEnvConfig,
	type EnvIO,
} from '../infrastructure/config/env-io.js';

/**
 * Create language model based on AI environment configuration
 */
async function createLanguageModel(
	aiConfig: AiEnvConfig,
): Promise<LanguageModelV2> {
	switch (aiConfig.provider) {
		case 'anthropic': {
			const {createAnthropic} = await import('@ai-sdk/anthropic');
			const anthropic = createAnthropic({apiKey: aiConfig.apiKey});
			return anthropic(aiConfig.model!);
		}

		case 'openai': {
			const {createOpenAI} = await import('@ai-sdk/openai');
			const openai = createOpenAI({apiKey: aiConfig.apiKey});
			return openai(aiConfig.model!);
		}

		case 'ollama': {
			const {createOllama} = await import('ollama-ai-provider-v2');
			const ollama = createOllama({
				baseURL: aiConfig.baseUrl!,
			});
			return ollama(aiConfig.model!);
		}

		case 'xai': {
			const {createXai} = await import('@ai-sdk/xai');
			const xai = createXai({apiKey: aiConfig.apiKey});
			return xai(aiConfig.model!);
		}

		case 'google': {
			const {createGoogleGenerativeAI} = await import('@ai-sdk/google');
			const google = createGoogleGenerativeAI({apiKey: aiConfig.apiKey});
			return google(aiConfig.model!);
		}
	}
}

/**
 * Get or create language model instance based on environment configuration
 *
 * @param _config - UxLintConfig (unused, kept for backward compatibility)
 * @param envIoInstance - EnvIO instance for dependency injection (defaults to singleton)
 * @returns Promise that resolves to LanguageModelV2 instance
 */
export async function getLanguageModel(
	_config: UxLintConfig,
	envIoInstance: EnvIO = envIO,
): Promise<LanguageModelV2> {
	const aiConfig = envIoInstance.loadAiConfig();
	return createLanguageModel(aiConfig);
}

/**
 * Reset language model instance (useful for testing)
 * Note: This function is kept for backward compatibility but may not be needed
 * since we now create models per config rather than using a singleton
 */
export function resetLanguageModel(): void {
	// No-op: models are now created per config, not cached
}
