import {type LanguageModelV2} from '@ai-sdk/provider';
import {loadEnvConfig} from '../infrastructure/config/env-config.js';

/**
 * Create language model based on environment configuration
 */
async function createLanguageModel(): Promise<LanguageModelV2> {
	const envConfig = loadEnvConfig();
	switch (envConfig.provider) {
		case 'anthropic': {
			const {createAnthropic} = await import('@ai-sdk/anthropic');
			const anthropic = createAnthropic({apiKey: envConfig.apiKey});
			return anthropic(envConfig.model);
		}

		case 'openai': {
			const {createOpenAI} = await import('@ai-sdk/openai');
			const openai = createOpenAI({apiKey: envConfig.apiKey});
			return openai(envConfig.model);
		}

		case 'ollama': {
			const {createOllama} = await import('ollama-ai-provider-v2');
			const ollama = createOllama({baseURL: envConfig.baseUrl});
			return ollama(envConfig.model);
		}

		case 'xai': {
			const {createXai} = await import('@ai-sdk/xai');
			const xai = createXai({apiKey: envConfig.apiKey});
			return xai(envConfig.model);
		}

		case 'google': {
			const {createGoogleGenerativeAI} = await import('@ai-sdk/google');
			const google = createGoogleGenerativeAI({apiKey: envConfig.apiKey});
			return google(envConfig.model);
		}
	}
}

export const languageModel = await createLanguageModel();
