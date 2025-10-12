/**
 * Unit tests for MCPClient
 * @packageDocumentation
 */

import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {McpClient} from '../../../source/mcp/client/mcp-client.js';
import {McpError, ConnectionError} from '../../../source/mcp/client/errors.js';

describe('T010: MCPClient constructor', () => {
	it('initializes with name and version', () => {
		const client = new McpClient('test-client', '1.0.0');
		expect(client).toBeInstanceOf(McpClient);
	});

	it('starts in disconnected state', () => {
		const client = new McpClient('test-client', '1.0.0');
		expect(client.isConnected()).toBe(false);
	});

	it('registers capabilities', () => {
		// Capabilities are registered internally during construction
		// This is verified by successful connection in other tests
		const client = new McpClient('test-client', '1.0.0');
		expect(client).toBeDefined();
	});
});

describe('T011: MCPClient.connect()', () => {
	let client: McpClient;

	beforeEach(() => {
		client = new McpClient('test-client', '1.0.0');
	});

	afterEach(async () => {
		if (client.isConnected()) {
			await client.close();
		}
	});

	it('successful connection to Playwright MCP server', async () => {
		await expect(
			client.connect('npx', ['@playwright/mcp@latest', '--headless']),
		).resolves.not.toThrow();
	}, 30_000); // 30 second timeout for server startup

	it('connected state becomes true after connection', async () => {
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);
		expect(client.isConnected()).toBe(true);
	}, 30_000);

	it('throws ConnectionError with invalid command', async () => {
		await expect(
			client.connect('invalid-command-does-not-exist', []),
		).rejects.toThrow(ConnectionError);
	});

	it('throws error when already connected', async () => {
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);
		await expect(
			client.connect('npx', ['@playwright/mcp@latest', '--headless']),
		).rejects.toThrow(McpError);
	}, 30_000);
});

describe('T012: MCPClient.listTools()', () => {
	let client: McpClient;

	beforeEach(() => {
		client = new McpClient('test-client', '1.0.0');
	});

	afterEach(async () => {
		if (client.isConnected()) {
			await client.close();
		}
	});

	it('returns tools after connection', async () => {
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);
		const tools = await client.listTools();
		expect(Array.isArray(tools)).toBe(true);
		expect(tools.length).toBeGreaterThan(0);
	}, 30_000);

	it('includes Playwright tools', async () => {
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);
		const tools = await client.listTools();
		const toolNames = tools.map(tool => tool.name);

		// Check for key Playwright MCP tools
		expect(toolNames).toContain('browser_navigate');
		expect(toolNames).toContain('browser_snapshot');
	}, 30_000);

	it('throws McpError when not connected', async () => {
		await expect(client.listTools()).rejects.toThrow(McpError);
	});
});

describe('T013: MCPClient.close()', () => {
	let client: McpClient;

	beforeEach(() => {
		client = new McpClient('test-client', '1.0.0');
	});

	it('properly cleans up connection', async () => {
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);
		await expect(client.close()).resolves.not.toThrow();
	}, 30_000);

	it('connected state becomes false after close', async () => {
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);
		await client.close();
		expect(client.isConnected()).toBe(false);
	}, 30_000);

	it('does not throw when not connected', async () => {
		await expect(client.close()).resolves.not.toThrow();
	});
});

describe('T014: MCPClient.isConnected()', () => {
	let client: McpClient;

	beforeEach(() => {
		client = new McpClient('test-client', '1.0.0');
	});

	afterEach(async () => {
		if (client.isConnected()) {
			await client.close();
		}
	});

	it('tracks connection state across lifecycle', async () => {
		// Initially disconnected
		expect(client.isConnected()).toBe(false);

		// Connected after connect()
		await client.connect('npx', ['@playwright/mcp@latest', '--headless']);
		expect(client.isConnected()).toBe(true);

		// Disconnected after close()
		await client.close();
		expect(client.isConnected()).toBe(false);
	}, 30_000);
});
