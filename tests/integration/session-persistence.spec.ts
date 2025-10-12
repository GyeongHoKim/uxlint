/**
 * Integration Test: Session Persistence (T031)
 *
 * Tests 50+ operations without performance degradation per User Story 3 requirements.
 *
 * Success Criteria:
 * - SC-008: 50+ operations without performance degradation
 */

import process from 'node:process';
import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {McpClient} from '../../source/mcp/client/mcp-client.js';
import {PlaywrightClient} from '../../source/mcp/client/playwright-client.js';
import {SessionManager} from '../../source/models/session-manager.js';

describe('T031: Session Persistence', () => {
	let mcpClient: McpClient;
	let playwrightClient: PlaywrightClient;
	let sessionManager: SessionManager;

	beforeEach(() => {
		mcpClient = new McpClient('uxlint-persistence-test', '1.0.0');
		sessionManager = new SessionManager('persistence-test-session');
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

		sessionManager.close();
	});

	it('performs 50+ operations without performance degradation (SC-008)', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		// Initialize session
		sessionManager.initialize();
		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);
		sessionManager.ready();

		// Navigate to test page once
		await playwrightClient.navigate('https://example.com');

		const operationCount = 50;
		const operationDurations: number[] = [];

		// Perform 50 sequential operations
		for (let i = 0; i < operationCount; i++) {
			const opId = sessionManager.startOperation('browser_evaluate');
			const startTime = Date.now();

			try {
				// eslint-disable-next-line no-await-in-loop
				await playwrightClient.evaluate('() => document.title');
				const duration = Date.now() - startTime;
				operationDurations.push(duration);
				sessionManager.completeOperation(opId, 'success');
			} catch (error) {
				sessionManager.completeOperation(
					opId,
					'error',
					error instanceof Error ? error.message : 'Unknown error',
				);
				throw error;
			}
		}

		// Verify all operations succeeded
		expect(sessionManager.getOperationCount()).toBe(operationCount);
		expect(sessionManager.getOperationCount('success')).toBe(operationCount);
		expect(sessionManager.getOperationCount('error')).toBe(0);

		// Check for performance degradation
		expect(sessionManager.hasPerformanceDegraded()).toBe(false);

		// Calculate performance metrics
		const firstTen = operationDurations.slice(0, 10);
		const lastTen = operationDurations.slice(-10);

		const firstAvg = firstTen.reduce((sum, d) => sum + d, 0) / firstTen.length;
		const lastAvg = lastTen.reduce((sum, d) => sum + d, 0) / lastTen.length;

		// Last 10 operations should not be significantly slower than first 10
		// Allow up to 50% degradation
		expect(lastAvg).toBeLessThan(firstAvg * 1.5);

		console.log('\n=== Performance Metrics (SC-008) ===');
		console.log(`Total operations: ${operationCount}`);
		console.log(`First 10 average: ${firstAvg.toFixed(2)}ms`);
		console.log(`Last 10 average: ${lastAvg.toFixed(2)}ms`);
		console.log(
			`Overall average: ${sessionManager
				.getAverageOperationDuration()
				?.toFixed(2)}ms`,
		);
		console.log(
			`Performance degraded: ${sessionManager.hasPerformanceDegraded()}`,
		);
	}, 120_000); // 2 minute timeout for 50 operations

	it('monitors memory usage over session lifetime', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		sessionManager.initialize();
		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);
		sessionManager.ready();

		await playwrightClient.navigate('https://example.com');

		const initialMemory = process.memoryUsage().heapUsed;

		// Perform operations
		for (let i = 0; i < 25; i++) {
			const opId = sessionManager.startOperation('browser_evaluate');
			try {
				// eslint-disable-next-line no-await-in-loop
				await playwrightClient.evaluate('() => document.title');
				sessionManager.completeOperation(opId, 'success');
			} catch (error) {
				sessionManager.completeOperation(
					opId,
					'error',
					error instanceof Error ? error.message : 'Unknown error',
				);
			}
		}

		const finalMemory = process.memoryUsage().heapUsed;
		const memoryIncrease = finalMemory - initialMemory;
		const memoryIncreaseMb = memoryIncrease / 1024 / 1024;

		// Memory should not grow excessively (allow up to 50MB increase)
		expect(memoryIncreaseMb).toBeLessThan(50);

		console.log('\n=== Memory Usage ===');
		console.log(`Initial: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`);
		console.log(`Final: ${(finalMemory / 1024 / 1024).toFixed(2)}MB`);
		console.log(`Increase: ${memoryIncreaseMb.toFixed(2)}MB`);
	}, 90_000);

	it('verifies consistent performance metrics across session', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		sessionManager.initialize();
		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);
		sessionManager.ready();

		await playwrightClient.navigate('https://example.com');

		// Perform operations
		for (let i = 0; i < 30; i++) {
			const opId = sessionManager.startOperation('browser_evaluate');
			// eslint-disable-next-line no-await-in-loop
			await playwrightClient.evaluate('() => document.title');
			sessionManager.completeOperation(opId, 'success');
		}

		// Check session health
		const health = sessionManager.getHealth(mcpClient.isConnected());

		expect(health.healthy).toBe(true);
		expect(health.connected).toBe(true);
		expect(health.successfulOperations).toBe(30);
		expect(health.failedOperations).toBe(0);
		expect(health.uptime).toBeGreaterThan(0);

		// Check average operation duration
		const avgDuration = sessionManager.getAverageOperationDuration();
		expect(avgDuration).toBeDefined();
		expect(avgDuration).toBeGreaterThan(0);

		console.log('\n=== Session Health ===');
		console.log(`Healthy: ${health.healthy}`);
		console.log(`Connected: ${health.connected}`);
		console.log(`Successful operations: ${health.successfulOperations}`);
		console.log(`Failed operations: ${health.failedOperations}`);
		console.log(`Uptime: ${health.uptime}ms`);
		console.log(`Average operation duration: ${avgDuration?.toFixed(2)}ms`);
	}, 90_000);

	it('handles session state transitions correctly', async () => {
		expect(sessionManager.getState()).toBe('closed');

		sessionManager.initialize();
		expect(sessionManager.getState()).toBe('initializing');

		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);

		sessionManager.ready();
		expect(sessionManager.getState()).toBe('ready');

		sessionManager.close();
		expect(sessionManager.getState()).toBe('closed');
	}, 30_000);

	it('tracks operation history accurately', async () => {
		playwrightClient = new PlaywrightClient(mcpClient);

		sessionManager.initialize();
		await mcpClient.connect('npx', [
			'@playwright/mcp@latest',
			'--browser',
			'chrome',
			'--headless',
		]);
		sessionManager.ready();

		await playwrightClient.navigate('https://example.com');

		// Perform mix of operations
		const evaluateOp = sessionManager.startOperation('browser_evaluate');
		await playwrightClient.evaluate('() => document.title');
		sessionManager.completeOperation(evaluateOp, 'success');

		const screenshotOp = sessionManager.startOperation(
			'browser_take_screenshot',
		);
		await playwrightClient.screenshot();
		sessionManager.completeOperation(screenshotOp, 'success');

		const snapshotOp = sessionManager.startOperation('browser_snapshot');
		await playwrightClient.getSnapshot();
		sessionManager.completeOperation(snapshotOp, 'success');

		// Verify operation history
		const operations = sessionManager.getOperations();
		expect(operations).toHaveLength(3);

		expect(operations[0]?.toolName).toBe('browser_evaluate');
		expect(operations[0]?.status).toBe('success');
		expect(operations[0]?.duration).toBeDefined();

		expect(operations[1]?.toolName).toBe('browser_take_screenshot');
		expect(operations[1]?.status).toBe('success');

		expect(operations[2]?.toolName).toBe('browser_snapshot');
		expect(operations[2]?.status).toBe('success');

		console.log('\n=== Operation History ===');
		for (const op of operations) {
			console.log(`${op.toolName}: ${op.status} (${op.duration}ms)`);
		}
	}, 30_000);
});
