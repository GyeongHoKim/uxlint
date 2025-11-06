/**
 * Environment Configuration Tests
 * Validates environment variable loading and validation for multiple providers
 */

import process from 'node:process';
import {loadEnvConfig} from '../../source/infrastructure/config/env-config.js';

// Store original env vars to restore after tests
const originalEnv = {
	provider: process.env['UXLINT_AI_PROVIDER'],
	anthropicApiKey: process.env['UXLINT_ANTHROPIC_API_KEY'],
	openaiApiKey: process.env['UXLINT_OPENAI_API_KEY'],
	ollamaBaseUrl: process.env['UXLINT_OLLAMA_BASE_URL'],
	xaiApiKey: process.env['UXLINT_XAI_API_KEY'],
	model: process.env['UXLINT_AI_MODEL'],
};

afterEach(() => {
	// Restore original environment variables
	if (originalEnv.provider) {
		process.env['UXLINT_AI_PROVIDER'] = originalEnv.provider;
	} else {
		delete process.env['UXLINT_AI_PROVIDER'];
	}

	if (originalEnv.anthropicApiKey) {
		process.env['UXLINT_ANTHROPIC_API_KEY'] = originalEnv.anthropicApiKey;
	} else {
		delete process.env['UXLINT_ANTHROPIC_API_KEY'];
	}

	if (originalEnv.openaiApiKey) {
		process.env['UXLINT_OPENAI_API_KEY'] = originalEnv.openaiApiKey;
	} else {
		delete process.env['UXLINT_OPENAI_API_KEY'];
	}

	if (originalEnv.ollamaBaseUrl) {
		process.env['UXLINT_OLLAMA_BASE_URL'] = originalEnv.ollamaBaseUrl;
	} else {
		delete process.env['UXLINT_OLLAMA_BASE_URL'];
	}

	if (originalEnv.xaiApiKey) {
		process.env['UXLINT_XAI_API_KEY'] = originalEnv.xaiApiKey;
	} else {
		delete process.env['UXLINT_XAI_API_KEY'];
	}

	if (originalEnv.model) {
		process.env['UXLINT_AI_MODEL'] = originalEnv.model;
	} else {
		delete process.env['UXLINT_AI_MODEL'];
	}
});

// Anthropic provider tests (default)
describe('Anthropic Provider', () => {
	test('throws error when UXLINT_ANTHROPIC_API_KEY is missing', () => {
		delete process.env['UXLINT_ANTHROPIC_API_KEY'];
		delete process.env['UXLINT_AI_PROVIDER'];

		expect(() => loadEnvConfig()).toThrow(
			'UXLINT_ANTHROPIC_API_KEY environment variable is required for Anthropic provider',
		);
	});

	test('provides default model when UXLINT_AI_MODEL is not set', () => {
		process.env['UXLINT_ANTHROPIC_API_KEY'] = 'test_api_key';
		delete process.env['UXLINT_AI_MODEL'];
		delete process.env['UXLINT_AI_PROVIDER'];

		const config = loadEnvConfig();

		expect(config.provider).toBe('anthropic');
		expect(config.model).toBe('claude-sonnet-4-5-20250929');
		if (config.provider === 'anthropic') {
			expect(config.apiKey).toBe('test_api_key');
		}
	});

	test('uses custom model when UXLINT_AI_MODEL is set', () => {
		process.env['UXLINT_ANTHROPIC_API_KEY'] = 'test_api_key';
		process.env['UXLINT_AI_MODEL'] = 'claude-3-opus-20240229';
		delete process.env['UXLINT_AI_PROVIDER'];

		const config = loadEnvConfig();

		expect(config.provider).toBe('anthropic');
		expect(config.model).toBe('claude-3-opus-20240229');
		if (config.provider === 'anthropic') {
			expect(config.apiKey).toBe('test_api_key');
		}
	});

	test('returns valid config with all required fields', () => {
		process.env['UXLINT_ANTHROPIC_API_KEY'] = 'test_api_key';
		process.env['UXLINT_AI_MODEL'] = 'custom-model';
		delete process.env['UXLINT_AI_PROVIDER'];

		const config = loadEnvConfig();

		expect(config).toHaveProperty('provider');
		expect(config).toHaveProperty('model');
		expect(config.provider).toBe('anthropic');
		expect(typeof config.model).toBe('string');
		if (config.provider === 'anthropic') {
			expect(config).toHaveProperty('apiKey');
			expect(typeof config.apiKey).toBe('string');
		}
	});

	test('error message guides user to set environment variable', () => {
		delete process.env['UXLINT_ANTHROPIC_API_KEY'];
		delete process.env['UXLINT_AI_PROVIDER'];

		expect(() => loadEnvConfig()).toThrow('.env file or environment');
	});
});

