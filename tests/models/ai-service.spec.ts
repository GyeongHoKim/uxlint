/**
 * AI Service Tests
 * Unit tests for AI service factory functions and AIService class
 */

import {createLanguageModel} from '../../source/services/ai-service.js';
import type {EnvConfig} from '../../source/infrastructure/config/env-config.js';

// CreateLanguageModel tests
describe('createLanguageModel', () => {
	test('creates anthropic model with correct config', async () => {
		const config: EnvConfig = {
			provider: 'anthropic',
			model: 'claude-sonnet-4-5-20250929',
			apiKey: 'test-api-key',
		};

		// This will attempt to create a real model, which might fail without valid API key
		// but we can verify the function doesn't throw immediately
		await expect(createLanguageModel(config)).resolves.toBeDefined();
	});

	test('creates openai model with correct config', async () => {
		const config: EnvConfig = {
			provider: 'openai',
			model: 'gpt-5',
			apiKey: 'test-api-key',
		};

		await expect(createLanguageModel(config)).resolves.toBeDefined();
	});

	test('creates ollama model with correct config', async () => {
		const config: EnvConfig = {
			provider: 'ollama',
			model: 'qwen3-vl',
			baseUrl: 'http://localhost:11434/api',
		};

		await expect(createLanguageModel(config)).resolves.toBeDefined();
	});

	test('creates xai model with correct config', async () => {
		const config: EnvConfig = {
			provider: 'xai',
			model: 'grok-4',
			apiKey: 'test-api-key',
		};

		await expect(createLanguageModel(config)).resolves.toBeDefined();
	});

	test('creates google model with correct config', async () => {
		const config: EnvConfig = {
			provider: 'google',
			model: 'gemini-2.5-pro',
			apiKey: 'test-api-key',
		};

		await expect(createLanguageModel(config)).resolves.toBeDefined();
	});
});
