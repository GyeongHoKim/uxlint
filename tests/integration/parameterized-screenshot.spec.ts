/**
 * Integration Test: Parameterized Screenshot (T033)
 *
 * Tests screenshot functionality with various optional parameters:
 * - Element-specific screenshots
 * - Full page screenshots
 * - Format options (PNG/JPEG)
 *
 * Per User Story 4 requirements.
 */

import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {McpClient} from '../../source/mcp/client/mcp-client.js';
import {PlaywrightClient} from '../../source/mcp/client/playwright-client.js';

describe('T033: Parameterized Screenshot', () => {
	let mcpClient: McpClient;
	let playwrightClient: PlaywrightClient;

	beforeEach(() => {
		mcpClient = new McpClient('uxlint-screenshot-test', '1.0.0');
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

	it('captures viewport screenshot with default options', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		await playwrightClient.navigate('https://example.com');

		const result = await playwrightClient.screenshot();

		expect(result).toBeDefined();
		expect(typeof result).toBe('string'); // Base64 or path
	}, 30_000);

	it('captures full page screenshot', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		await playwrightClient.navigate('https://example.com');

		const result = await playwrightClient.screenshot({
			fullPage: true,
		});

		expect(result).toBeDefined();
		expect(typeof result).toBe('string');
	}, 30_000);

	it('captures element screenshot with selector', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		await playwrightClient.navigate('https://example.com');

		// Wait for element to be available
		await new Promise(resolve => {
			setTimeout(resolve, 1000);
		});

		const result = await playwrightClient.screenshot({
			element: 'h1',
		});

		expect(result).toBeDefined();
		expect(typeof result).toBe('string');
	}, 30_000);

	it('captures screenshot in different formats', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		await playwrightClient.navigate('https://example.com');

		// Test PNG format (default)
		const pngResult = await playwrightClient.screenshot({
			type: 'png',
		});

		expect(pngResult).toBeDefined();
		expect(typeof pngResult).toBe('string');

		// Test JPEG format
		const jpegResult = await playwrightClient.screenshot({
			type: 'jpeg',
		});

		expect(jpegResult).toBeDefined();
		expect(typeof jpegResult).toBe('string');
	}, 30_000);

	it('validates screenshot options before capturing', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		await playwrightClient.navigate('https://example.com');

		// Invalid selector should throw validation error
		await expect(
			playwrightClient.screenshot({
				element: '', // Empty selector
			}),
		).rejects.toThrow();

		// XPath selector should throw validation error
		await expect(
			playwrightClient.screenshot({
				element: '//div', // XPath not supported
			}),
		).rejects.toThrow();
	}, 30_000);

	it('captures multiple screenshots in sequence', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		await playwrightClient.navigate('https://example.com');

		// Capture multiple screenshots
		const screenshot1 = await playwrightClient.screenshot();
		const screenshot2 = await playwrightClient.screenshot({
			fullPage: true,
		});
		const screenshot3 = await playwrightClient.screenshot();

		expect(screenshot1).toBeDefined();
		expect(screenshot2).toBeDefined();
		expect(screenshot3).toBeDefined();
	}, 45_000);
});
