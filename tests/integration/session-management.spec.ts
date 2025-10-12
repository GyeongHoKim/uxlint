/**
 * Integration Test: Session Management (T026)
 *
 * Tests session initialization, capabilities query, and readiness checks
 * per User Story 3 requirements.
 *
 * Success Criteria:
 * - SC-001: Session starts within 5 seconds
 * - SC-002: Capabilities query completes within 2 seconds
 */

import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {McpClient} from '../../source/mcp/client/mcp-client.js';

describe('T026: Session Management', () => {
	let client: McpClient;

	beforeEach(() => {
		client = new McpClient('uxlint-session-test', '1.0.0');
	});

	afterEach(async () => {
		if (client.isConnected()) {
			await client.close();
		}
	});

	it('session initialization completes within 5 seconds', async () => {
		const startTime = Date.now();

		await client.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);
		const initDuration = Date.now() - startTime;

		expect(client.isConnected()).toBe(true);
		expect(initDuration).toBeLessThan(5000); // SC-001

		console.log(
			`\nSession initialization: ${initDuration}ms (target: <5000ms)`,
		);
	}, 30_000);

	it('capabilities query completes within 2 seconds', async () => {
		await client.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		const startTime = Date.now();
		const tools = await client.listTools();
		const queryDuration = Date.now() - startTime;

		expect(Array.isArray(tools)).toBe(true);
		expect(tools.length).toBeGreaterThan(0);
		expect(queryDuration).toBeLessThan(2000); // SC-002

		console.log(`\nCapabilities query: ${queryDuration}ms (target: <2000ms)`);
	}, 30_000);

	it('session readiness check returns correct state', async () => {
		// Before connection
		expect(client.isConnected()).toBe(false);

		// After connection
		await client.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);
		expect(client.isConnected()).toBe(true);

		// Verify can call tools when ready
		const tools = await client.listTools();
		expect(tools.length).toBeGreaterThan(0);

		// After close
		await client.close();
		expect(client.isConnected()).toBe(false);
	}, 30_000);

	it('multiple sessions can be created sequentially', async () => {
		const client1 = new McpClient('uxlint-session-1', '1.0.0');
		const client2 = new McpClient('uxlint-session-2', '1.0.0');

		try {
			// First session
			await client1.connect('npx', [
				'@playwright/mcp@latest',
				'--browser',
				'chrome',
				'--headless',
			]);
			expect(client1.isConnected()).toBe(true);

			const tools1 = await client1.listTools();
			expect(tools1.length).toBeGreaterThan(0);

			// Close first session
			await client1.close();
			expect(client1.isConnected()).toBe(false);

			// Second session
			await client2.connect('npx', [
				'@playwright/mcp@latest',
				'--browser',
				'chrome',
				'--headless',
			]);
			expect(client2.isConnected()).toBe(true);

			const tools2 = await client2.listTools();
			expect(tools2.length).toBeGreaterThan(0);
		} finally {
			try {
				await client1.close();
			} catch {
				/* Ignore cleanup errors */
			}

			try {
				await client2.close();
			} catch {
				/* Ignore cleanup errors */
			}
		}
	}, 60_000);
});
