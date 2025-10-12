/**
 * Integration Test: Parameter Validation Error Handling (T035)
 *
 * Tests error handling for invalid parameters across MCP client operations:
 * - Invalid URLs
 * - Invalid CSS selectors
 * - Invalid scripts
 * - Invalid timeouts
 * - Clear error messages per User Story 4 requirements
 */

import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {McpClient} from '../../source/mcp/client/mcp-client.js';
import {PlaywrightClient} from '../../source/mcp/client/playwright-client.js';
import {
	ValidationError,
	InvalidUrlError,
	InvalidSelectorError,
	InvalidScriptError,
	InvalidTimeoutError,
} from '../../source/mcp/client/errors.js';

describe('T035: Parameter Validation Error Handling', () => {
	let mcpClient: McpClient;
	let playwrightClient: PlaywrightClient;

	beforeEach(async () => {
		mcpClient = new McpClient('uxlint-error-test', '1.0.0');
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);
	});

	afterEach(async () => {
		if (playwrightClient) {
			try {
				await playwrightClient.close();
			} catch {
				/* Ignore cleanup errors */
			}
		}

		if (mcpClient.isConnected()) {
			await mcpClient.close();
		}
	});

	describe('URL validation errors', () => {
		it('rejects empty URL', async () => {
			await expect(playwrightClient.navigate('')).rejects.toThrow(
				ValidationError,
			);

			try {
				await playwrightClient.navigate('');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidUrlError);
				expect((error as Error).message).toContain(
					'URL must be a non-empty string',
				);
			}
		}, 30_000);

		it('rejects malformed URL', async () => {
			await expect(playwrightClient.navigate('not-a-url')).rejects.toThrow(
				ValidationError,
			);

			try {
				await playwrightClient.navigate('not-a-url');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidUrlError);
				expect((error as Error).message).toContain('Invalid URL format');
			}
		}, 30_000);

		it('rejects non-HTTP(S) protocols', async () => {
			await expect(
				playwrightClient.navigate('ftp://example.com'),
			).rejects.toThrow(ValidationError);

			try {
				await playwrightClient.navigate('ftp://example.com');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidUrlError);
				expect((error as Error).message).toContain(
					'URL must use http or https protocol',
				);
			}
		}, 30_000);

		it('rejects javascript: protocol URLs', async () => {
			await expect(
				// eslint-disable-next-line no-script-url
				playwrightClient.navigate('javascript:alert(1)'),
			).rejects.toThrow(ValidationError);

			try {
				// eslint-disable-next-line no-script-url
				await playwrightClient.navigate('javascript:alert(1)');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidUrlError);
			}
		}, 30_000);
	});

	describe('CSS selector validation errors', () => {
		it('rejects empty selector in screenshot', async () => {
			await playwrightClient.navigate('https://example.com');

			await expect(
				playwrightClient.screenshot({
					element: '',
				}),
			).rejects.toThrow(ValidationError);

			try {
				await playwrightClient.screenshot({
					element: '',
				});
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidSelectorError);
				expect((error as Error).message).toContain(
					'Selector must be a non-empty string',
				);
			}
		}, 30_000);

		it('rejects whitespace-only selector', async () => {
			await playwrightClient.navigate('https://example.com');

			await expect(
				playwrightClient.screenshot({
					element: '   ',
				}),
			).rejects.toThrow(ValidationError);

			try {
				await playwrightClient.screenshot({
					element: '   ',
				});
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidSelectorError);
				expect((error as Error).message).toContain(
					'Selector cannot be empty or whitespace only',
				);
			}
		}, 30_000);

		it('rejects XPath selectors', async () => {
			await playwrightClient.navigate('https://example.com');

			await expect(
				playwrightClient.screenshot({
					element: '//div',
				}),
			).rejects.toThrow(ValidationError);

			try {
				await playwrightClient.screenshot({
					element: '//div',
				});
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidSelectorError);
				expect((error as Error).message).toContain(
					'XPath selectors are not supported',
				);
			}
		}, 30_000);
	});

	describe('JavaScript safety validation errors', () => {
		it('rejects scripts with require()', async () => {
			await playwrightClient.navigate('https://example.com');

			await expect(playwrightClient.evaluate("require('fs')")).rejects.toThrow(
				ValidationError,
			);

			try {
				await playwrightClient.evaluate("require('fs')");
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidScriptError);
				expect((error as Error).message).toContain(
					'Script cannot use require()',
				);
			}
		}, 30_000);

		it('rejects scripts with import statements', async () => {
			await playwrightClient.navigate('https://example.com');

			await expect(
				playwrightClient.evaluate('import fs from "fs"'),
			).rejects.toThrow(ValidationError);

			try {
				await playwrightClient.evaluate('import fs from "fs"');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidScriptError);
				expect((error as Error).message).toContain(
					'Script cannot use import statements',
				);
			}
		}, 30_000);

		it('rejects scripts with eval()', async () => {
			await playwrightClient.navigate('https://example.com');

			await expect(
				playwrightClient.evaluate('eval("malicious code")'),
			).rejects.toThrow(ValidationError);

			try {
				await playwrightClient.evaluate('eval("malicious code")');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidScriptError);
				expect((error as Error).message).toContain('Script cannot use eval()');
			}
		}, 30_000);

		it('rejects empty scripts', async () => {
			await playwrightClient.navigate('https://example.com');

			await expect(playwrightClient.evaluate('')).rejects.toThrow(
				ValidationError,
			);

			try {
				await playwrightClient.evaluate('');
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidScriptError);
				expect((error as Error).message).toContain(
					'Script must be a non-empty string',
				);
			}
		}, 30_000);

		it('rejects overly long scripts', async () => {
			await playwrightClient.navigate('https://example.com');

			const longScript = 'a'.repeat(10_001);

			await expect(playwrightClient.evaluate(longScript)).rejects.toThrow(
				ValidationError,
			);

			try {
				await playwrightClient.evaluate(longScript);
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidScriptError);
			}
		}, 30_000);
	});

	describe('Timeout validation errors', () => {
		it('rejects timeout below minimum', async () => {
			const options = {
				timeout: 500, // Below 1000ms minimum
			};

			await expect(
				playwrightClient.navigate('https://example.com', options),
			).rejects.toThrow(ValidationError);

			try {
				await playwrightClient.navigate('https://example.com', options);
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidTimeoutError);
				expect((error as Error).message).toContain(
					'Timeout must be at least 1000ms',
				);
			}
		}, 30_000);

		it('rejects timeout above maximum', async () => {
			const options = {
				timeout: 400_000, // Above 300000ms maximum
			};

			await expect(
				playwrightClient.navigate('https://example.com', options),
			).rejects.toThrow(ValidationError);

			try {
				await playwrightClient.navigate('https://example.com', options);
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidTimeoutError);
				expect((error as Error).message).toContain(
					'Timeout cannot exceed 300000ms',
				);
			}
		}, 30_000);

		it('rejects invalid timeout values', async () => {
			const options = {
				timeout: Number.NaN,
			};

			await expect(
				playwrightClient.navigate('https://example.com', options),
			).rejects.toThrow(ValidationError);

			try {
				await playwrightClient.navigate('https://example.com', options);
			} catch (error) {
				expect(error).toBeInstanceOf(InvalidTimeoutError);
				expect((error as Error).message).toContain(
					'Timeout must be a valid number',
				);
			}
		}, 30_000);
	});

	describe('Error message clarity', () => {
		it('provides actionable error messages for developers', async () => {
			const errors: Array<{message: string; expected: string}> = [];

			// Test various invalid inputs
			try {
				await playwrightClient.navigate('');
			} catch (error) {
				errors.push({
					message: (error as Error).message,
					expected: 'non-empty',
				});
			}

			try {
				await playwrightClient.navigate('https://example.com');
				await playwrightClient.screenshot({element: '//xpath'});
			} catch (error) {
				errors.push({
					message: (error as Error).message,
					expected: 'CSS selectors',
				});
			}

			// All error messages should be helpful
			for (const {message, expected} of errors) {
				expect(message).toBeTruthy();
				expect(message.length).toBeGreaterThan(10);
				expect(message.toLowerCase()).toContain(expected.toLowerCase());
			}
		}, 45_000);
	});
});
