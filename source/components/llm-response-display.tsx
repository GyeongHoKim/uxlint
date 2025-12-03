/**
 * LLM Response Display Component
 * Displays LLM response (text + tool calls) in the terminal UI
 *
 * @packageDocumentation
 */

import {Box, Text} from 'ink';
import {truncateText, type LLMResponseData} from '../models/llm-response.js';

/**
 * LLMResponseDisplay component props
 */
export type LLMResponseDisplayProps = {
	/** LLM response data to display */
	readonly response: LLMResponseData;

	/** Current page index (1-based) */
	readonly currentPage?: number;

	/** Total number of pages */
	readonly totalPages?: number;

	/** Optional page URL being analyzed */
	readonly pageUrl?: string;

	/** Maximum characters to display for text response (default: 200) */
	readonly maxTextLength?: number;

	/** Maximum number of tool calls to display (default: 5) */
	readonly maxToolCalls?: number;
};

/**
 * LLMResponseDisplay component
 * Renders LLM text response and tool calls
 */
export function LLMResponseDisplay({
	response,
	currentPage,
	totalPages,
	pageUrl,
	maxTextLength = 200,
	maxToolCalls = 5,
}: LLMResponseDisplayProps) {
	const displayText = response.text
		? truncateText(response.text, maxTextLength)
		: undefined;

	const toolCalls = response.toolCalls ?? [];
	const displayToolCalls = toolCalls.slice(0, maxToolCalls);
	const remainingCount = toolCalls.length - maxToolCalls;

	// Build header with iteration, page info, and URL
	const headerParts: string[] = [];
	headerParts.push(`Iteration ${response.iteration}`);

	if (currentPage && totalPages) {
		headerParts.push(`Page ${currentPage}/${totalPages}`);
	}

	if (pageUrl) {
		headerParts.push(pageUrl);
	}

	const headerText = `LLM Response (${headerParts.join(' | ')})`;

	return (
		<Box flexDirection="column" marginTop={1}>
			{/* Iteration header */}
			<Text bold color="cyan">
				📝 {headerText}:
			</Text>

			{/* Text response */}
			{Boolean(displayText) && (
				<Box marginLeft={2} marginTop={1}>
					<Text wrap="wrap">&ldquo;{displayText}&rdquo;</Text>
				</Box>
			)}

			{/* Tool calls */}
			{toolCalls.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="yellow">🔧 Tool Calls:</Text>
					{displayToolCalls.map(tc => (
						<Box key={tc.toolName} marginLeft={2}>
							<Text>• {tc.toolName}</Text>
						</Box>
					))}
					{remainingCount > 0 && (
						<Box marginLeft={2}>
							<Text dimColor>+{remainingCount} more...</Text>
						</Box>
					)}
				</Box>
			)}
		</Box>
	);
}
