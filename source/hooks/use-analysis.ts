/**
 * UseAnalysis Hook
 * Thin wrapper around AIService for React state management
 *
 * @packageDocumentation
 */

import {
	experimental_createMCPClient as createMCPClient,
	type experimental_MCPClient as MCPClient,
} from '@ai-sdk/mcp';
import {Experimental_StdioMCPTransport as StdioMCPTransport} from '@ai-sdk/mcp/mcp-stdio';
import {useCallback, useRef, useState} from 'react';
import type {AnalysisStage, AnalysisState} from '../models/analysis.js';
import type {UxLintConfig} from '../models/config.js';
import {loadEnvConfig} from '../infrastructure/config/env-config.js';
import {ReportBuilder} from '../services/report-builder.js';
import {
	AIService,
	createLanguageModel,
	createPlaywrightMCPClient,
} from '../services/ai-service.js';

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
 * Manages analysis state and delegates to AIService
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

	// Track MCP client for cleanup
	const mcpClientRef = useRef<MCPClient | undefined>(undefined);

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
	 * Uses AIService with Manual Agent Loop pattern
	 */
	const runAnalysis = useCallback(async () => {
		let aiService: AIService | undefined;

		try {
			// Load environment configuration
			const envConfig = loadEnvConfig();

			// Create language model
			const model = await createLanguageModel(envConfig);

			// Create MCP client for Playwright
			const mcpClient = await createPlaywrightMCPClient(
				createMCPClient,
				StdioMCPTransport,
			);
			mcpClientRef.current = mcpClient;

			// Create AI Service
			aiService = new AIService(model, mcpClient, config);

			// Create Report Builder
			const reportBuilder = new ReportBuilder();

			// Process each page sequentially - await in loop is intentional
			for (let i = 0; i < config.pages.length; i++) {
				const page = config.pages[i];

				if (!page) continue;

				// Update state - navigating
				updateAnalysisState(previous => ({
					...previous,
					currentPageIndex: i,
					currentStage: 'navigating',
				}));

				// Analyze page with progress callback
				// eslint-disable-next-line no-await-in-loop
				const pageAnalysis = await aiService.analyzePage(
					page,
					(stage: AnalysisStage, _message?: string) => {
						updateAnalysisState(previous => ({
							...previous,
							currentStage: stage,
						}));
					},
				);

				// Update state with analysis result
				updateAnalysisState(previous => ({
					...previous,
					analyses: [...previous.analyses, pageAnalysis],
				}));
			}

			// Generate report
			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'generating-report',
			}));

			// Get final analyses from state
			let finalAnalyses: typeof analysisState.analyses = [];
			setAnalysisState(previous => {
				finalAnalyses = previous.analyses;
				return previous;
			});

			const report = reportBuilder.generateReport(
				finalAnalyses,
				config.personas,
			);

			// Update state with report
			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'complete',
				report,
			}));
		} catch (error) {
			const analysisError =
				error instanceof Error ? error : new Error('Unknown error');

			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'error',
				error: analysisError,
			}));
		} finally {
			// Cleanup MCP client
			if (aiService) {
				await aiService.close();
			}

			mcpClientRef.current = undefined;
		}
		// Note: analysisState is intentionally excluded to prevent infinite re-renders
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [config, updateAnalysisState]);

	return {
		analysisState,
		runAnalysis,
		getCurrentPageUrl,
		onAnalysisStateChange: subscribe,
	};
}
