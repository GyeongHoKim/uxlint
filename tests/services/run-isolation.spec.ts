/**
 * Run-isolation tests for the analysis run assembly (008 T006 / FR-009).
 *
 * Two consecutive analyses in one process must share nothing: not findings,
 * not pages, not persona, not provenance. Under the old module singleton a
 * failing page could erase earlier pages and a closed service poisoned the
 * next run -- these tests pin the boundary that makes both impossible.
 *
 * RED at time of writing: `createAIService` does not exist yet. The suite
 * goes green with T007.
 */

import {promises as fsPromises} from 'node:fs';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {tool} from 'ai';
import {MockLanguageModelV4} from 'ai/test';
import test from 'ava';
import sinon from 'sinon';
import {z} from 'zod/v4';
import type {UxLintConfig} from '../../source/models/config.js';
import {
	AIService,
	createAIService,
	type AnalysisRun,
} from '../../source/services/ai-service.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import {mcpResult} from '../fixtures/mcp-result.js';

const config = (): UxLintConfig => ({
	mainPageUrl: 'https://example.com',
	subPageUrls: [],
	pages: [{url: 'https://example.com', features: 'Landing page'}],
	persona: 'Isolation persona',
	report: {output: './isolation-report.md'},
});

/**
 * A model whose second turn captures and completes in one response, so each
 * run records a snapshot naming its own browser double.
 */
const modelThatCaptures = (): MockLanguageModelV4 => {
	let call = 0;

	return new MockLanguageModelV4({
		async doGenerate() {
			call++;
			const usage = {
				inputTokens: {
					total: 1,
					noCache: 1,
					cacheRead: undefined,
					cacheWrite: undefined,
				},
				outputTokens: {total: 1, text: 1, reasoning: undefined},
			};

			if (call === 1) {
				return {
					finishReason: {unified: 'tool-calls', raw: undefined},
					usage,
					content: [
						{
							type: 'tool-call',
							toolCallId: 'call-nav',
							toolName: 'navigate_page',
							input: '{"url":"https://example.com"}',
						},
					],
					warnings: [],
				};
			}

			return {
				finishReason: {unified: 'tool-calls', raw: undefined},
				usage,
				content: [
					{
						type: 'tool-call',
						toolCallId: 'call-snap',
						toolName: 'take_snapshot',
						input: '{}',
					},
					{
						type: 'tool-call',
						toolCallId: 'call-done',
						toolName: 'completePageAnalysis',
						input: '{}',
					},
				],
				warnings: [],
			};
		},
	});
};

/** A browser double whose capture names its run, so leakage is visible. */
const browserFor = (marker: string): MCPClient =>
	({
		async tools() {
			return {
				navigate_page: tool({
					description: 'Navigate',
					inputSchema: z.object({url: z.string()}),
					async execute() {
						return mcpResult(`navigated ${marker}`);
					},
				}),
				take_snapshot: tool({
					description: 'Capture',
					inputSchema: z.object({}),
					async execute() {
						return mcpResult(`snapshot of ${marker}`);
					},
				}),
			};
		},
		async close() {
			// No transport to close
		},
	}) as unknown as MCPClient;

/**
 * Drive one full page through a run and summarise what its report holds.
 */
const summarise = async (
	run: AnalysisRun,
): Promise<{pages: number; urls: string[]; snapshots: string[]}> => {
	const cfg = config();
	await run.aiService.analyzePage(cfg, cfg.pages[0]!);
	const report = run.reportBuilder.generateFinalReport();

	return {
		pages: report.pages.length,
		urls: report.pages.map(page => page.pageUrl),
		snapshots: report.pages.map(page => page.snapshot),
	};
};

test.serial('two consecutive runs share no report state', async t => {
	const first = await createAIService(config(), undefined, {
		model: modelThatCaptures(),
		client: browserFor('run-one'),
	});
	const second = await createAIService(config(), undefined, {
		model: modelThatCaptures(),
		client: browserFor('run-two'),
	});

	const firstSummary = await summarise(first);
	const secondSummary = await summarise(second);

	t.is(firstSummary.pages, 1);
	t.is(secondSummary.pages, 1, 'the second run inherited no pages');
	t.deepEqual(firstSummary.urls, ['https://example.com']);
	t.deepEqual(secondSummary.urls, ['https://example.com']);
	t.notDeepEqual(
		firstSummary.snapshots,
		secondSummary.snapshots,
		'a snapshot naming run-one must never appear in run-two',
	);
	t.true(firstSummary.snapshots[0]?.includes('run-one'));
	t.true(secondSummary.snapshots[0]?.includes('run-two'));
});

test.serial(
	'closing the first service leaves the second untouched',
	async t => {
		const first = await createAIService(config(), undefined, {
			model: modelThatCaptures(),
			client: browserFor('first'),
		});
		const second = await createAIService(config(), undefined, {
			model: modelThatCaptures(),
			client: browserFor('second'),
		});

		await first.aiService.close();

		const secondSummary = await summarise(second);
		t.is(secondSummary.pages, 1, 'a closed sibling must not reset another run');
	},
);

test.serial(
	'a closed service still answers with a failed page naming the cause',
	async t => {
		const sandbox = sinon.createSandbox();
		const service = new AIService(
			modelThatCaptures(),
			browserFor('doomed'),
			new ReportBuilder({
				...fsPromises,
				writeFile: sandbox.stub().resolves(),
			}),
		);

		await service.close();

		const cfg = config();
		const analysis = await service.analyzePage(cfg, cfg.pages[0]!);

		t.is(analysis.status, 'failed');
		t.true(
			analysis.error?.includes('closed') ?? false,
			'the failure must name the real cause',
		);
		sandbox.restore();
	},
);
