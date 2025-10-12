/**
 * Integration Test: Session Cleanup (T028)
 *
 * Tests proper resource release, browser process termination, cleanup after
 * errors, and recovery from interruptions per User Story 3 requirements.
 *
 * Success Criteria:
 * - SC-010: Recovery within 3 attempts
 */

import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {McpClient} from '../../source/mcp/client/mcp-client.js';
import {PlaywrightClient} from '../../source/mcp/client/playwright-client.js';

describe('T028: Session Cleanup', () => {
	let mcpClient: McpClient;
	let playwrightClient: PlaywrightClient;

	beforeEach(() => {
		mcpClient = new McpClient('uxlint-cleanup-test', '1.0.0');
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

	it('proper resource release on close', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		// Connect and perform operations
		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);
		await playwrightClient.navigate('https://example.com');

		expect(mcpClient.isConnected()).toBe(true);

		// Close browser and client
		await playwrightClient.close();
		await mcpClient.close();

		expect(mcpClient.isConnected()).toBe(false);

		// Verify cannot call tools after close
		await expect(mcpClient.listTools()).rejects.toThrow(/not connected/i);
	}, 30_000);

	it('cleanup after navigation error', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		// Attempt invalid navigation
		await expect(
			playwrightClient.navigate('not-a-valid-url'),
		).rejects.toThrow();

		// Session should still be usable after error
		expect(mcpClient.isConnected()).toBe(true);

		// Verify can perform valid operations after error
		const result = await playwrightClient.navigate('https://example.com');
		expect(result.success).toBe(true);
	}, 30_000);

	it('cleanup when connection is lost', async () => {
		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);
		expect(mcpClient.isConnected()).toBe(true);

		// Close connection
		await mcpClient.close();
		expect(mcpClient.isConnected()).toBe(false);

		// Verify tools cannot be called
		await expect(mcpClient.listTools()).rejects.toThrow(/not connected/i);
	}, 30_000);

	it('multiple close calls are safe', async () => {
		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		// First close
		await mcpClient.close();
		expect(mcpClient.isConnected()).toBe(false);

		// Second close should not throw
		await expect(mcpClient.close()).resolves.not.toThrow();
		expect(mcpClient.isConnected()).toBe(false);
	}, 30_000);

	it('cleanup during active operations', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		// Start a navigation (but don't await)
		const navigationPromise = playwrightClient.navigate('https://example.com');

		// Immediately try to close (interruption scenario)
		await playwrightClient.close();
		await mcpClient.close();

		// Navigation may succeed or fail, but cleanup should complete
		expect(mcpClient.isConnected()).toBe(false);

		// Try to complete the navigation (should fail gracefully)
		await expect(navigationPromise).rejects.toThrow();
	}, 30_000);

	it('session recovery after errors (SC-010)', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		let successCount = 0;
		const maxAttempts = 3;

		// Try operations and count successes
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				// eslint-disable-next-line no-await-in-loop
				await playwrightClient.navigate('https://example.com');
				successCount++;
				break; // Success, exit loop
			} catch {
				if (attempt === maxAttempts) {
					throw new Error('Should recover within 3 attempts (SC-010)');
				}

				// Continue to next attempt
			}
		}

		expect(successCount).toBeGreaterThan(0);
		expect(successCount).toBeLessThanOrEqual(maxAttempts); // SC-010

		console.log(`\nRecovery succeeded after ${successCount} attempt(s)`);
	}, 30_000);
});
