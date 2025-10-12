/**
 * Integration test for browser operations (T022)
 * Tests real browser operations with performance metrics
 * @packageDocumentation
 */

import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {McpClient} from '../../source/mcp/client/mcp-client.js';
import {PlaywrightClient} from '../../source/mcp/client/playwright-client.js';

describe('T022: Browser Operations Integration', () => {
	let mcpClient: McpClient;
	let playwrightClient: PlaywrightClient;

	beforeEach(async () => {
		mcpClient = new McpClient('browser-ops-test', '1.0.0');
		await mcpClient.connect('npx', ['@playwright/mcp@latest', '--headless']);
		playwrightClient = new PlaywrightClient(mcpClient);
	}, 30_000);

	afterEach(async () => {
		if (mcpClient.isConnected()) {
			await mcpClient.close();
		}
	});

	it('completes navigate → screenshot flow', async () => {
		// Navigate to page
		const navigateStart = Date.now();
		const navigateResult = await playwrightClient.navigate(
			'https://example.com',
		);
		const navigateTime = Date.now() - navigateStart;

		expect(navigateResult.success).toBe(true);
		expect(navigateResult.url).toContain('example.com');

		// Take screenshot
		const screenshotStart = Date.now();
		const screenshotResult = await playwrightClient.screenshot();
		const screenshotTime = Date.now() - screenshotStart;

		expect(screenshotResult.screenshot).toBeDefined();
		expect(screenshotResult.width).toBeGreaterThan(0);
		expect(screenshotResult.height).toBeGreaterThan(0);

		// Report metrics
		console.log('\n=== Navigate → Screenshot Flow ===');
		console.log(`Navigation: ${navigateTime}ms`);
		console.log(`Screenshot: ${screenshotTime}ms`);
	}, 60_000);

	it('completes navigate → getSnapshot flow', async () => {
		// Navigate to page
		const navigateStart = Date.now();
		await playwrightClient.navigate('https://example.com');
		const navigateTime = Date.now() - navigateStart;

		// Get accessibility snapshot
		const snapshotStart = Date.now();
		const snapshotResult = await playwrightClient.getSnapshot();
		const snapshotTime = Date.now() - snapshotStart;

		expect(snapshotResult.snapshot).toBeDefined();
		expect(snapshotResult.snapshot.length).toBeGreaterThan(0);

		// Report metrics
		console.log('\n=== Navigate → Snapshot Flow ===');
		console.log(`Navigation: ${navigateTime}ms`);
		console.log(`Snapshot: ${snapshotTime}ms`);
	}, 60_000);

	it('completes navigate → evaluate flow', async () => {
		// Navigate to page
		const navigateStart = Date.now();
		await playwrightClient.navigate('https://example.com');
		const navigateTime = Date.now() - navigateStart;

		// Evaluate JavaScript
		const evaluateStart = Date.now();
		const result = await playwrightClient.evaluate('document.title');
		const evaluateTime = Date.now() - evaluateStart;

		expect(result).toBeDefined();

		// Report metrics
		console.log('\n=== Navigate → Evaluate Flow ===');
		console.log(`Navigation: ${navigateTime}ms`);
		console.log(`Evaluate: ${evaluateTime}ms`);
	}, 60_000);

	it('meets SC-003: Page navigation < 10s', async () => {
		const start = Date.now();
		await playwrightClient.navigate('https://example.com');
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(10_000);
		console.log(
			`\nSC-003 Result: Navigation completed in ${elapsed}ms (target: <10000ms)`,
		);
	}, 30_000);

	it('meets SC-004: Screenshot capture < 3s', async () => {
		// Navigate first
		await playwrightClient.navigate('https://example.com');

		// Measure screenshot time
		const start = Date.now();
		await playwrightClient.screenshot();
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(3000);
		console.log(
			`\nSC-004 Result: Screenshot captured in ${elapsed}ms (target: <3000ms)`,
		);
	}, 30_000);

	it('meets SC-005: Snapshot extraction < 2s', async () => {
		// Navigate first
		await playwrightClient.navigate('https://example.com');

		// Measure snapshot time
		const start = Date.now();
		await playwrightClient.getSnapshot();
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(2000);
		console.log(
			`\nSC-005 Result: Snapshot extracted in ${elapsed}ms (target: <2000ms)`,
		);
	}, 30_000);

	it('meets SC-006: Evaluate operation < 5s', async () => {
		// Navigate first
		await playwrightClient.navigate('https://example.com');

		// Measure evaluate time
		const start = Date.now();
		await playwrightClient.evaluate('document.title');
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(5000);
		console.log(
			`\nSC-006 Result: Evaluation completed in ${elapsed}ms (target: <5000ms)`,
		);
	}, 30_000);

	it('performs multiple operations sequentially without errors', async () => {
		// Navigate
		const navigateResult = await playwrightClient.navigate(
			'https://example.com',
		);
		expect(navigateResult.success).toBe(true);

		// Screenshot
		const screenshotResult = await playwrightClient.screenshot();
		expect(screenshotResult.screenshot).toBeDefined();

		// Snapshot
		const snapshotResult = await playwrightClient.getSnapshot();
		expect(snapshotResult.snapshot).toBeDefined();

		// Evaluate
		const evaluateResult = await playwrightClient.evaluate('document.title');
		expect(evaluateResult).toBeDefined();

		console.log('\n=== Sequential Operations Complete ===');
		console.log('All operations completed successfully');
	}, 60_000);

	it('maintains session state across operations', async () => {
		// First navigation
		await playwrightClient.navigate('https://example.com');

		// First evaluation
		const result1 = await playwrightClient.evaluate('window.location.href');
		expect(result1).toContain('example.com');

		// Screenshot (should be of same page)
		const screenshot1 = await playwrightClient.screenshot();
		expect(screenshot1.screenshot).toBeDefined();

		// Second evaluation (should still be on same page)
		const result2 = await playwrightClient.evaluate('window.location.href');
		expect(result2).toContain('example.com');

		console.log('\n=== Session State Maintained ===');
		console.log('All operations performed on same page successfully');
	}, 60_000);

	it('handles operation errors gracefully', async () => {
		// Navigate to valid page first
		await playwrightClient.navigate('https://example.com');

		// Try to evaluate unsafe script - should throw
		await expect(playwrightClient.evaluate("require('fs')")).rejects.toThrow();

		// Session should still be usable after error
		const result = await playwrightClient.evaluate('document.title');
		expect(result).toBeDefined();

		console.log('\n=== Error Recovery Successful ===');
		console.log('Session recovered from error and continued operations');
	}, 60_000);

	it('reports comprehensive performance metrics', async () => {
		const metrics = {
			navigate: 0,
			screenshot: 0,
			snapshot: 0,
			evaluate: 0,
			total: 0,
		};

		const totalStart = Date.now();

		// Navigation
		let start = Date.now();
		await playwrightClient.navigate('https://example.com');
		metrics.navigate = Date.now() - start;

		// Screenshot
		start = Date.now();
		await playwrightClient.screenshot();
		metrics.screenshot = Date.now() - start;

		// Snapshot
		start = Date.now();
		await playwrightClient.getSnapshot();
		metrics.snapshot = Date.now() - start;

		// Evaluate
		start = Date.now();
		await playwrightClient.evaluate('document.title');
		metrics.evaluate = Date.now() - start;

		metrics.total = Date.now() - totalStart;

		// Verify all operations meet their targets
		expect(metrics.navigate).toBeLessThan(10_000); // SC-003
		expect(metrics.screenshot).toBeLessThan(3000); // SC-004
		expect(metrics.snapshot).toBeLessThan(2000); // SC-005
		expect(metrics.evaluate).toBeLessThan(5000); // SC-006

		// Report
		console.log('\n=== Performance Metrics Summary ===');
		console.log(`Navigate:   ${metrics.navigate}ms (target: <10000ms)`);
		console.log(`Screenshot: ${metrics.screenshot}ms (target: <3000ms)`);
		console.log(`Snapshot:   ${metrics.snapshot}ms (target: <2000ms)`);
		console.log(`Evaluate:   ${metrics.evaluate}ms (target: <5000ms)`);
		console.log(`Total:      ${metrics.total}ms`);
		console.log('✅ All operations meet performance targets');
	}, 60_000);
});
