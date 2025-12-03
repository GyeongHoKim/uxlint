/**
 * LLM Response Types
 * Defines types for LLM response data displayed in the UI
 *
 * @packageDocumentation
 */

/**
 * Represents a tool call made by the LLM
 */
export type LLMToolCall = {
	/**
	 * Unique identifier for this tool call (when provided by the LLM/SDK)
	 */
	id?: string;

	/**
	 * Name of the tool that was called
	 */
	toolName: string;

	/**
	 * Arguments passed to the tool
	 */
	args: Record<string, unknown>;
};

/**
 * Represents LLM response data to be displayed in the UI
 * This is the primary data structure for showing what the LLM is doing
 */
export type LLMResponseData = {
	/**
	 * LLM's text response
	 * May be empty if the LLM only made tool calls
	 */
	text?: string;

	/**
	 * Tool calls made by the LLM in this response
	 * Shows what actions the AI is taking
	 */
	toolCalls?: LLMToolCall[];

	/**
	 * Reason for completion
	 * 'stop' = natural completion
	 * 'tool-calls' = stopped to execute tools
	 */
	finishReason?: string;

	/**
	 * Current iteration number in the agent loop (1-based)
	 */
	iteration: number;

	/**
	 * Timestamp when response was received (ms since epoch)
	 */
	timestamp: number;
};

/**
 * Truncate text to maximum length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with "..." if needed
 */
export function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}

	return text.slice(0, maxLength) + '...';
}

/**
 * Format tool call for display
 * @param toolCall - Tool call to format
 * @returns Formatted string representation
 */
export function formatToolCall(toolCall: LLMToolCall): string {
	const argsPreview = Object.keys(toolCall.args).slice(0, 2).join(', ');
	return `${toolCall.toolName}${argsPreview ? ` (${argsPreview})` : ''}`;
}
