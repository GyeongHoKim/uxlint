import test from 'ava';
import {EnvIO} from '../../../source/infrastructure/config/env-io.js';
import {ConfigurationError} from '../../../source/models/errors.js';

// Test helpers
function createMockEnv(
	overrides: Record<string, string> = {},
): NodeJS.ProcessEnv {
	return {...overrides};
}

/**
 * Cloud Configuration Tests
 */

test('loadCloudConfig returns default values when no env vars set', t => {
	const envIO = new EnvIO(createMockEnv());
	const config = envIO.loadCloudConfig();

	t.is(config.clientId, 'uxlint-cli');
	t.is(config.apiBaseUrl, 'https://hyvuqqbpiitcsjwztsyb.supabase.co');
	t.is(config.redirectUri, 'http://localhost:8080/callback');
});

test('loadCloudConfig uses environment variables when set', t => {
	const env = createMockEnv({
		UXLINT_CLOUD_CLIENT_ID: 'custom-client-id',
		UXLINT_CLOUD_API_BASE_URL: 'https://custom.api.url',
		UXLINT_CLOUD_REDIRECT_URI: 'http://localhost:9999/callback',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadCloudConfig();

	t.is(config.clientId, 'custom-client-id');
	t.is(config.apiBaseUrl, 'https://custom.api.url');
	t.is(config.redirectUri, 'http://localhost:9999/callback');
});

test('loadCloudConfig allows partial override of defaults', t => {
	const env = createMockEnv({
		UXLINT_CLOUD_CLIENT_ID: 'custom-client-id',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadCloudConfig();

	t.is(config.clientId, 'custom-client-id');
	t.is(config.apiBaseUrl, 'https://hyvuqqbpiitcsjwztsyb.supabase.co');
	t.is(config.redirectUri, 'http://localhost:8080/callback');
});

/**
 * AI Configuration Tests - Anthropic
 */

test('loadAiConfig loads Anthropic config with API key', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'anthropic',
		UXLINT_AI_API_KEY: 'sk-ant-test-key',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadAiConfig();

	t.is(config.provider, 'anthropic');
	if (config.provider === 'anthropic') {
		t.is(config.apiKey, 'sk-ant-test-key');
		t.is(config.model, 'claude-sonnet-4-5-20250929');
	}
});

test('loadAiConfig loads Anthropic config with custom model', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'anthropic',
		UXLINT_AI_API_KEY: 'sk-ant-test-key',
		UXLINT_AI_MODEL: 'claude-opus-4',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadAiConfig();

	t.is(config.provider, 'anthropic');
	if (config.provider === 'anthropic') {
		t.is(config.apiKey, 'sk-ant-test-key');
		t.is(config.model, 'claude-opus-4');
	}
});

/**
 * AI Configuration Tests - OpenAI
 */

test('loadAiConfig loads OpenAI config with API key', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'openai',
		UXLINT_AI_API_KEY: 'sk-openai-test-key',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadAiConfig();

	t.is(config.provider, 'openai');
	if (config.provider === 'openai') {
		t.is(config.apiKey, 'sk-openai-test-key');
		t.is(config.model, 'gpt-5');
	}
});

test('loadAiConfig loads OpenAI config with custom model', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'openai',
		UXLINT_AI_API_KEY: 'sk-openai-test-key',
		UXLINT_AI_MODEL: 'gpt-4',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadAiConfig();

	t.is(config.provider, 'openai');
	if (config.provider === 'openai') {
		t.is(config.apiKey, 'sk-openai-test-key');
		t.is(config.model, 'gpt-4');
	}
});

/**
 * AI Configuration Tests - Ollama
 */

test('loadAiConfig loads Ollama config without API key', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'ollama',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadAiConfig();

	t.is(config.provider, 'ollama');
	if (config.provider === 'ollama') {
		t.is(config.model, 'qwen3-vl');
		t.is(config.baseUrl, 'http://localhost:11434/api');
	}
});

test('loadAiConfig loads Ollama config with custom base URL and model', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'ollama',
		UXLINT_AI_MODEL: 'llama3',
		UXLINT_AI_BASE_URL: 'http://custom:8080/api',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadAiConfig();

	t.is(config.provider, 'ollama');
	if (config.provider === 'ollama') {
		t.is(config.model, 'llama3');
		t.is(config.baseUrl, 'http://custom:8080/api');
	}
});

/**
 * AI Configuration Tests - XAI
 */

test('loadAiConfig loads XAI config with API key', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'xai',
		UXLINT_AI_API_KEY: 'xai-test-key',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadAiConfig();

	t.is(config.provider, 'xai');
	if (config.provider === 'xai') {
		t.is(config.apiKey, 'xai-test-key');
		t.is(config.model, 'grok-4');
	}
});

test('loadAiConfig loads XAI config with custom model', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'xai',
		UXLINT_AI_API_KEY: 'xai-test-key',
		UXLINT_AI_MODEL: 'grok-3',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadAiConfig();

	t.is(config.provider, 'xai');
	if (config.provider === 'xai') {
		t.is(config.apiKey, 'xai-test-key');
		t.is(config.model, 'grok-3');
	}
});

/**
 * AI Configuration Tests - Google
 */