// OpenAI provider tests
describe('OpenAI Provider', () => {
	test('throws error when UXLINT_OPENAI_API_KEY is missing', () => {
		delete process.env['UXLINT_OPENAI_API_KEY'];
		process.env['UXLINT_AI_PROVIDER'] = 'openai';

		expect(() => loadEnvConfig()).toThrow(
			'UXLINT_OPENAI_API_KEY environment variable is required for OpenAI provider',
		);
	});

	test('provides default model when UXLINT_AI_MODEL is not set', () => {
		process.env['UXLINT_OPENAI_API_KEY'] = 'test_openai_key';
		process.env['UXLINT_AI_PROVIDER'] = 'openai';
		delete process.env['UXLINT_AI_MODEL'];

		const config = loadEnvConfig();

		expect(config.provider).toBe('openai');
		expect(config.model).toBe('gpt-4o');
		if (config.provider === 'openai') {
			expect(config.apiKey).toBe('test_openai_key');
		}
	});

	test('uses custom model when UXLINT_AI_MODEL is set', () => {
		process.env['UXLINT_OPENAI_API_KEY'] = 'test_openai_key';
		process.env['UXLINT_AI_PROVIDER'] = 'openai';
		process.env['UXLINT_AI_MODEL'] = 'gpt-3.5-turbo';

		const config = loadEnvConfig();

		expect(config.provider).toBe('openai');
		expect(config.model).toBe('gpt-3.5-turbo');
		if (config.provider === 'openai') {
			expect(config.apiKey).toBe('test_openai_key');
		}
	});

	test('returns valid config with all required fields', () => {
		process.env['UXLINT_OPENAI_API_KEY'] = 'test_openai_key';
		process.env['UXLINT_AI_PROVIDER'] = 'openai';
		process.env['UXLINT_AI_MODEL'] = 'gpt-4o';

		const config = loadEnvConfig();

		expect(config).toHaveProperty('provider');
		expect(config).toHaveProperty('model');
		expect(config.provider).toBe('openai');
		if (config.provider === 'openai') {
			expect(config).toHaveProperty('apiKey');
			expect(typeof config.apiKey).toBe('string');
		}
	});
});

