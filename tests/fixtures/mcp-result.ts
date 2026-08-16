/**
 * The shape an MCP-adapted tool actually returns.
 *
 * `@ai-sdk/mcp` hands the server's `CallToolResult` through unchanged, so a
 * tool double that returns a plain string does not resemble the thing it is
 * standing in for. Two bugs shipped behind exactly that gap — a capture that
 * was never recorded, and a failed navigation counted as a success — and no
 * test noticed, because every double returned a string.
 */

/**
 * A successful tool result carrying text.
 *
 * @param text - What the tool produced
 * @returns The result shape the MCP adapter passes through
 */
export const mcpResult = (text: string) => ({
	content: [{type: 'text' as const, text}],
	isError: false,
});

/**
 * A failed tool result.
 *
 * The server reports failure this way rather than by throwing, which is what
 * makes it easy to mistake for a success.
 *
 * @param text - The failure the tool described
 * @returns The result shape the MCP adapter passes through
 */
export const mcpError = (text: string) => ({
	content: [{type: 'text' as const, text}],
	isError: true,
});
