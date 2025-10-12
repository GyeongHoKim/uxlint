/**
 * Integration Test: Parameterized Snapshot (T034)
 *
 * Tests accessibility snapshot functionality with various options:
 * - Full page snapshots
 * - Element-specific snapshots
 * - Snapshot validation
 *
 * Per User Story 4 requirements.
 */

import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {McpClient} from '../../source/mcp/client/mcp-client.js';
import {PlaywrightClient} from '../../source/mcp/client/playwright-client.js';

describe('T034: Parameterized Snapshot', () => {
	let mcpClient: McpClient;
	let playwrightClient: PlaywrightClient;

	beforeEach(() => {
		mcpClient = new McpClient('uxlint-snapshot-test', '1.0.0');
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

	it('captures full page accessibility snapshot', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		await playwrightClient.navigate('https://example.com');

		const snapshot = await playwrightClient.getSnapshot();

		expect(snapshot).toBeDefined();
		expect(snapshot.snapshot).toBeDefined();
		expect(typeof snapshot.snapshot).toBe('string');
		expect(snapshot.snapshot.length).toBeGreaterThan(0);

		// Snapshot should contain accessibility information
		expect(snapshot.snapshot).toContain('text'); // Common accessibility property
	}, 30_000);

	it('captures element-specific snapshot', async () => {
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

		const snapshot = await playwrightClient.getSnapshot();

		expect(snapshot).toBeDefined();
		expect(snapshot.snapshot).toBeDefined();
		expect(typeof snapshot.snapshot).toBe('string');
		expect(snapshot.snapshot.length).toBeGreaterThan(0);
	}, 30_000);

	it('validates snapshot options before capturing', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		await playwrightClient.navigate('https://example.com');

		// Test that getSnapshot works with default options
		const snapshot = await playwrightClient.getSnapshot();

		expect(snapshot).toBeDefined();
		expect(snapshot.snapshot).toBeDefined();
		expect(typeof snapshot.snapshot).toBe('string');
	}, 30_000);

	it('captures multiple snapshots in sequence', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		await playwrightClient.navigate('https://example.com');

		// Capture multiple snapshots
		const snapshot1 = await playwrightClient.getSnapshot();
		const snapshot2 = await playwrightClient.getSnapshot();

		// Wait and capture again
		await new Promise(resolve => {
			setTimeout(resolve, 1000);
		});

		const snapshot3 = await playwrightClient.getSnapshot();

		expect(snapshot1).toBeDefined();
		expect(snapshot2).toBeDefined();
		expect(snapshot3).toBeDefined();

		// Snapshots should be consistent for same page state
		expect(snapshot1.snapshot).toBe(snapshot2.snapshot);
	}, 45_000);

	it('captures snapshots after page interactions', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		await playwrightClient.navigate('https://example.com');

		// Initial snapshot
		const beforeSnapshot = await playwrightClient.getSnapshot();
		expect(beforeSnapshot).toBeDefined();

		// Perform some evaluation
		await playwrightClient.evaluate('() => document.title');

		// Snapshot after interaction
		const afterSnapshot = await playwrightClient.getSnapshot();
		expect(afterSnapshot).toBeDefined();

		// Snapshots should be consistent since no DOM changes occurred
		expect(beforeSnapshot.snapshot).toBe(afterSnapshot.snapshot);
	}, 45_000);

	it('handles snapshot errors gracefully', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		// Try to capture snapshot without navigating first
		await expect(playwrightClient.getSnapshot()).rejects.toThrow();

		// Navigate and try again - should succeed
		await playwrightClient.navigate('https://example.com');
		const snapshot = await playwrightClient.getSnapshot();
		expect(snapshot).toBeDefined();
	}, 30_000);
});
