import process from 'node:process';
import {useCallback, useRef, useState} from 'react';
import {
	experimental_createMCPClient,
	type experimental_MCPClient as McpClient,
} from '@ai-sdk/mcp';
import {Experimental_StdioMCPTransport} from '@ai-sdk/mcp/mcp-stdio';
import type {AnalysisState, PageAnalysis} from '../models/analysis.js';
import type {Page, UxLintConfig} from '../models/config.js';
import {loadEnvConfig} from '../infrastructure/config/env-config.js';
import {writeReportToFile} from '../infrastructure/reports/report-generator.js';
import {ReportBuilder} from '../services/report-builder.js';
import {AIService, createModelFromEnv} from '../services/ai-service.js';

type AnalysisStateChangeCallback = (analysisState: AnalysisState) => void;

export type UseAnalysisResult = {
	analysisState: AnalysisState;
	runAnalysis: () => Promise<void>;
	getCurrentPageUrl: () => string | undefined;
	onAnalysisStateChange: (callback: AnalysisStateChangeCallback) => () => void;
};

export function useAnalysis(config: UxLintConfig): UseAnalysisResult {
	const [analysisState, setAnalysisState] = useState<AnalysisState>({
		currentPageIndex: 0,
		totalPages: config.pages.length,
		currentStage: 'idle',
		analyses: [],
		report: undefined,
		error: undefined,
	});

	const subscribersRef = useRef<Set<AnalysisStateChangeCallback>>(new Set());
	const isRunningRef = useRef(false);

	const updateAnalysisState = useCallback(
		(updater: (previous: AnalysisState) => AnalysisState) => {
			setAnalysisState(previous => {
				const newState = updater(previous);
				for (const callback of subscribersRef.current) {
					callback(newState);
				}

				return newState;
			});
		},
		[],
	);

	const getCurrentPageUrl = useCallback((): string | undefined => {
		const page = config.pages[analysisState.currentPageIndex];
		return page?.url;
	}, [config.pages, analysisState.currentPageIndex]);

	const subscribe = useCallback((callback: AnalysisStateChangeCallback) => {
		subscribersRef.current.add(callback);
		return () => {
			subscribersRef.current.delete(callback);
		};
	}, []);

	const runAnalysis = useCallback(async () => {
		if (isRunningRef.current) {
			return;
		}

		isRunningRef.current = true;
		let mcpClient: McpClient | undefined;

		updateAnalysisState(() => ({
			currentPageIndex: 0,
			totalPages: config.pages.length,
			currentStage: 'navigating',
			analyses: [],
			report: undefined,
			error: undefined,
		}));

		try {
			const envConfig = loadEnvConfig();
			const model = createModelFromEnv(envConfig);
			const reportBuilder = new ReportBuilder();
			mcpClient = await createPlaywrightClient();
			const aiService = new AIService({
				model,
				personas: config.personas,
				reportBuilder,
				mcpClient,
			});

			const analyses: PageAnalysis[] = [];
			for (let index = 0; index < config.pages.length; index += 1) {
				const page = config.pages[index];
				if (!page) {
					continue;
				}

				updateAnalysisState(previous => ({
					...previous,
					currentPageIndex: index,
					currentStage: 'navigating',
					totalPages: config.pages.length,
				}));

				updateAnalysisState(previous => ({
					...previous,
					currentStage: 'analyzing',
					totalPages: config.pages.length,
				}));

				try {
					// eslint-disable-next-line no-await-in-loop
					const analysis = await aiService.analyzePage(page);
					analyses.push(analysis);
				} catch (error) {
					analyses.push(createFailedAnalysis(page, error));
				}

				updateAnalysisState(previous => ({
					...previous,
					analyses: [...analyses],
					currentPageIndex: index,
					currentStage: 'analyzing',
					totalPages: config.pages.length,
				}));
			}

			const lastCompletedIndex = analyses.length > 0 ? analyses.length - 1 : 0;
			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'generating-report',
				analyses: [...analyses],
				currentPageIndex: lastCompletedIndex,
				totalPages: config.pages.length,
			}));

			const report = aiService.generateReport(analyses);
			await writeReportToFile(report, {outputPath: config.report.output});

			updateAnalysisState(previous => ({
				...previous,
				report,
				currentStage: 'complete',
				currentPageIndex: config.pages.length,
				analyses: [...analyses],
				error: undefined,
				totalPages: config.pages.length,
			}));
		} catch (error) {
			const capturedError = ensureError(error);
			updateAnalysisState(previous => ({
				...previous,
				currentStage: 'error',
				error: capturedError,
			}));
		} finally {
			if (mcpClient) {
				try {
					await mcpClient.close();
				} catch {
					// Ignore close errors so they don't mask analysis results
				}
			}

			isRunningRef.current = false;
		}
	}, [config, updateAnalysisState]);

	return {
		analysisState,
		runAnalysis,
		getCurrentPageUrl,
		onAnalysisStateChange: subscribe,
	};
}

function splitArgs(value: string | undefined): string[] {
	if (!value || value.trim().length === 0) {
		return ['@playwright/mcp@latest'];
	}

	const argumentPattern = /(?:[^\s"]+|"[^"]*")+/g;
	const matches = [...value.matchAll(argumentPattern)].map(match => match[0]);
	if (matches.length === 0) {
		return [value];
	}

	return matches.map(entry =>
		entry.startsWith('"') && entry.endsWith('"') ? entry.slice(1, -1) : entry,
	);
}

async function createPlaywrightClient(): Promise<McpClient> {
	const command = process.env['MCP_SERVER_COMMAND'] ?? 'npx';
	const args = splitArgs(process.env['MCP_SERVER_ARGS']);

	if (args.length === 0) {
		args.push('@playwright/mcp@latest');
	}

	const env = {
		MCP_BROWSER: process.env['MCP_BROWSER'] ?? 'chrome',
		MCP_HEADLESS: process.env['MCP_HEADLESS'] ?? 'true',
		MCP_TIMEOUT: process.env['MCP_TIMEOUT'] ?? '30000',
	};

	const transport = new Experimental_StdioMCPTransport({
		command,
		args,
		env,
	});

	return experimental_createMCPClient({
		transport,
		name: 'uxlint-playwright-mcp',
	});
}

function createFailedAnalysis(page: Page, error: unknown): PageAnalysis {
	return {
		pageUrl: page.url,
		features: page.features,
		snapshot: '',
		findings: [],
		analysisTimestamp: Date.now(),
		status: 'failed',
		error: error instanceof Error ? error.message : String(error),
	};
}

function ensureError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error(String(error));
}
