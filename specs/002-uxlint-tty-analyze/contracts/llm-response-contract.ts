/**
 * LLM Response Contract
 * Defines the interface for LLM response data displayed in the UI
 *
 * @packageDocumentation
 */

/**
 * Represents a tool call made by the LLM
 */
export type LLMToolCall = {
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
 * Display options for LLM response
 */
export type LLMResponseDisplayOptions = {
	/**
	 * Maximum characters to display for text response
	 * @default 200
	 */
	maxTextLength?: number;

	/**
	 * Maximum number of tool calls to display
	 * @default 5
	 */
	maxToolCalls?: number;

	/**
	 * Whether to show iteration number
	 * @default true
	 */
	showIteration?: boolean;

	/**
	 * Whether to show timestamp
	 * @default false
	 */
	showTimestamp?: boolean;
};

/**
 * Default display options
 */
export const defaultDisplayOptions: Required<LLMResponseDisplayOptions> = {
	maxTextLength: 200,
	maxToolCalls: 5,
	showIteration: true,
	showTimestamp: false,
};

/**
 * Truncate text to maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}

	return text.slice(0, maxLength) + '...';
}

/**
 * Format tool call for display
 */
export function formatToolCall(toolCall: LLMToolCall): string {
	const argsPreview = Object.keys(toolCall.args).slice(0, 2).join(', ');
	return `${toolCall.toolName}${argsPreview ? ` (${argsPreview})` : ''}`;
}

