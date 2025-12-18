import process from 'node:process';
import {type LanguageModelV2} from '@ai-sdk/provider';
import type {AiConfig, UxLintConfig} from '../models/config.js';

/**
 * Default AI models per provider
 */
const defaultModels: Record<Exclude<AiConfig['provider'], 'ollama'>, string> = {
	anthropic: 'claude-sonnet-4-5-20250929',
	openai: 'gpt-5',
	xai: 'grok-4',
	google: 'gemini-2.5-pro',
};

const defaultOllamaModel = 'qwen3-vl';
const defaultOllamaBaseUrl = 'http://localhost:11434/api';

/**
 * Create language model based on configuration
 */
async function createLanguageModel(
	aiConfig: AiConfig,
): Promise<LanguageModelV2> {
	switch (aiConfig.provider) {
		case 'anthropic': {
			const {createAnthropic} = await import('@ai-sdk/anthropic');
			const anthropic = createAnthropic({apiKey: aiConfig.apiKey});
			return anthropic(aiConfig.model ?? defaultModels.anthropic);
		}

		case 'openai': {
			const {createOpenAI} = await import('@ai-sdk/openai');
			const openai = createOpenAI({apiKey: aiConfig.apiKey});
			return openai(aiConfig.model ?? defaultModels.openai);
		}

		case 'ollama': {
			const {createOllama} = await import('ollama-ai-provider-v2');
			const ollama = createOllama({
				baseURL: aiConfig.baseUrl ?? defaultOllamaBaseUrl,
			});
			return ollama(aiConfig.model ?? defaultOllamaModel);
		}

		case 'xai': {
			const {createXai} = await import('@ai-sdk/xai');
			const xai = createXai({apiKey: aiConfig.apiKey});
			return xai(aiConfig.model ?? defaultModels.xai);
		}

		case 'google': {
			const {createGoogleGenerativeAI} = await import('@ai-sdk/google');
			const google = createGoogleGenerativeAI({apiKey: aiConfig.apiKey});
			return google(aiConfig.model ?? defaultModels.google);
		}
	}
}

/**
 * Get AI configuration from UxLintConfig or use defaults
 */
function getAiConfig(config: UxLintConfig): AiConfig {
	if (config.ai) {
		return config.ai;
	}

	// Default to Anthropic if no AI config is provided
	// API key will need to be provided via environment variable or prompt
	const apiKey = process.env['UXLINT_ANTHROPIC_API_KEY'];
	if (!apiKey) {
		throw new Error(
			'AI configuration is required. Please provide ai configuration in .uxlintrc file or set UXLINT_ANTHROPIC_API_KEY environment variable.',
		);
	}

	return {
		provider: 'anthropic',
		apiKey,
		model: process.env['UXLINT_AI_MODEL'] ?? defaultModels.anthropic,
	};
}

/**
 * Get or create language model instance based on configuration
 */
export async function getLanguageModel(
	config: UxLintConfig,
): Promise<LanguageModelV2> {
	const aiConfig = getAiConfig(config);
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
