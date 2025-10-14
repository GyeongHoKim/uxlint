/**
 * Mock implementation of useAnalysis hook for testing
 */

import type {UseAnalysisResult} from '../../source/hooks/use-analysis.js';
import type {UxLintConfig} from '../../source/models/config.js';

export function useAnalysis(config: UxLintConfig): UseAnalysisResult {
	return {
		state: {
			currentPageIndex: 0,
			totalPages: config.pages.length,
			currentStage: 'idle',
			analyses: [],
			report: undefined,
			error: undefined,
		},
		runAnalysis: async () => {
			// No-op in tests
		},
		getCurrentPageUrl: () => config.pages[0]?.url,
		onStateChange: () => () => {
			// No-op unsubscribe function
		},
	};
}
