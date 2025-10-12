/**
 * Integration test for multiple operations (T025)
 * Tests 50 sequential operations for performance degradation (SC-008)
 * @packageDocumentation
 */

import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {McpClient} from '../../source/mcp/client/mcp-client.js';
import {PlaywrightClient} from '../../source/mcp/client/playwright-client.js';

describe('T025: Multiple Operation Types Integration', () => {
	let mcpClient: McpClient;
	let playwrightClient: PlaywrightClient;

	beforeEach(async () => {
		mcpClient = new McpClient('multi-op-test', '1.0.0');
		await mcpClient.connect('npx', ['@playwright/mcp@latest', '--headless']);
		playwrightClient = new PlaywrightClient(mcpClient);

		// Navigate to test page once
		await playwrightClient.navigate('https://example.com');
	}, 60_000);

	afterEach(async () => {
		if (mcpClient.isConnected()) {
			await mcpClient.close();
		}
	});

	it('performs all operation types sequentially on same page', async () => {
		// Navigate
		const navigateResult = await playwrightClient.navigate(
			'https://example.com',
		);
		expect(navigateResult.success).toBe(true);
		expect(navigateResult.url).toBeDefined();

		// Screenshot
		const screenshotResult = await playwrightClient.screenshot();
		expect(screenshotResult.screenshot).toBeDefined();
		expect(screenshotResult.width).toBeGreaterThan(0);
		expect(screenshotResult.height).toBeGreaterThan(0);

		// Snapshot
		const snapshotResult = await playwrightClient.getSnapshot();
		expect(snapshotResult.snapshot).toBeDefined();
		expect(snapshotResult.snapshot.length).toBeGreaterThan(0);

		// Evaluate
		const evaluateResult = await playwrightClient.evaluate('document.title');
		expect(evaluateResult).toBeDefined();

		console.log('\n=== All Operation Types Complete ===');
		console.log('✅ Navigate: Success');
		console.log('✅ Screenshot: Success');
		console.log('✅ Snapshot: Success');
		console.log('✅ Evaluate: Success');
	}, 120_000);

	it('verifies each operation returns correct data format', async () => {
		// Navigate - verify NavigateResult format
		const navigateResult = await playwrightClient.navigate(
			'https://example.com',
		);
		expect(navigateResult).toHaveProperty('success');
		expect(navigateResult).toHaveProperty('url');
		expect(typeof navigateResult.success).toBe('boolean');
		expect(typeof navigateResult.url).toBe('string');

		// Screenshot - verify ScreenshotResult format
		const screenshotResult = await playwrightClient.screenshot();
		expect(screenshotResult).toHaveProperty('screenshot');
		expect(screenshotResult).toHaveProperty('width');
		expect(screenshotResult).toHaveProperty('height');
		expect(typeof screenshotResult.screenshot).toBe('string');
		expect(typeof screenshotResult.width).toBe('number');
		expect(typeof screenshotResult.height).toBe('number');

		// Snapshot - verify SnapshotResult format
		const snapshotResult = await playwrightClient.getSnapshot();
		expect(snapshotResult).toHaveProperty('snapshot');
		expect(typeof snapshotResult.snapshot).toBe('string');

		// Evaluate - verify result is defined
		const evaluateResult = await playwrightClient.evaluate('document.title');
		expect(evaluateResult).toBeDefined();

		console.log('\n=== Data Format Verification Complete ===');
		console.log('✅ All operations return correct data formats');
	}, 120_000);

	it('meets SC-008: 50 sequential operations without performance degradation', async () => {
		const operationTimes: number[] = [];
		const operationCount = 50;

		console.log(
			`\n=== Testing ${operationCount} Sequential Operations (SC-008) ===`,
		);

		// Perform 50 operations sequentially (intentional for performance testing)
		for (let index = 0; index < operationCount; index++) {
			const start = Date.now();

			// Alternate between different operation types
			const operationType = index % 4;
			switch (operationType) {
				case 0: {
					// eslint-disable-next-line no-await-in-loop
					await playwrightClient.evaluate('document.title');
					break;
				}

				case 1: {
					// eslint-disable-next-line no-await-in-loop
					await playwrightClient.getSnapshot();
					break;
				}

				case 2: {
					// eslint-disable-next-line no-await-in-loop
					await playwrightClient.evaluate('window.location.href');
					break;
				}

				case 3: {
					// eslint-disable-next-line no-await-in-loop
					await playwrightClient.screenshot();
					break;
				}

				default: {
					// eslint-disable-next-line no-await-in-loop
					await playwrightClient.evaluate('document.title');
				}
			}

			const elapsed = Date.now() - start;
			operationTimes.push(elapsed);

			// Log progress every 10 operations
			if ((index + 1) % 10 === 0) {
				console.log(`Progress: ${index + 1}/${operationCount} operations`);
			}
		}

		// Analyze performance
		const firstTenAvg =
			operationTimes.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
		const lastTenAvg =
			operationTimes
				.slice(operationCount - 10, operationCount)
				.reduce((a, b) => a + b, 0) / 10;
		const degradation = ((lastTenAvg - firstTenAvg) / firstTenAvg) * 100;

		// SC-008: No significant performance degradation
		// Allow up to 20% degradation as acceptable
		expect(degradation).toBeLessThan(20);

		// Report metrics
		console.log('\n=== Performance Metrics ===');
		console.log(`First 10 operations average: ${firstTenAvg.toFixed(2)}ms`);
		console.log(`Last 10 operations average: ${lastTenAvg.toFixed(2)}ms`);
		console.log(`Performance degradation: ${degradation.toFixed(2)}%`);
		console.log(
			`SC-008 Result: ${
				degradation < 20 ? '✅ PASS' : '❌ FAIL'
			} (target: <20% degradation)`,
		);
	}, 300_000); // 5 minute timeout for 50 operations

	it('handles mixed operation sequences without errors', async () => {
		const operations = [
			async () => playwrightClient.evaluate('document.title'),
			async () => playwrightClient.getSnapshot(),
			async () => playwrightClient.screenshot(),
			async () => playwrightClient.evaluate('window.location.href'),
			async () => playwrightClient.getSnapshot(),
		];

		let successCount = 0;

		for (const operation of operations) {
			try {
				// eslint-disable-next-line no-await-in-loop
				const result = await operation();
				expect(result).toBeDefined();
				successCount++;
			} catch (error) {
				throw new Error(`Operation failed: ${(error as Error).message}`);
			}
		}

		expect(successCount).toBe(operations.length);

		console.log('\n=== Mixed Operation Sequence Complete ===');
		console.log(`✅ ${successCount}/${operations.length} operations succeeded`);
	}, 120_000);

	it('maintains consistent performance across operation types', async () => {
		const operationMetrics = {
			evaluate: [] as number[],
			snapshot: [] as number[],
			screenshot: [] as number[],
		};

		// Perform each operation type 10 times
		const iterations = 10;

		// Evaluate operations (sequential for performance measurement)
		for (let index = 0; index < iterations; index++) {
			const start = Date.now();
			// eslint-disable-next-line no-await-in-loop
			await playwrightClient.evaluate('document.title');
			operationMetrics.evaluate.push(Date.now() - start);
		}

		// Snapshot operations (sequential for performance measurement)
		for (let index = 0; index < iterations; index++) {
			const start = Date.now();
			// eslint-disable-next-line no-await-in-loop
			await playwrightClient.getSnapshot();
			operationMetrics.snapshot.push(Date.now() - start);
		}

		// Screenshot operations (sequential for performance measurement)
		for (let index = 0; index < iterations; index++) {
			const start = Date.now();
			// eslint-disable-next-line no-await-in-loop
			await playwrightClient.screenshot();
			operationMetrics.screenshot.push(Date.now() - start);
		}

		// Calculate averages
		const evaluateAvg =
			operationMetrics.evaluate.reduce((a, b) => a + b, 0) / iterations;
		const snapshotAvg =
			operationMetrics.snapshot.reduce((a, b) => a + b, 0) / iterations;
		const screenshotAvg =
			operationMetrics.screenshot.reduce((a, b) => a + b, 0) / iterations;

		// Verify operations meet their targets
		expect(evaluateAvg).toBeLessThan(5000); // SC-006
		expect(snapshotAvg).toBeLessThan(2000); // SC-005
		expect(screenshotAvg).toBeLessThan(3000); // SC-004

		// Report
		console.log('\n=== Operation Type Performance ===');
		console.log(
			`Evaluate average:   ${evaluateAvg.toFixed(2)}ms (target: <5000ms)`,
		);
		console.log(
			`Snapshot average:   ${snapshotAvg.toFixed(2)}ms (target: <2000ms)`,
		);
		console.log(
			`Screenshot average: ${screenshotAvg.toFixed(2)}ms (target: <3000ms)`,
		);
		console.log('✅ All operation types meet performance targets');
	}, 180_000);
});
