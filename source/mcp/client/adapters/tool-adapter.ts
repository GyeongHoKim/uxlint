/**
 * MCP Tool Adapter
 * Converts MCP tool schemas to Vercel AI SDK tool format for Claude
 *
 * @packageDocumentation
 */

import {jsonSchema, type Tool as AiTool} from '@ai-sdk/provider-utils';
import type {McpClient} from '../mcp-client.js';
import type {Tool as McpTool} from '../types.js';

/**
 * Tool call result
 */
export type ToolCallResult = {
	toolCallId: string;
	toolName: string;
	result: unknown;
};

/**
 * Convert MCP tools to Claude-compatible tool definitions
 *
 * @param mcpTools - MCP tools from server
 * @param mcpClient - MCP client for executing tools
 * @returns Record of tool definitions for Vercel AI SDK
 */
export function convertMcpToolsToClaudeTools(
	mcpTools: McpTool[],
	mcpClient: McpClient,
): Record<string, AiTool> {
	const claudeTools: Record<string, AiTool> = {};

	for (const mcpTool of mcpTools) {
		claudeTools[mcpTool.name] = {
			description: mcpTool.description ?? `Execute ${mcpTool.name} tool`,
			inputSchema: jsonSchema(mcpTool.inputSchema),
			async execute(args: Record<string, unknown>) {
				// Call MCP tool and return result
				const result = await mcpClient.callTool(mcpTool.name, args);
				return result;
			},
		};
	}

	return claudeTools;
}

/**
 * MCP content item type
 */
type McpContentItem = {
	type?: string;
	text?: string;
	data?: string;
};

/**
 * MCP tool response type
 */
type McpToolResponse = {
	content?: McpContentItem[];
};

/**
 * Extract text content from MCP tool response
 * Handles various MCP response formats
 *
 * @param result - MCP tool response
 * @returns Extracted text content or stringified result
 */
export function extractToolResultText(result: unknown): string {
	// Handle MCP response format
	if (
		result &&
		typeof result === 'object' &&
		'content' in result &&
		Array.isArray((result as McpToolResponse).content)
	) {
		const mcpResult = result as McpToolResponse;

		// MCP returns { content: [{ type: 'text', text: '...' }, ...] }
		const textContent = mcpResult.content?.find(
			(c: McpContentItem) => c.type === 'text',
		);
		if (textContent?.text) {
			return textContent.text;
		}

		// Check for image content
		const imageContent = mcpResult.content?.find(
			(c: McpContentItem) => c.type === 'image',
		);
		if (imageContent?.data) {
			return `[Image data: ${imageContent.data.slice(0, 100)}...]`;
		}
	}

	// Fallback to JSON stringification
	return JSON.stringify(result, null, 2);
}
