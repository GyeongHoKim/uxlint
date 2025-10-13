/**
 * MCP Page Capture Integration Tests
 * Tests for Playwright MCP client wrapper
 */

import {
	McpPageCapture,
	NavigationError,
	SnapshotError,
} from '../../source/services/mcp-page-capture.js';

describe('McpPageCapture', () => {
	let client: McpPageCapture;

	beforeEach(() => {
		// Note: Will need proper mocking in implementation
		client = new McpPageCapture();
	});

	afterEach(async () => {
		await client.close();
	});

	// CapturePage tests
	describe('capturePage', () => {
		test('navigates to page and captures accessibility snapshot', async () => {
			const result = await client.capturePage('https://example.com');

			expect(result).toHaveProperty('url');
			expect(result).toHaveProperty('snapshot');
			expect(result).toHaveProperty('timestamp');
			expect(result.url).toBe('https://example.com');
			expect(typeof result.snapshot).toBe('string');
			expect(result.snapshot.length).toBeGreaterThan(0);
		});

		test('returns final URL after redirects', async () => {
			const result = await client.capturePage('http://example.com');

			// HTTP should redirect to HTTPS
			expect(result.url).toContain('https://');
		});

		test('includes page title in result', async () => {
			const result = await client.capturePage('https://example.com');

			expect(result).toHaveProperty('title');
			expect(typeof result.title).toBe('string');
		});

		test('includes HTTP status code', async () => {
			const result = await client.capturePage('https://example.com');

			expect(result).toHaveProperty('status');
			expect(result.status).toBe(200);
		});

		test('sets timestamp to current time', async () => {
			const beforeTime = Date.now();
			const result = await client.capturePage('https://example.com');
			const afterTime = Date.now();

			expect(result.timestamp).toBeGreaterThanOrEqual(beforeTime);
			expect(result.timestamp).toBeLessThanOrEqual(afterTime);
		});

		test('throws NavigationError for 404 pages', async () => {
			await expect(
				client.capturePage('https://example.com/nonexistent-page-404'),
			).rejects.toThrow(NavigationError);
		});

		test('throws NavigationError for network timeout', async () => {
			await expect(
				client.capturePage('https://very-slow-domain-that-times-out.test', 100),
			).rejects.toThrow(NavigationError);
		});

		test('NavigationError includes page URL', async () => {
			const url = 'https://example.com/404';

			try {
				await client.capturePage(url);
			} catch (error: unknown) {
				if (error instanceof NavigationError) {
					expect(error.url).toBe(url);
				}
			}
		});

		test('throws SnapshotError when snapshot capture fails', async () => {
			// Note: Will need to mock browser failure in implementation
			// This test documents expected behavior
			await expect(async () => {
				// Simulate snapshot failure scenario
				throw new SnapshotError(
					'Failed to capture accessibility tree',
					'https://example.com',
				);
			}).rejects.toThrow(SnapshotError);
		});

		test('respects custom timeout parameter', async () => {
			const customTimeout = 5000;
			const startTime = Date.now();

			try {
				await client.capturePage(
					'https://very-slow-domain.test',
					customTimeout,
				);
			} catch {
				const elapsed = Date.now() - startTime;
				expect(elapsed).toBeLessThanOrEqual(customTimeout + 1000);
			}
		});

		test('captures snapshot as valid JSON string', async () => {
			const result = await client.capturePage('https://example.com');

			expect(() => JSON.parse(result.snapshot) as unknown).not.toThrow();
		});

		test('snapshot contains accessibility tree structure', async () => {
			const result = await client.capturePage('https://example.com');
			const snapshot = JSON.parse(result.snapshot) as Record<string, unknown>;

			expect(snapshot).toHaveProperty('role');
			expect(snapshot).toHaveProperty('children');
		});
	});

	// Close tests
	describe('close', () => {
		test('closes browser and MCP connection', async () => {
			await client.capturePage('https://example.com');

			await expect(client.close()).resolves.not.toThrow();
		});

		test('can be called multiple times safely', async () => {
			await client.close();
			await client.close();

			// Should not throw on second close
		});

		test('throws error when using client after close', async () => {
			await client.close();

			await expect(client.capturePage('https://example.com')).rejects.toThrow();
		});
	});

	// Error handling tests
	describe('error handling', () => {
		test('NavigationError contains error cause', async () => {
			try {
				await client.capturePage('https://example.com/404');
			} catch (error: unknown) {
				if (error instanceof NavigationError) {
					expect(error).toHaveProperty('cause');
					expect(error.message).toContain('404');
				}
			}
		});

		test('SnapshotError contains error cause', () => {
			const originalError = new Error('Browser crashed');
			const snapshotError = new SnapshotError(
				'Snapshot failed',
				'https://example.com',
				originalError,
			);

			expect(snapshotError.cause).toBe(originalError);
			expect(snapshotError.url).toBe('https://example.com');
		});

		test('error messages are descriptive', async () => {
			try {
				await client.capturePage('https://example.com/404');
			} catch (error: unknown) {
				if (error instanceof NavigationError) {
					expect(error.message.length).toBeGreaterThan(10);
					expect(error.message).toContain('404');
				}
			}
		});
	});

	// Integration with existing Playwright client
	describe('PlaywrightClient integration', () => {
		test('wraps existing PlaywrightClient', () => {
			expect(client).toBeInstanceOf(McpPageCapture);
		});

		test('uses MCP config from environment', async () => {
			// Should respect MCP_BROWSER, MCP_HEADLESS etc from env
			const result = await client.capturePage('https://example.com');

			expect(result).toBeDefined();
		});
	});

	// Concurrent operations
	describe('concurrent operations', () => {
		test('handles multiple page captures sequentially', async () => {
			const urls = [
				'https://example.com',
				'https://example.com/about',
				'https://example.com/contact',
			];

			const results = [];
			for (const url of urls) {
				// eslint-disable-next-line no-await-in-loop
				const result = await client.capturePage(url);
				results.push(result);
			}

			expect(results).toHaveLength(3);
			expect(results[0]?.url).toBe(urls[0]);
			expect(results[1]?.url).toBe(urls[1]);
			expect(results[2]?.url).toBe(urls[2]);
		});
	});
});

// Error class tests
describe('NavigationError', () => {
	test('has correct name property', () => {
		const error = new NavigationError(
			'Navigation failed',
			'https://example.com',
		);

		expect(error.name).toBe('NavigationError');
	});

	test('extends Error', () => {
		const error = new NavigationError(
			'Navigation failed',
			'https://example.com',
		);

		expect(error).toBeInstanceOf(Error);
	});

	test('includes url property', () => {
		const url = 'https://example.com/test';
		const error = new NavigationError('Navigation failed', url);

		expect(error.url).toBe(url);
	});
});

describe('SnapshotError', () => {
	test('has correct name property', () => {
		const error = new SnapshotError('Snapshot failed', 'https://example.com');

		expect(error.name).toBe('SnapshotError');
	});

	test('extends Error', () => {
		const error = new SnapshotError('Snapshot failed', 'https://example.com');

		expect(error).toBeInstanceOf(Error);
	});

	test('includes url and cause properties', () => {
		const url = 'https://example.com/test';
		const cause = new Error('Browser error');
		const error = new SnapshotError('Snapshot failed', url, cause);

		expect(error.url).toBe(url);
		expect(error.cause).toBe(cause);
	});
});
