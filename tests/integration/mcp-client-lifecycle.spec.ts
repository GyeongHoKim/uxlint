/**
 * Integration test for full MCP client connection lifecycle (T017)
 * Tests real connection to Playwright MCP server
 * @packageDocumentation
 */

import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {McpClient} from '../../source/mcp/client/mcp-client.js';

describe('T017: Full Connection Lifecycle Integration', () => {
	let client: McpClient;
	const startTime = Date.now();

	beforeEach(() => {
		client = new McpClient('uxlint-integration-test', '1.0.0');
	});

	afterEach(async () => {
		if (client.isConnected()) {
			await client.close();
		}
	});

	it('completes full connection lifecycle within performance target', async () => {
		// SC-001: Session initialization < 5s
		const sessionStart = Date.now();

		// Connect to Playwright MCP server
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);
		expect(client.isConnected()).toBe(true);

		const sessionInitTime = Date.now() - sessionStart;
		expect(sessionInitTime).toBeLessThan(5000); // SC-001

		// SC-002: Capability discovery < 2s
		const discoveryStart = Date.now();
		const tools = await client.listTools();
		const discoveryTime = Date.now() - discoveryStart;

		expect(discoveryTime).toBeLessThan(2000); // SC-002
		expect(tools).toBeDefined();
		expect(Array.isArray(tools)).toBe(true);
		expect(tools.length).toBeGreaterThan(0);

		// Verify tool discovery returns expected Playwright tools
		const toolNames = tools.map(tool => tool.name);
		expect(toolNames).toContain('browser_navigate');
		expect(toolNames).toContain('browser_snapshot');
		expect(toolNames).toContain('browser_click');

		// Verify connection state
		expect(client.isConnected()).toBe(true);

		// Clean shutdown
		await client.close();
		expect(client.isConnected()).toBe(false);

		// Report performance metrics
		const totalTime = Date.now() - startTime;
		console.log('\n=== Performance Metrics ===');
		console.log(
			`Session initialization: ${sessionInitTime}ms (target: <5000ms)`,
		);
		console.log(`Capability discovery: ${discoveryTime}ms (target: <2000ms)`);
		console.log(`Total lifecycle: ${totalTime}ms`);
	}, 30_000); // 30 second timeout for full lifecycle

	it('handles tool discovery correctly', async () => {
		// Connect
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);

		// Discover tools
		const tools = await client.listTools();

		// Verify each tool has required properties
		for (const tool of tools) {
			expect(tool).toHaveProperty('name');
			expect(typeof tool.name).toBe('string');
			expect(tool.name.length).toBeGreaterThan(0);

			expect(tool).toHaveProperty('description');
			expect(typeof tool.description).toBe('string');

			expect(tool).toHaveProperty('inputSchema');
			expect(typeof tool.inputSchema).toBe('object');
		}

		// Verify key Playwright tools are present
		const toolNames = tools.map(t => t.name);
		const expectedTools = [
			'browser_navigate',
			'browser_snapshot',
			'browser_click',
			'browser_take_screenshot',
			'browser_evaluate',
		];

		for (const expectedTool of expectedTools) {
			expect(toolNames).toContain(expectedTool);
		}
	}, 30_000);

	it('ensures connection cleanup releases resources', async () => {
		// Connect
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);
		expect(client.isConnected()).toBe(true);

		// Close connection
		await client.close();
		expect(client.isConnected()).toBe(false);

		// Verify we can't list tools after close
		await expect(client.listTools()).rejects.toThrow();

		// Verify we can create a new client and connect after cleanup
		const newClient = new McpClient('uxlint-reconnect-test', '1.0.0');
		await newClient.connect('npx', ['@playwright/mcp@latest', '--headless']);
		expect(newClient.isConnected()).toBe(true);

		// Verify tools work with new client
		const tools = await newClient.listTools();
		expect(tools.length).toBeGreaterThan(0);

		// Cleanup new client
		await newClient.close();
	}, 60_000); // Longer timeout for reconnect test

	it('maintains session state across multiple operations', async () => {
		// Connect
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);

		// Perform multiple tool listings
		const tools1 = await client.listTools();
		const tools2 = await client.listTools();
		const tools3 = await client.listTools();

		// All should return same tools
		expect(tools1.length).toBe(tools2.length);
		expect(tools2.length).toBe(tools3.length);

		// Session should remain connected
		expect(client.isConnected()).toBe(true);
	}, 30_000);

	it('meets SC-001: Session initialization under 5 seconds', async () => {
		const start = Date.now();
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(5000);
		console.log(`\nSC-001 Result: Session initialized in ${elapsed}ms`);
	}, 30_000);

	it('meets SC-002: Capability discovery under 2 seconds', async () => {
		// Connect first
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);

		// Measure discovery time
		const start = Date.now();
		await client.listTools();
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(2000);
		console.log(`\nSC-002 Result: Capabilities discovered in ${elapsed}ms`);
	}, 30_000);
});
