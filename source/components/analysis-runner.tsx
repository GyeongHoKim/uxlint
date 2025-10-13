/**
 * AnalysisRunner Component
 * Orchestrates multi-page analysis workflow
 *
 * @packageDocumentation
 */

import type {ThemeConfig} from '../models/theme.js';
import type {UxLintConfig} from '../models/config.js';

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
export function AnalysisRunner(_props: AnalysisRunnerProps) {
	// Not implemented - stub for TDD Red phase
	return null;
}
