/**
 * AnalysisProgress Component
 * Displays current analysis stage with spinner and progress
 *
 * @packageDocumentation
 */

import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import type {AnalysisStage} from '../models/analysis.js';
import type {LLMResponseData} from '../models/llm-response.js';
import type {ThemeConfig} from '../models/theme.js';
import {LLMResponseDisplay} from './llm-response-display.js';

/**
 * AnalysisProgress component props
 */
export type AnalysisProgressProps = {
	/** Theme for styling */
	readonly theme: ThemeConfig;

	/** Current analysis stage */
	readonly stage: AnalysisStage;

	/** Current page index (1-based) */
	readonly currentPage: number;

	/** Total number of pages */
	readonly totalPages: number;

	/** Optional page URL being analyzed */
	readonly pageUrl?: string;

	/** Optional error message */
	readonly error?: string;

	/**
	 * Last LLM response to display
	 */
	readonly lastLLMResponse?: LLMResponseData;

	/**
	 * Waiting message to display while waiting for LLM response
	 */
	readonly waitingMessage?: string;

	/**
	 * Whether currently waiting for LLM response
	 */
	readonly isWaitingForLLM?: boolean;
};

/**
 * AnalysisProgress component
 * Shows progress for multi-page analysis
 */
export function AnalysisProgress({
	theme,
	stage,
	currentPage,
	totalPages,
	pageUrl,
	error,
	lastLLMResponse,
	waitingMessage,
	isWaitingForLLM,
}: AnalysisProgressProps) {
	const isError = stage === 'error';

	return (
		<Box flexDirection="column" gap={1}>
			{/* Error message */}
			{Boolean(isError && error) && (
				<Box>
					<Text color="red">{error}</Text>
				</Box>
			)}

			{/* Measuring.

				The longest single wait in a run: the audit and the trace take
				seconds, not milliseconds. Nothing else in this component
				renders during that stage, so without this the display would go
				blank for the whole of it -- and a blank display is exactly what
				a hang looks like. Naming the phase is what tells the two apart.
			*/}
			{stage === 'measuring' && (
				<Box flexDirection="column" marginTop={1}>
					<Box>
						<Box marginRight={1}>
							<Text color={theme.accent}>
								<Spinner type="dots" />
							</Text>
						</Box>
						<Text color="cyan">
							{waitingMessage ?? 'Measuring accessibility and performance'}
						</Text>
					</Box>
					<Text dimColor>
						Running an accessibility audit and a performance trace. This takes a
						few seconds per page.
					</Text>
				</Box>
			)}

			{/* Waiting message with spinner */}
			{Boolean(isWaitingForLLM && waitingMessage && stage === 'analyzing') && (
				<Box flexDirection="column" marginTop={1}>
					<Box>
						<Box marginRight={1}>
							<Text color={theme.accent}>
								<Spinner type="dots" />
							</Text>
						</Box>
						<Text dimColor color="cyan">
							{waitingMessage}
						</Text>
					</Box>
				</Box>
			)}

			{/* LLM Response Display - includes page info in header */}
			{lastLLMResponse && stage === 'analyzing' ? (
				<LLMResponseDisplay
					response={lastLLMResponse}
					currentPage={currentPage}
					totalPages={totalPages}
					pageUrl={pageUrl}
				/>
			) : null}
		</Box>
	);
}
