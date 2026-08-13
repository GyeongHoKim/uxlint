/**
 * AnalysisRunner Component
 * Orchestrates multi-page analysis workflow
 *
 * @packageDocumentation
 */

import {Box, Text} from 'ink';
import {useEffect, useRef} from 'react';
import type {ThemeConfig} from '../models/theme.js';
import type {UxLintConfig} from '../models/config.js';
import type {UxReport} from '../models/analysis.js';
import {useAnalysis} from '../hooks/use-analysis.js';
import {AnalysisProgress} from './analysis-progress.js';

/**
 * AnalysisRunner component props
 */
export type AnalysisRunnerProps = {
	/** Theme for styling */
	readonly theme: ThemeConfig;

	/** UxLint configuration */
	readonly config: UxLintConfig;

	/** Callback when analysis completes successfully */
	readonly onComplete?: (result: UxReport) => void;

	/** Callback when analysis fails */
	readonly onError?: (error: Error) => void;
};

/**
 * AnalysisRunner component
 * Runs multi-page analysis and displays progress
 */
export function AnalysisRunner({
	theme,
	config,
	onComplete,
	onError,
}: AnalysisRunnerProps) {
	// Use analysis orchestration hook
	const {analysisState, runAnalysis, getCurrentPageUrl} = useAnalysis(config);
	// A ref, not state: the flag is never rendered, so keeping it out of state
	// avoids an extra commit per completed analysis.
	const hasNotified = useRef(false);

	// Derived, not state: the exit prompt is a pure function of the stage, and
	// setting it from an effect would trigger an extra render pass.
	const isTerminalStage =
		analysisState.currentStage === 'complete' ||
		analysisState.currentStage === 'error';

	useEffect(() => {
		void runAnalysis();
	}, [runAnalysis]);

	// Notify the caller once the analysis reaches a terminal stage
	useEffect(() => {
		if (!isTerminalStage) {
			return;
		}

		if (hasNotified.current) {
			return;
		}

		if (analysisState.currentStage === 'complete' && onComplete) {
			if (!analysisState.finalReport) {
				return;
			}

			hasNotified.current = true;
			onComplete(analysisState.finalReport);
			return;
		}

		if (analysisState.currentStage === 'error' && onError) {
			hasNotified.current = true;
			onError(analysisState.error ?? new Error('Unknown analysis error'));
		}
	}, [
		isTerminalStage,
		analysisState.currentStage,
		analysisState.error,
		analysisState.finalReport,
		onComplete,
		onError,
	]);

	return (
		<Box flexDirection="column" gap={1}>
			<AnalysisProgress
				theme={theme}
				stage={analysisState.currentStage}
				currentPage={analysisState.currentPageIndex + 1}
				totalPages={analysisState.totalPages}
				pageUrl={getCurrentPageUrl()}
				error={analysisState.error?.message}
				lastLLMResponse={analysisState.lastLLMResponse}
				waitingMessage={analysisState.waitingMessage}
				isWaitingForLLM={analysisState.isWaitingForLLM}
			/>

			{/* Show completion message and exit prompt */}
			{isTerminalStage && analysisState.currentStage === 'complete' ? (
				<Box flexDirection="column" gap={1} marginTop={1}>
					<Text color="green">✓ Report saved to: {config.report.output}</Text>
					{!onComplete && <Text dimColor>Press any key to exit</Text>}
				</Box>
			) : null}

			{/* Show error message and exit prompt */}
			{isTerminalStage && analysisState.currentStage === 'error' ? (
				<Box flexDirection="column" gap={1} marginTop={1}>
					{!onError && <Text dimColor>Press any key to exit</Text>}
				</Box>
			) : null}
		</Box>
	);
}