// Ollama provider tests
describe('Ollama Provider', () => {
	test('provides default baseUrl when UXLINT_OLLAMA_BASE_URL is not set', () => {
		process.env['UXLINT_AI_PROVIDER'] = 'ollama';
		delete process.env['UXLINT_OLLAMA_BASE_URL'];
		delete process.env['UXLINT_AI_MODEL'];

		const config = loadEnvConfig();

		expect(config.provider).toBe('ollama');
		expect(config.model).toBe('llama3.1');
		if (config.provider === 'ollama') {
			expect(config.baseUrl).toBe('http://localhost:11434');
		}
	});

	test('uses custom baseUrl when UXLINT_OLLAMA_BASE_URL is set', () => {
		process.env['UXLINT_AI_PROVIDER'] = 'ollama';
		process.env['UXLINT_OLLAMA_BASE_URL'] = 'http://custom-ollama:8080';
		delete process.env['UXLINT_AI_MODEL'];

		const config = loadEnvConfig();

		expect(config.provider).toBe('ollama');
		if (config.provider === 'ollama') {
			expect(config.baseUrl).toBe('http://custom-ollama:8080');
		}
	});

	test('uses custom model when UXLINT_AI_MODEL is set', () => {
		process.env['UXLINT_AI_PROVIDER'] = 'ollama';
		process.env['UXLINT_AI_MODEL'] = 'llama3:70b';
		delete process.env['UXLINT_OLLAMA_BASE_URL'];

		const config = loadEnvConfig();

		expect(config.provider).toBe('ollama');
		expect(config.model).toBe('llama3:70b');
		if (config.provider === 'ollama') {
			expect(config.baseUrl).toBe('http://localhost:11434');
		}
	});

	test('returns valid config with all required fields', () => {
		process.env['UXLINT_AI_PROVIDER'] = 'ollama';
		process.env['UXLINT_AI_MODEL'] = 'llama3.1';
		process.env['UXLINT_OLLAMA_BASE_URL'] = 'http://localhost:11434';

		const config = loadEnvConfig();

		expect(config).toHaveProperty('provider');
		expect(config).toHaveProperty('model');
		expect(config.provider).toBe('ollama');
		if (config.provider === 'ollama') {
			expect(config).toHaveProperty('baseUrl');
			expect(typeof config.baseUrl).toBe('string');
		}
	});
});

// XAI (Grok) provider tests
describe('xAI Provider', () => {
	test('throws error when UXLINT_XAI_API_KEY is missing', () => {
		delete process.env['UXLINT_XAI_API_KEY'];
		process.env['UXLINT_AI_PROVIDER'] = 'xai';

		expect(() => loadEnvConfig()).toThrow(
			'UXLINT_XAI_API_KEY environment variable is required for xAI provider',
		);
	});

	test('provides default model when UXLINT_AI_MODEL is not set', () => {
		process.env['UXLINT_XAI_API_KEY'] = 'test_xai_key';
		process.env['UXLINT_AI_PROVIDER'] = 'xai';
		delete process.env['UXLINT_AI_MODEL'];

		const config = loadEnvConfig();

		expect(config.provider).toBe('xai');
		expect(config.model).toBe('grok-4');
		if (config.provider === 'xai') {
			expect(config.apiKey).toBe('test_xai_key');
		}
	});

	test('uses custom model when UXLINT_AI_MODEL is set', () => {
		process.env['UXLINT_XAI_API_KEY'] = 'test_xai_key';
		process.env['UXLINT_AI_PROVIDER'] = 'xai';
		process.env['UXLINT_AI_MODEL'] = 'grok-3-beta';

		const config = loadEnvConfig();

		expect(config.provider).toBe('xai');
		expect(config.model).toBe('grok-3-beta');
		if (config.provider === 'xai') {
			expect(config.apiKey).toBe('test_xai_key');
		}
	});

	test('returns valid config with all required fields', () => {
		process.env['UXLINT_XAI_API_KEY'] = 'test_xai_key';
		process.env['UXLINT_AI_PROVIDER'] = 'xai';
		process.env['UXLINT_AI_MODEL'] = 'grok-4';

		const config = loadEnvConfig();

		expect(config).toHaveProperty('provider');
		expect(config).toHaveProperty('model');
		expect(config.provider).toBe('xai');
		if (config.provider === 'xai') {
			expect(config).toHaveProperty('apiKey');
			expect(typeof config.apiKey).toBe('string');
		}
	});
});

// Provider validation tests
describe('Provider Validation', () => {
	test('throws error when invalid provider is specified', () => {
		process.env['UXLINT_AI_PROVIDER'] = 'invalid-provider';

		expect(() => loadEnvConfig()).toThrow(
			'Invalid UXLINT_AI_PROVIDER: "invalid-provider". Must be one of: anthropic, openai, ollama, xai',
		);
	});

	test('defaults to anthropic when UXLINT_AI_PROVIDER is not set', () => {
		process.env['UXLINT_ANTHROPIC_API_KEY'] = 'test_api_key';
		delete process.env['UXLINT_AI_PROVIDER'];

		const config = loadEnvConfig();

		expect(config.provider).toBe('anthropic');
	});
});
