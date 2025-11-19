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
	const {analysisState, runAnalysis, getCurrentPageUrl} = useAnalysis(config);
	const [showExitPrompt, setShowExitPrompt] = useState(false);

	useEffect(() => {
		void runAnalysis();
	}, [runAnalysis]);

	// Show exit prompt when complete or error
	useEffect(() => {
		if (
			analysisState.currentStage === 'complete' ||
			analysisState.currentStage === 'error'
		) {
			setShowExitPrompt(true);
		}
	}, [analysisState.currentStage]);

	// Handle any key press to exit
	useInput((_input, key) => {
		if (showExitPrompt && !key.ctrl) {
			process.exit(analysisState.currentStage === 'complete' ? 0 : 1);
		}
	});

	return (
		<Box flexDirection="column" gap={1}>
			<AnalysisProgress
				theme={theme}
				stage={analysisState.currentStage}
				currentPage={analysisState.currentPageIndex + 1}
				totalPages={analysisState.totalPages}
				pageUrl={getCurrentPageUrl()}
				error={analysisState.error?.message}
			/>

			{/* Show completion message and exit prompt */}
			{Boolean(showExitPrompt && analysisState.currentStage === 'complete') && (
				<Box flexDirection="column" gap={1} marginTop={1}>
					<Text color="green">✓ Report saved to: {config.report.output}</Text>
					<Text dimColor>Press any key to exit</Text>
				</Box>
			)}

			{/* Show error message and exit prompt */}
			{Boolean(showExitPrompt && analysisState.currentStage === 'error') && (
				<Box flexDirection="column" gap={1} marginTop={1}>
					<Text dimColor>Press any key to exit</Text>
				</Box>
			)}
		</Box>
	);
}
