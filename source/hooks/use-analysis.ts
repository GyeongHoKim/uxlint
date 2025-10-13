/**
 * UseAnalysis Hook
 * Orchestrates multi-page UX analysis workflow
 *
 * @packageDocumentation
 */

import {useState, useCallback, useEffect, useRef} from 'react';
import type {UxLintConfig} from '../models/config.js';
import type {
	AnalysisState,
	PageAnalysis,
	UxReport,
} from '../models/analysis.js';
import {McpPageCapture} from '../services/mcp-page-capture.js';
import {analyzePageWithAi} from '../models/ai-service.js';

/**
 * State change callback type
 */
type StateChangeCallback = (state: AnalysisState) => void;

/**
 * UseAnalysis Hook Result
 */
export type UseAnalysisResult = {
	/** Current analysis state */
	state: AnalysisState;

	/** Start the analysis workflow */
	runAnalysis: () => Promise<void>;

	/** Get current page URL being analyzed */
	getCurrentPageUrl: () => string | undefined;

	/** Subscribe to state changes */
	onStateChange: (callback: StateChangeCallback) => () => void;
};

/**
 * UseAnalysis Hook
 * Manages analysis state and orchestrates multi-page workflow
 *
 * @param config - UxLint configuration
 * @returns Analysis state and control functions
 */
export function useAnalysis(config: UxLintConfig): UseAnalysisResult {
	// Initialize state
	const [state, setState] = useState<AnalysisState>({
		currentPageIndex: 0,
		totalPages: config.pages.length,
		currentStage: 'idle',
		analyses: [],
		report: undefined,
		error: undefined,
	});

	// Track state change subscribers
	const subscribersRef = useRef<Set<StateChangeCallback>>(new Set());

	// MCP client reference
	const mcpClientRef = useRef<McpPageCapture | undefined>(undefined);

	/**
	 * Update state and notify subscribers
	 */
	const updateState = useCallback(
		(updater: (previous: AnalysisState) => AnalysisState) => {
			setState(previous => {
				const newState = updater(previous);

				// Notify all subscribers
				for (const callback of subscribersRef.current) {
					callback(newState);
				}

				return newState;
			});
		},
		[],
	);

	/**
	 * Get current page URL
	 */
	const getCurrentPageUrl = useCallback((): string | undefined => {
		const page = config.pages[state.currentPageIndex];
		return page?.url;
	}, [config.pages, state.currentPageIndex]);

	/**
	 * Subscribe to state changes
	 */
	const onStateChange = useCallback((callback: StateChangeCallback) => {
		subscribersRef.current.add(callback);

		// Return unsubscribe function
		return () => {
			subscribersRef.current.delete(callback);
		};
	}, []);

	/**
	 * Analyze a single page
	 */
	const analyzePage = useCallback(
		async (
			pageUrl: string,
			features: string,
			pageIndex: number,
		): Promise<PageAnalysis> => {
			// Initialize MCP client if needed
			mcpClientRef.current ??= new McpPageCapture();

			const mcpClient = mcpClientRef.current;

			try {
				// Stage 1: Navigating
				updateState(previous => ({
					...previous,
					currentStage: 'navigating',
					currentPageIndex: pageIndex,
				}));

				// Stage 2: Capturing
				updateState(previous => ({
					...previous,
					currentStage: 'capturing',
				}));

				const captureResult = await mcpClient.capturePage(pageUrl);

				// Stage 3: Analyzing
				updateState(previous => ({
					...previous,
					currentStage: 'analyzing',
				}));

				const analysisResult = await analyzePageWithAi({
					snapshot: captureResult.snapshot,
					pageUrl,
					features,
					personas: config.personas,
				});

				// Return successful analysis
				return {
					pageUrl,
					features,
					snapshot: captureResult.snapshot,
					findings: analysisResult.findings,
					analysisTimestamp: Date.now(),
					status: 'complete',
				};
			} catch (error) {
				// Return failed analysis
				const errorMessage =
					error instanceof Error ? error.message : 'Unknown error';

				return {
					pageUrl,
					features,
					snapshot: '',
					findings: [],
					analysisTimestamp: Date.now(),
					status: 'failed',
					error: errorMessage,
				};
			}
		},
		[config.personas, updateState],
	);

	/**
	 * Generate final report from analyses
	 */
	const generateReport = useCallback(
		(analyses: PageAnalysis[]): UxReport => {
			const successfulAnalyses = analyses.filter(a => a.status === 'complete');
			const failedAnalyses = analyses.filter(a => a.status === 'failed');

			// Collect all findings
			const allFindings = successfulAnalyses.flatMap(a => a.findings);

			// Sort findings by severity (critical > high > medium > low)
			const severityOrder = {critical: 0, high: 1, medium: 2, low: 3};
			const prioritizedFindings = [...allFindings].sort((a, b) => {
				return severityOrder[a.severity] - severityOrder[b.severity];
			});

			// Generate summary
			const summary =
				successfulAnalyses.length === 0
					? 'All pages failed analysis. Please check error messages and try again.'
					: `Analyzed ${successfulAnalyses.length} page(s) successfully. Found ${allFindings.length} UX issue(s) requiring attention.`;

			return {
				metadata: {
					timestamp: Date.now(),
					uxlintVersion: '1.0.0',
					analyzedPages: successfulAnalyses.map(a => a.pageUrl),
					failedPages: failedAnalyses.map(a => a.pageUrl),
					totalFindings: allFindings.length,
					personas: config.personas,
				},
				pages: analyses,
				summary,
				prioritizedFindings,
			};
		},
		[config.personas],
	);

	/**
	 * Run analysis workflow for all pages
	 */
	const runAnalysis = useCallback(async () => {
		const analyses: PageAnalysis[] = [];

		try {
			// Process each page sequentially (await in loop is intentional)
			for (const [index, page] of config.pages.entries()) {
				// eslint-disable-next-line no-await-in-loop
				const analysis = await analyzePage(page.url, page.features, index);
				analyses.push(analysis);

				// Update analyses array after each page
				updateState(previous => ({
					...previous,
					analyses: [...analyses],
				}));
			}

			// Stage 4: Generating report
			updateState(previous => ({
				...previous,
				currentStage: 'generating-report',
			}));

			const report = generateReport(analyses);

			// Stage 5: Complete
			updateState(previous => ({
				...previous,
				currentStage: 'complete',
				report,
			}));
		} catch (error) {
			// Fatal error that aborts entire analysis
			updateState(previous => ({
				...previous,
				currentStage: 'error',
				error: error instanceof Error ? error : new Error('Unknown error'),
			}));
		}
	}, [config.pages, analyzePage, generateReport, updateState]);

	/**
	 * Cleanup on unmount
	 */
	useEffect(() => {
		return () => {
			// Close MCP client
			if (mcpClientRef.current) {
				void mcpClientRef.current.close();
			}
		};
	}, []);

	return {
		state,
		runAnalysis,
		getCurrentPageUrl,
		onStateChange,
	};
}
