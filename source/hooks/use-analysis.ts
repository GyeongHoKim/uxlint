/**
 * UseAnalysis Hook
 * Thin wrapper around AnalysisOrchestrator for React state management
 *
 * @packageDocumentation
 */

import {useCallback, useRef, useState} from 'react';
import {experimental_createMCPClient} from '@ai-sdk/mcp';
import {Experimental_StdioMCPTransport} from '@ai-sdk/mcp/mcp-stdio';
import type {AnalysisState, PageAnalysis} from '../models/analysis.js';
import type {UxLintConfig} from '../models/config.js';
import {AIService} from '../services/ai-service.js';
import {ReportBuilder} from '../services/report-builder.js';

/**
 * State change callback type
 */
type AnalysisStateChangeCallback = (analysisState: AnalysisState) => void;

/**
 * UseAnalysis Hook Result
 */
export type UseAnalysisResult = {
	/** Current analysis state */
	analysisState: AnalysisState;

	/** Start the analysis workflow */
	runAnalysis: () => Promise<void>;

	/** Get current page URL being analyzed */
	getCurrentPageUrl: () => string | undefined;

	/** Subscribe to state changes */
	onAnalysisStateChange: (callback: AnalysisStateChangeCallback) => () => void;
};

/**
 * UseAnalysis Hook
 * Manages analysis state and delegates to AnalysisOrchestrator
 *
 * @param config - UxLint configuration
 * @returns Analysis state and control functions
 */
export function useAnalysis(config: UxLintConfig): UseAnalysisResult {
	const [analysisState, setAnalysisState] = useState<AnalysisState>({
		currentPageIndex: 0,
		totalPages: config.pages.length,
		currentStage: 'idle',
		analyses: [],
		report: undefined,
		error: undefined,
	});

	// Track state change subscribers
	const subscribersRef = useRef<Set<AnalysisStateChangeCallback>>(new Set());

	/**
	 * Update state and notify subscribers
	 */
	const updateAnalysisState = useCallback(
		(updater: (previous: AnalysisState) => AnalysisState) => {
			setAnalysisState(previous => {
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
		const page = config.pages[analysisState.currentPageIndex];
		return page?.url;
	}, [config.pages, analysisState.currentPageIndex]);

	/**
	 * Subscribe to state changes
	 */
	const subscribe = useCallback((callback: AnalysisStateChangeCallback) => {
		subscribersRef.current.add(callback);

		// Return unsubscribe function
		return () => {
			subscribersRef.current.delete(callback);
		};
	}, []);

	/**
	 * Run analysis workflow
	 * Delegates to AnalysisOrchestrator service
	 */
	const runAnalysis = useCallback(async () => {
		let client;
		try {
			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'navigating',
			}));

			// Initialize MCP Client for Playwright
			const transport = new Experimental_StdioMCPTransport({
				command: 'npx',
				args: ['-y', '@modelcontextprotocol/server-playwright'],
			});

			client = await experimental_createMCPClient({
				transport,
			});

			const reportBuilder = new ReportBuilder();
			const aiService = new AIService(client);
			const completedAnalyses: PageAnalysis[] = [];

			for (let i = 0; i < config.pages.length; i++) {
				const page = config.pages[i];
				if (!page) continue;

				updateAnalysisState(previous => ({
					...previous,
					currentPageIndex: i,
					currentStage: 'analyzing',
				}));

				try {
					// eslint-disable-next-line no-await-in-loop
					const result = await aiService.analyzePage(page, config.personas);
					completedAnalyses.push(result);

					updateAnalysisState(previous => ({
						...previous,
						analyses: [...previous.analyses, result],
					}));
				} catch (error) {
					const failedAnalysis: PageAnalysis = {
						pageUrl: page.url,
						features: page.features,
						snapshot: '',
						findings: [],
						analysisTimestamp: Date.now(),
						status: 'failed',
						error: error instanceof Error ? error.message : String(error),
					};

					completedAnalyses.push(failedAnalysis);

					updateAnalysisState(previous => ({
						...previous,
						analyses: [...previous.analyses, failedAnalysis],
					}));
				}
			}

			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'generating-report',
			}));

			// Generate report
			const report = reportBuilder.generateReport(
				completedAnalyses,
				config.personas,
			);

			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'complete',
				report,
			}));
		} catch (error) {
			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'error',
				error: error instanceof Error ? error : new Error(String(error)),
			}));
		} finally {
			if (client) {
				await client.close();
			}
		}
	}, [config, updateAnalysisState]);

	return {
		analysisState,
		runAnalysis,
		getCurrentPageUrl,
		onAnalysisStateChange: subscribe,
	};
}
