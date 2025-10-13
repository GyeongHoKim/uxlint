/**
 * AnalysisProgress Component
 * Displays current analysis stage with spinner and progress
 *
 * @packageDocumentation
 */

import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import type {ThemeConfig} from '../models/theme.js';
import type {AnalysisStage} from '../models/analysis.js';

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
};

/**
 * Map analysis stages to human-readable messages
 */
const stageMessages: Record<AnalysisStage, string> = {
	idle: 'Idle',
	navigating: 'Navigating to page',
	capturing: 'Capturing page snapshot',
	analyzing: 'Analyzing with AI',
	'generating-report': 'Generating report',
	complete: 'Analysis complete',
	error: 'Error occurred',
};

/**
 * Stages that should show a spinner
 */
const spinnerStages = new Set<AnalysisStage>([
	'navigating',
	'capturing',
	'analyzing',
	'generating-report',
]);

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
}: AnalysisProgressProps) {
	const stageMessage = stageMessages[stage];
	const showSpinner = spinnerStages.has(stage);
	const isComplete = stage === 'complete';
	const isError = stage === 'error';

	return (
		<Box flexDirection="column" gap={1}>
			{/* Stage indicator */}
			<Box>
				{Boolean(showSpinner) && (
					<Box marginRight={1}>
						<Text color={theme.accent}>
							<Spinner type="dots" />
						</Text>
					</Box>
				)}
				{Boolean(isComplete) && (
					<Box marginRight={1}>
						<Text color="green">✓</Text>
					</Box>
				)}
				{Boolean(isError) && (
					<Box marginRight={1}>
						<Text color="red">✗</Text>
					</Box>
				)}
				<Text color={isError ? 'red' : isComplete ? 'green' : theme.primary}>
					{stageMessage}
				</Text>
			</Box>

			{/* Page progress */}
			{stage !== 'idle' && (
				<Box>
					<Text dimColor>
						Page {currentPage}/{totalPages}
					</Text>
				</Box>
			)}

			{/* Page URL */}
			{Boolean(pageUrl) && (
				<Box>
					<Text dimColor>{pageUrl}</Text>
				</Box>
			)}

			{/* Error message */}
			{Boolean(isError && error) && (
				<Box>
					<Text color="red">{error}</Text>
				</Box>
			)}
		</Box>
	);
}
