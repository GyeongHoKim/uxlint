/**
 * Integration Test: Multi-Page Session (T027)
 *
 * Tests session maintenance across multiple page navigations without
 * reinitialization per User Story 3 requirements.
 */

import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {McpClient} from '../../source/mcp/client/mcp-client.js';
import {PlaywrightClient} from '../../source/mcp/client/playwright-client.js';

describe('T027: Multi-Page Session', () => {
	let mcpClient: McpClient;
	let playwrightClient: PlaywrightClient;

	beforeEach(() => {
		mcpClient = new McpClient('uxlint-multipage-test', '1.0.0');
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

	it('navigate to multiple pages without reinitialization', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		// Connect once
		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);
		expect(mcpClient.isConnected()).toBe(true);

		// Navigate to page A
		const resultA = await playwrightClient.navigate('https://example.com');
		expect(resultA.success).toBe(true);
		expect(mcpClient.isConnected()).toBe(true);

		// Take screenshot from page A
		const screenshotA = await playwrightClient.screenshot();
		expect(screenshotA.screenshot).toBeTruthy();
		expect(mcpClient.isConnected()).toBe(true);

		// Navigate to page B
		const resultB = await playwrightClient.navigate(
			'https://www.iana.org/domains/example',
		);
		expect(resultB.success).toBe(true);
		expect(mcpClient.isConnected()).toBe(true);

		// Take screenshot from page B
		const screenshotB = await playwrightClient.screenshot();
		expect(screenshotB.screenshot).toBeTruthy();
		expect(screenshotA.screenshot).not.toBe(screenshotB.screenshot);

		// Verify session maintained state throughout
		expect(mcpClient.isConnected()).toBe(true);
	}, 60_000);

	it('session maintains browser context across operations', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		// Navigate to page
		await playwrightClient.navigate('https://example.com');

		// Execute JavaScript to set a property
		await playwrightClient.evaluate(
			'() => { window.__testMarker = "uxlint-test"; }',
		);

		// Verify property persists
		const result = await playwrightClient.evaluate('() => window.__testMarker');
		expect(result).toBe('uxlint-test');
	}, 30_000);

	it('session handles rapid successive operations efficiently', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);
		await playwrightClient.navigate('https://example.com');

		const startTime = Date.now();

		// Perform 10 rapid operations
		for (let i = 0; i < 10; i++) {
			// eslint-disable-next-line no-await-in-loop
			const title = await playwrightClient.evaluate('() => document.title');
			expect(title).toBeTruthy();
		}

		const duration = Date.now() - startTime;

		expect(mcpClient.isConnected()).toBe(true);
		expect(duration).toBeLessThan(10_000);

		console.log(`\n10 rapid operations completed in ${duration}ms`);
	}, 30_000);
});
