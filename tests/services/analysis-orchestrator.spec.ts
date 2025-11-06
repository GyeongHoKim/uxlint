/**
 * Analysis Orchestrator Tests
 * Unit tests for multi-page analysis workflow orchestration
 */

import {jest} from '@jest/globals';
import type {experimental_MCPClient} from 'ai';
import type {UxLintConfig} from '../../source/models/config.js';

// Mock dependencies
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const mockMcpClient: experimental_MCPClient = {
	close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	tools: jest.fn<() => Promise<Record<string, any>>>().mockResolvedValue({}),
} as any;

const mockMcpClientFactory = {
	createClient: jest
		.fn<() => Promise<experimental_MCPClient>>()
		.mockResolvedValue(mockMcpClient),
};

const mockAnalyzePageWithAi =
	jest.fn<() => Promise<{findings: any[]; summary: string}>>();
const mockReportBuilder = {
	generateReport: jest.fn().mockReturnValue({
		metadata: {
			timestamp: Date.now(),
			uxlintVersion: '1.0.0',
			analyzedPages: [],
			failedPages: [],
			totalFindings: 0,
			personas: [],
		},
		pages: [],
		summary: 'Test summary',
		prioritizedFindings: [],
	}),
};
const mockWriteReportToFile = jest
	.fn<() => Promise<void>>()
	.mockResolvedValue(undefined);

// Setup mocks
jest.unstable_mockModule(
	'../../source/infrastructure/mcp/mcp-client-factory.js',
	() => ({
		McpClientFactory: jest.fn().mockImplementation(() => mockMcpClientFactory),
	}),
);

jest.unstable_mockModule('../../source/services/ai-service.js', () => ({
	analyzePageWithAi: mockAnalyzePageWithAi,
}));

jest.unstable_mockModule('../../source/services/report-builder.js', () => ({
	ReportBuilder: jest.fn().mockImplementation(() => mockReportBuilder),
}));

jest.unstable_mockModule(
	'../../source/infrastructure/reports/report-generator.js',
	() => ({
		writeReportToFile: mockWriteReportToFile,
	}),
);

// Dynamic imports after mocks
const {AnalysisOrchestrator} = await import(
	'../../source/services/analysis-orchestrator.js'
);

describe('AnalysisOrchestrator', () => {
	let orchestrator: InstanceType<typeof AnalysisOrchestrator>;

	beforeEach(() => {
		orchestrator = new AnalysisOrchestrator();
		jest.clearAllMocks();

		// Default successful analysis
		mockAnalyzePageWithAi.mockResolvedValue({
			findings: [],
			summary: 'Test summary',
		});
	});

	describe('analyzePages', () => {
		test('initializes MCP client before analysis', async () => {
			const config: UxLintConfig = {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [
					{
						url: 'https://example.com',
						features: 'Login form',
					},
				],
				personas: ['User'],
				report: {
					output: './report.md',
				},
			};

			await orchestrator.analyzePages(config);

			expect(mockMcpClientFactory.createClient).toHaveBeenCalledTimes(1);
		});

		test('analyzes each page sequentially', async () => {
			const config: UxLintConfig = {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [
					{url: 'https://page1.com', features: 'Features 1'},
					{url: 'https://page2.com', features: 'Features 2'},
				],
				personas: ['User'],
				report: {output: './report.md'},
			};

			await orchestrator.analyzePages(config);

			expect(mockAnalyzePageWithAi).toHaveBeenCalledTimes(2);
			expect(mockAnalyzePageWithAi).toHaveBeenNthCalledWith(
				1,
				{
					pageUrl: 'https://page1.com',
					features: 'Features 1',
					personas: ['User'],
				},
				undefined,
				mockMcpClient,
			);
			expect(mockAnalyzePageWithAi).toHaveBeenNthCalledWith(
				2,
				{
					pageUrl: 'https://page2.com',
					features: 'Features 2',
					personas: ['User'],
				},
				undefined,
				mockMcpClient,
			);
		});

		test('passes personas to AI analysis', async () => {
			const config: UxLintConfig = {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [{url: 'https://example.com', features: 'Features'}],
				personas: ['Screen reader user', 'Mobile user'],
				report: {output: './report.md'},
			};

			await orchestrator.analyzePages(config);

			expect(mockAnalyzePageWithAi).toHaveBeenCalledWith(
				expect.objectContaining({
					personas: ['Screen reader user', 'Mobile user'],
				}),
				undefined,
				mockMcpClient,
			);
		});

		test('generates report from analyses', async () => {
			const config: UxLintConfig = {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [{url: 'https://example.com', features: 'Features'}],
				personas: ['User'],
				report: {output: './report.md'},
			};

			await orchestrator.analyzePages(config);

			expect(mockReportBuilder.generateReport).toHaveBeenCalledTimes(1);
			expect(mockReportBuilder.generateReport).toHaveBeenCalledWith(
				expect.any(Array),
				['User'],
			);
		});

		test('writes report to configured output path', async () => {
			const config: UxLintConfig = {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [{url: 'https://example.com', features: 'Features'}],
				personas: ['User'],
				report: {output: './custom-report.md'},
			};

			await orchestrator.analyzePages(config);

			expect(mockWriteReportToFile).toHaveBeenCalledWith(expect.anything(), {
				outputPath: './custom-report.md',
			});
		});

		test('closes MCP client after analysis completes', async () => {
			const config: UxLintConfig = {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [{url: 'https://example.com', features: 'Features'}],
				personas: ['User'],
				report: {output: './report.md'},
			};

			await orchestrator.analyzePages(config);

			expect(mockMcpClient.close).toHaveBeenCalledTimes(1);
		});

		test('closes MCP client even if analysis fails', async () => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			(mockAnalyzePageWithAi as any).mockRejectedValue(
				new Error('Analysis failed'),
			);

			const config: UxLintConfig = {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [{url: 'https://example.com', features: 'Features'}],
				personas: ['User'],
				report: {output: './report.md'},
			};

			await orchestrator.analyzePages(config);

			expect(mockMcpClient.close).toHaveBeenCalledTimes(1);
		});

		test('handles failed page analysis gracefully', async () => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			(mockAnalyzePageWithAi as any).mockRejectedValue(
				new Error('Network error'),
			);

			const config: UxLintConfig = {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [{url: 'https://example.com', features: 'Features'}],
				personas: ['User'],
				report: {output: './report.md'},
			};

			const report = await orchestrator.analyzePages(config);

			expect(report).toBeDefined();
			expect(mockReportBuilder.generateReport).toHaveBeenCalled();
		});

		test('calls progress callback during analysis', async () => {
			const progressCallback = jest.fn();
			const config: UxLintConfig = {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [
					{url: 'https://page1.com', features: 'Features 1'},
					{url: 'https://page2.com', features: 'Features 2'},
				],
				personas: ['User'],
				report: {output: './report.md'},
			};

			await orchestrator.analyzePages(config, progressCallback);

			// Should call for navigating, analyzing each page, and generating report
			expect(progressCallback).toHaveBeenCalled();
			expect(progressCallback).toHaveBeenCalledWith(
				expect.objectContaining({
					stage: 'navigating',
					currentPageIndex: 0,
					totalPages: 2,
				}),
			);
			expect(progressCallback).toHaveBeenCalledWith(
				expect.objectContaining({
					stage: 'generating-report',
				}),
			);
		});
	});
});
