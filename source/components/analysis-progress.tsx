/**
 * AnalysisProgress Component
 * Displays current analysis stage with spinner and progress
 *
 * @packageDocumentation
 */

import type {ThemeConfig} from '../models/theme.js';
import type {AnalysisStage} from '../models/analysis.js';

/**
 * AnalysisProgress component props
 */
export type AnalysisProgressProps = {
	/** Theme for styling */
	theme: ThemeConfig;

	/** Current analysis stage */
	stage: AnalysisStage;

	/** Current page index (1-based) */
	currentPage: number;

	/** Total number of pages */
	totalPages: number;

	/** Optional page URL being analyzed */
	pageUrl?: string;

	/** Optional error message */
	error?: string;
};

/**
 * AnalysisProgress component
 * Shows progress for multi-page analysis
 */
export function AnalysisProgress(_props: AnalysisProgressProps) {
	// Not implemented - stub for TDD Red phase
	return null;
}
