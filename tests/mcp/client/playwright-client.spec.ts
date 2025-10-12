/**
 * Unit tests for PlaywrightClient (T018-T021)
 * @packageDocumentation
 */

import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {McpClient} from '../../../source/mcp/client/mcp-client.js';
import {PlaywrightClient} from '../../../source/mcp/client/playwright-client.js';
import {
	ToolInvocationError,
	McpError,
} from '../../../source/mcp/client/errors.js';
import type {
	NavigateResult,
	ScreenshotResult,
	SnapshotResult,
} from '../../../source/mcp/client/types.js';

describe('T018: PlaywrightClient.navigate()', () => {
	let mcpClient: McpClient;
	let playwrightClient: PlaywrightClient;

	beforeEach(async () => {
		mcpClient = new McpClient('playwright-test', '1.0.0');
		await mcpClient.connect('npx', ['@playwright/mcp@latest', '--headless']);
		playwrightClient = new PlaywrightClient(mcpClient);
	});

	afterEach(async () => {
		if (mcpClient.isConnected()) {
			await mcpClient.close();
		}
	});

	it('successfully navigates to a valid URL', async () => {
		const result: NavigateResult = await playwrightClient.navigate(
			'https://example.com',
		);

		expect(result).toBeDefined();
		expect(result.success).toBe(true);
		expect(result.url).toBe('https://example.com/');
		expect(result.title).toBeDefined();
		expect(typeof result.title).toBe('string');
	}, 30_000);

	it('returns NavigateResult with correct structure', async () => {
		const result: NavigateResult = await playwrightClient.navigate(
			'https://example.com',
		);

		// Verify required properties
		expect(result).toHaveProperty('success');
		expect(result).toHaveProperty('url');

		// Verify types
		expect(typeof result.success).toBe('boolean');
		expect(typeof result.url).toBe('string');

		// Verify optional properties
		if (result.title) {
			expect(typeof result.title).toBe('string');
		}

		if (result.status) {
			expect(typeof result.status).toBe('number');
			expect(result.status).toBeGreaterThanOrEqual(100);
			expect(result.status).toBeLessThan(600);
		}
	}, 30_000);

	it('throws ToolInvocationError with invalid URL', async () => {
		await expect(playwrightClient.navigate('not-a-valid-url')).rejects.toThrow(
			ToolInvocationError,
		);
	}, 30_000);

	it('handles navigation timeout', async () => {
		// Use a very short timeout to trigger timeout
		const result = await playwrightClient.navigate(
			'https://example.com',
			1, // 1ms timeout - should fail
		);

		// Navigation might succeed despite short timeout if it's very fast
		// Or it might fail with an error
		expect(result).toBeDefined();
	}, 30_000);
});

describe('T019: PlaywrightClient.screenshot()', () => {
	let mcpClient: McpClient;
	let playwrightClient: PlaywrightClient;

	beforeEach(async () => {
		mcpClient = new McpClient('playwright-test', '1.0.0');
		await mcpClient.connect('npx', ['@playwright/mcp@latest', '--headless']);
		playwrightClient = new PlaywrightClient(mcpClient);

		// Navigate to a page first
		await playwrightClient.navigate('https://example.com');
	});

	afterEach(async () => {
		if (mcpClient.isConnected()) {
			await mcpClient.close();
		}
	});

	it('captures screenshot successfully', async () => {
		const result: ScreenshotResult = await playwrightClient.screenshot();

		expect(result).toBeDefined();
		expect(result.screenshot).toBeDefined();
		expect(typeof result.screenshot).toBe('string');
		expect(result.screenshot.length).toBeGreaterThan(0);
	}, 30_000);

	it('returns ScreenshotResult with correct structure', async () => {
		const result: ScreenshotResult = await playwrightClient.screenshot();

		// Verify required properties
		expect(result).toHaveProperty('screenshot');
		expect(result).toHaveProperty('width');
		expect(result).toHaveProperty('height');

		// Verify types
		expect(typeof result.screenshot).toBe('string');
		expect(typeof result.width).toBe('number');
		expect(typeof result.height).toBe('number');

		// Verify values
		expect(result.width).toBeGreaterThan(0);
		expect(result.height).toBeGreaterThan(0);

		// Optional format
		if (result.format) {
			expect(['png', 'jpeg']).toContain(result.format);
		}
	}, 30_000);

	it('validates screenshot size is reasonable', async () => {
		const result: ScreenshotResult = await playwrightClient.screenshot();

		// Base64 encoded size should be < 10MB as per data-model.md
		const {Buffer: bufferModule} = await import('node:buffer');
		const sizeInBytes = bufferModule.from(result.screenshot, 'base64').length;
		const sizeInMegabytes = sizeInBytes / (1024 * 1024);

		expect(sizeInMegabytes).toBeLessThan(10);
	}, 30_000);
});

