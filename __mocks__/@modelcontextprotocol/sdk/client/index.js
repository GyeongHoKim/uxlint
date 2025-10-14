/**
 * Manual mock for @modelcontextprotocol/sdk/client/index.js
 */

const Client = jest.fn().mockImplementation(() => ({
	connect: () => Promise.resolve(),
	close: () => Promise.resolve(),
	listTools: () => Promise.resolve({tools: []}),
	callTool: () => Promise.resolve({content: []}),
}));

module.exports = {Client, __esModule: true};
