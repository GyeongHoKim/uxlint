/**
 * AnalysisRunner Component
 * Orchestrates multi-page analysis workflow
 *
 * @packageDocumentation
 */

import {Box, Text} from 'ink';
import {useEffect, useState} from 'react';
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
	const [showExitPrompt, setShowExitPrompt] = useState(false);
	const [hasNotified, setHasNotified] = useState(false);

	useEffect(() => {
		void runAnalysis();
	}, [runAnalysis]);

	// Show exit prompt and notify when complete or error
	useEffect(() => {
		const isTerminalStage =
			analysisState.currentStage === 'complete' ||
			analysisState.currentStage === 'error';

		if (!isTerminalStage) {
			return;
		}

		setShowExitPrompt(true);

		if (hasNotified) {
			return;
		}

		if (analysisState.currentStage === 'complete' && onComplete) {
			if (!analysisState.finalReport) {
				return;
			}

			setHasNotified(true);
			onComplete(analysisState.finalReport);
			return;
		}

		if (analysisState.currentStage === 'error' && onError) {
			setHasNotified(true);
			onError(analysisState.error ?? new Error('Unknown analysis error'));
		}
	}, [
		analysisState.currentStage,
		analysisState.error,
		analysisState.finalReport,
		hasNotified,
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
			{Boolean(showExitPrompt && analysisState.currentStage === 'complete') && (
				<Box flexDirection="column" gap={1} marginTop={1}>
					<Text color="green">✓ Report saved to: {config.report.output}</Text>
					{!onComplete && <Text dimColor>Press any key to exit</Text>}
				</Box>
			)}

			{/* Show error message and exit prompt */}
			{Boolean(showExitPrompt && analysisState.currentStage === 'error') && (
				<Box flexDirection="column" gap={1} marginTop={1}>
					{!onError && <Text dimColor>Press any key to exit</Text>}
				</Box>
			)}
		</Box>
	);
}