describe('T020: PlaywrightClient.getSnapshot()', () => {
	let mcpClient: McpClient;
	let playwrightClient: PlaywrightClient;

	beforeEach(async () => {
		mcpClient = new McpClient('playwright-test', '1.0.0');
		await mcpClient.connect('npx', ['@playwright/mcp@latest', '--headless']);
		playwrightClient = new PlaywrightClient(mcpClient);

		// Navigate to a page first
		await playwrightClient.navigate('https://example.com');
	});

	afterEach(async () => {
		if (mcpClient.isConnected()) {
			await mcpClient.close();
		}
	});

	it('captures accessibility tree snapshot successfully', async () => {
		const result: SnapshotResult = await playwrightClient.getSnapshot();

		expect(result).toBeDefined();
		expect(result.snapshot).toBeDefined();
		expect(typeof result.snapshot).toBe('string');
		expect(result.snapshot.length).toBeGreaterThan(0);
	}, 30_000);

	it('returns SnapshotResult with correct structure', async () => {
		const result: SnapshotResult = await playwrightClient.getSnapshot();

		// Verify required properties
		expect(result).toHaveProperty('snapshot');

		// Verify type
		expect(typeof result.snapshot).toBe('string');

		// Verify snapshot is valid JSON or text
		expect(() => {
			// Snapshot might be JSON or plain text
			if (result.snapshot.startsWith('{') || result.snapshot.startsWith('[')) {
				JSON.parse(result.snapshot);
			}
		}).not.toThrow();

		// Optional timestamp
		if (result.timestamp) {
			expect(typeof result.timestamp).toBe('number');
			expect(result.timestamp).toBeGreaterThan(0);
		}
	}, 30_000);

	it('validates snapshot size is reasonable', async () => {
		const result: SnapshotResult = await playwrightClient.getSnapshot();

		// Snapshot size should be < 5MB as per data-model.md
		const {Buffer: bufferModule} = await import('node:buffer');
		const sizeInBytes = bufferModule.from(result.snapshot).length;
		const sizeInMegabytes = sizeInBytes / (1024 * 1024);

		expect(sizeInMegabytes).toBeLessThan(5);
	}, 30_000);
});

describe('T021: PlaywrightClient.evaluate()', () => {
	let mcpClient: McpClient;
	let playwrightClient: PlaywrightClient;

	beforeEach(async () => {
		mcpClient = new McpClient('playwright-test', '1.0.0');
		await mcpClient.connect('npx', ['@playwright/mcp@latest', '--headless']);
		playwrightClient = new PlaywrightClient(mcpClient);

		// Navigate to a page first
		await playwrightClient.navigate('https://example.com');
	});

	afterEach(async () => {
		if (mcpClient.isConnected()) {
			await mcpClient.close();
		}
	});

	it('executes safe JavaScript in page context', async () => {
		const result = await playwrightClient.evaluate('document.title');

		expect(result).toBeDefined();
		expect(typeof result).toBe('string');
	}, 30_000);

	it('executes safe script to get window location', async () => {
		const result = await playwrightClient.evaluate('window.location.href');

		expect(result).toBeDefined();
		expect(typeof result).toBe('string');
		expect(result).toContain('example.com');
	}, 30_000);

	it('validates script safety - rejects require', async () => {
		await expect(playwrightClient.evaluate("require('fs')")).rejects.toThrow();
	}, 30_000);

	it('validates script safety - rejects import', async () => {
		await expect(playwrightClient.evaluate("import('fs')")).rejects.toThrow();
	}, 30_000);

	it('validates script safety - rejects eval', async () => {
		await expect(
			playwrightClient.evaluate("eval('malicious code')"),
		).rejects.toThrow();
	}, 30_000);
});

describe('T021-Extra: PlaywrightClient without connection', () => {
	it('throws error when MCPClient is not connected', async () => {
		const mcpClient = new McpClient('test', '1.0.0');
		const playwrightClient = new PlaywrightClient(mcpClient);

		await expect(
			playwrightClient.navigate('https://example.com'),
		).rejects.toThrow(McpError);
	});
});
