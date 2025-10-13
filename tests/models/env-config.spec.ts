/**
 * Environment Configuration Tests
 * Validates environment variable loading and validation
 */

import process from 'node:process';
import {loadEnvConfig} from '../../source/models/env-config.js';

// Store original env vars to restore after tests
const originalEnv = {
	apiKey: process.env['UXLINT_ANTHROPIC_API_KEY'],
	model: process.env['UXLINT_AI_MODEL'],
};

afterEach(() => {
	// Restore original environment variables
	if (originalEnv.apiKey) {
		process.env['UXLINT_ANTHROPIC_API_KEY'] = originalEnv.apiKey;
	} else {
		delete process.env['UXLINT_ANTHROPIC_API_KEY'];
	}

	if (originalEnv.model) {
		process.env['UXLINT_AI_MODEL'] = originalEnv.model;
	} else {
		delete process.env['UXLINT_AI_MODEL'];
	}
});

test('loadEnvConfig throws error when UXLINT_ANTHROPIC_API_KEY is missing', () => {
	delete process.env['UXLINT_ANTHROPIC_API_KEY'];

	expect(() => loadEnvConfig()).toThrow(
		'UXLINT_ANTHROPIC_API_KEY environment variable is required',
	);
});

test('loadEnvConfig provides default model when UXLINT_AI_MODEL is not set', () => {
	process.env['UXLINT_ANTHROPIC_API_KEY'] = 'test_api_key';
	delete process.env['UXLINT_AI_MODEL'];

	const config = loadEnvConfig();

	expect(config.apiKey).toBe('test_api_key');
	expect(config.model).toBe('claude-3-5-sonnet-20241022');
});

test('loadEnvConfig uses custom model when UXLINT_AI_MODEL is set', () => {
	process.env['UXLINT_ANTHROPIC_API_KEY'] = 'test_api_key';
	process.env['UXLINT_AI_MODEL'] = 'claude-3-opus-20240229';

	const config = loadEnvConfig();

	expect(config.apiKey).toBe('test_api_key');
	expect(config.model).toBe('claude-3-opus-20240229');
});

test('loadEnvConfig returns valid config with all required fields', () => {
	process.env['UXLINT_ANTHROPIC_API_KEY'] = 'test_api_key';
	process.env['UXLINT_AI_MODEL'] = 'custom-model';

	const config = loadEnvConfig();

	expect(config).toHaveProperty('apiKey');
	expect(config).toHaveProperty('model');
	expect(typeof config.apiKey).toBe('string');
	expect(typeof config.model).toBe('string');
});

test('loadEnvConfig error message guides user to set environment variable', () => {
	delete process.env['UXLINT_ANTHROPIC_API_KEY'];

	expect(() => loadEnvConfig()).toThrow('.env file or environment');
});
