/**
 * MCP Client Factory Tests
 * Unit tests for MCP client creation and configuration
 */

import {jest} from '@jest/globals';

// Mock getMcpConfigFromEnv
const mockGetMcpConfigFromEnv = jest.fn();
jest.unstable_mockModule('../../../source/mcp/client/config.js', () => ({
	getMcpConfigFromEnv: mockGetMcpConfigFromEnv,
}));

// Mock AI SDK MCP modules
const mockTransport = {};
const mockStdioMCPTransport = jest.fn().mockImplementation(() => mockTransport);

// Create proper mock types for MCP client
type MockMcpClient = {
	close: jest.Mock<() => Promise<void>>;
	tools: jest.Mock<() => Promise<Record<string, unknown>>>;
};

const mockClient: MockMcpClient = {
	close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	tools: jest
		.fn<() => Promise<Record<string, unknown>>>()
		.mockResolvedValue({}),
};

type MockCreateMCPClient = jest.Mock<() => Promise<MockMcpClient>>;

const mockExperimental_createMCPClient: MockCreateMCPClient = jest
	.fn<() => Promise<MockMcpClient>>()
	.mockResolvedValue(mockClient);

jest.unstable_mockModule('ai', () => ({
	experimental_createMCPClient: mockExperimental_createMCPClient,
}));

jest.unstable_mockModule('@ai-sdk/mcp/mcp-stdio', () => ({
	Experimental_StdioMCPTransport: mockStdioMCPTransport,
}));

// Dynamic imports after mocks are set up
const {McpClientFactory} = await import(
	'../../../source/infrastructure/mcp/mcp-client-factory.js'
);

describe('McpClientFactory', () => {
	let factory: InstanceType<typeof McpClientFactory>;

	beforeEach(() => {
		factory = new McpClientFactory();
		jest.clearAllMocks();

		// Setup default mock config
		mockGetMcpConfigFromEnv.mockReturnValue({
			serverCommand: 'npx',
			serverArgs: ['@playwright/mcp@latest'],
		});
	});

	describe('createClient', () => {
		test('creates MCP client with default client name', async () => {
			const client = await factory.createClient();

			expect(client).toBe(mockClient);
			expect(mockExperimental_createMCPClient).toHaveBeenCalledWith({
				name: 'uxlint',
				transport: mockTransport,
			});
		});

		test('creates MCP client with custom client name', async () => {
			await factory.createClient('custom-client');

			expect(mockExperimental_createMCPClient).toHaveBeenCalledWith({
				name: 'custom-client',
				transport: mockTransport,
			});
		});

		test('creates stdio transport with correct config', async () => {
			await factory.createClient();

			expect(mockStdioMCPTransport).toHaveBeenCalledWith({
				command: 'npx',
				args: ['@playwright/mcp@latest'],
			});
		});

		test('uses MCP config from environment', async () => {
			mockGetMcpConfigFromEnv.mockReturnValue({
				serverCommand: 'custom-command',
				serverArgs: ['arg1', 'arg2'],
			});

			await factory.createClient();

			expect(mockStdioMCPTransport).toHaveBeenCalledWith({
				command: 'custom-command',
				args: ['arg1', 'arg2'],
			});
		});

		test('propagates errors from client creation', async () => {
			const error = new Error('Client creation failed');
			mockExperimental_createMCPClient.mockRejectedValueOnce(error);

			await expect(factory.createClient()).rejects.toThrow(
				'Client creation failed',
			);
		});

		test('propagates errors from transport creation', async () => {
			const error = new Error('Transport creation failed');
			mockStdioMCPTransport.mockImplementationOnce(() => {
				throw error;
			});

			await expect(factory.createClient()).rejects.toThrow(
				'Transport creation failed',
			);
		});
	});
});