test('loadAiConfig loads Google config with API key', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'google',
		UXLINT_AI_API_KEY: 'google-test-key',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadAiConfig();

	t.is(config.provider, 'google');
	if (config.provider === 'google') {
		t.is(config.apiKey, 'google-test-key');
		t.is(config.model, 'gemini-2.5-pro');
	}
});

test('loadAiConfig loads Google config with custom model', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'google',
		UXLINT_AI_API_KEY: 'google-test-key',
		UXLINT_AI_MODEL: 'gemini-1.5-pro',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadAiConfig();

	t.is(config.provider, 'google');
	if (config.provider === 'google') {
		t.is(config.apiKey, 'google-test-key');
		t.is(config.model, 'gemini-1.5-pro');
	}
});

/**
 * Error Cases
 */

test('loadAiConfig throws when provider is missing', t => {
	const env = createMockEnv({
		UXLINT_AI_API_KEY: 'test-key',
	});
	const envIO = new EnvIO(env);

	const error = t.throws(() => envIO.loadAiConfig(), {
		instanceOf: ConfigurationError,
	});

	t.true(
		error.message.includes(
			'UXLINT_AI_PROVIDER environment variable is required',
		),
	);
});

test('loadAiConfig throws when provider is invalid', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'invalid-provider',
		UXLINT_AI_API_KEY: 'test-key',
	});
	const envIO = new EnvIO(env);

	const error = t.throws(() => envIO.loadAiConfig(), {
		instanceOf: ConfigurationError,
	});

	t.true(error.message.includes('Invalid AI provider: invalid-provider'));
});

test('loadAiConfig throws when API key is missing for Anthropic', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'anthropic',
	});
	const envIO = new EnvIO(env);

	const error = t.throws(() => envIO.loadAiConfig(), {
		instanceOf: ConfigurationError,
	});

	t.true(
		error.message.includes(
			'UXLINT_AI_API_KEY environment variable is required for anthropic provider',
		),
	);
});

test('loadAiConfig throws when API key is missing for OpenAI', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'openai',
	});
	const envIO = new EnvIO(env);

	const error = t.throws(() => envIO.loadAiConfig(), {
		instanceOf: ConfigurationError,
	});

	t.true(
		error.message.includes(
			'UXLINT_AI_API_KEY environment variable is required for openai provider',
		),
	);
});

test('loadAiConfig throws when API key is missing for XAI', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'xai',
	});
	const envIO = new EnvIO(env);

	const error = t.throws(() => envIO.loadAiConfig(), {
		instanceOf: ConfigurationError,
	});

	t.true(
		error.message.includes(
			'UXLINT_AI_API_KEY environment variable is required for xai provider',
		),
	);
});

test('loadAiConfig throws when API key is missing for Google', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'google',
	});
	const envIO = new EnvIO(env);

	const error = t.throws(() => envIO.loadAiConfig(), {
		instanceOf: ConfigurationError,
	});

	t.true(
		error.message.includes(
			'UXLINT_AI_API_KEY environment variable is required for google provider',
		),
	);
});

test('loadAiConfig throws when API key is empty string', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'anthropic',
		UXLINT_AI_API_KEY: '   ',
	});
	const envIO = new EnvIO(env);

	const error = t.throws(() => envIO.loadAiConfig(), {
		instanceOf: ConfigurationError,
	});

	t.true(
		error.message.includes(
			'UXLINT_AI_API_KEY environment variable cannot be empty',
		),
	);
});

/**
 * Complete Configuration Tests
 */

test('loadConfig returns complete configuration', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'anthropic',
		UXLINT_AI_API_KEY: 'sk-ant-test-key',
		UXLINT_CLOUD_CLIENT_ID: 'custom-client',
	});
	const envIO = new EnvIO(env);
	const config = envIO.loadConfig();

	t.is(config.ai.provider, 'anthropic');
	if (config.ai.provider === 'anthropic') {
		t.is(config.ai.apiKey, 'sk-ant-test-key');
		t.is(config.ai.model, 'claude-sonnet-4-5-20250929');
	}

	t.is(config.cloud.clientId, 'custom-client');
	t.is(config.cloud.apiBaseUrl, 'https://hyvuqqbpiitcsjwztsyb.supabase.co');
	t.is(config.cloud.redirectUri, 'http://localhost:8080/callback');
});

test('loadConfig throws when AI config is invalid', t => {
	const env = createMockEnv({
		UXLINT_AI_PROVIDER: 'anthropic',
		// Missing UXLINT_AI_API_KEY
	});
	const envIO = new EnvIO(env);

	const error = t.throws(() => envIO.loadConfig(), {
		instanceOf: ConfigurationError,
	});

	t.true(error.message.includes('UXLINT_AI_API_KEY'));
});

/**
 * Singleton Instance Tests
 */

test('envIO singleton instance is exported', async t => {
	const {envIO} = await import(
		'../../../source/infrastructure/config/env-io.js'
	);
	t.truthy(envIO);
	t.is(typeof envIO.loadCloudConfig, 'function');
	t.is(typeof envIO.loadAiConfig, 'function');
	t.is(typeof envIO.loadConfig, 'function');
});
