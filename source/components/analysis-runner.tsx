/**
 * AnalysisRunner Component
 * Orchestrates multi-page analysis workflow
 *
 * @packageDocumentation
 */

import process from 'node:process';
import {Box, Text, useInput} from 'ink';
import {useEffect, useState} from 'react';
import type {ThemeConfig} from '../models/theme.js';
import type {UxLintConfig} from '../models/config.js';
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
};

/**
 * AnalysisRunner component
 * Runs multi-page analysis and displays progress
 */
export function AnalysisRunner({theme, config}: AnalysisRunnerProps) {
	// Use analysis orchestration hook
	const {state, runAnalysis, getCurrentPageUrl} = useAnalysis(config);
	const [showExitPrompt, setShowExitPrompt] = useState(false);

	// Start analysis on mount
	useEffect(() => {
		void runAnalysis();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Show exit prompt when complete or error
	useEffect(() => {
		if (state.currentStage === 'complete' || state.currentStage === 'error') {
			setShowExitPrompt(true);
		}
	}, [state.currentStage]);

	// Handle any key press to exit
	useInput((_input, key) => {
		if (showExitPrompt && !key.ctrl) {
			process.exit(state.currentStage === 'complete' ? 0 : 1);
		}
	});

	return (
		<Box flexDirection="column" gap={1}>
			<AnalysisProgress
				theme={theme}
				stage={state.currentStage}
				currentPage={state.currentPageIndex + 1} // Convert to 1-based
				totalPages={state.totalPages}
				pageUrl={getCurrentPageUrl()}
				error={state.error?.message}
			/>

			{/* Show completion message and exit prompt */}
			{Boolean(showExitPrompt && state.currentStage === 'complete') && (
				<Box flexDirection="column" gap={1} marginTop={1}>
					<Text color="green">✓ Report saved to: {config.report.output}</Text>
					<Text dimColor>Press any key to exit</Text>
				</Box>
			)}

			{/* Show error message and exit prompt */}
			{Boolean(showExitPrompt && state.currentStage === 'error') && (
				<Box flexDirection="column" gap={1} marginTop={1}>
					<Text dimColor>Press any key to exit</Text>
				</Box>
			)}
		</Box>
	);
}
