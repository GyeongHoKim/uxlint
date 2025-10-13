/**
 * AnalysisRunner Component
 * Orchestrates multi-page analysis workflow
 *
 * @packageDocumentation
 */

import {Box} from 'ink';
import {useEffect} from 'react';
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

	// Start analysis on mount
	useEffect(() => {
		void runAnalysis();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

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
		</Box>
	);
}
