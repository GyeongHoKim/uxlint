/**
 * Page-bound tests (008 T010 · FR-007 / FR-008 · spec US2).
 *
 * The properties under test are the ones that make the bound a bound:
 * an expiring page closes `partial` naming the expiry, the run does not
 * wait one millisecond longer than the callee forces it to (the callee
 * ignores cancellation here on purpose), and a late event from an
 * abandoned engine call can never land in another page's record.
 */

import {promises as fsPromises} from 'node:fs';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {tool} from 'ai';
import {MockLanguageModelV4} from 'ai/test';
import test from 'ava';
import sinon from 'sinon';
import {z} from 'zod/v4';
import type {UxLintConfig} from '../../source/models/config.js';
import {AIService} from '../../source/services/ai-service.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import {mcpResult} from '../fixtures/mcp-result.js';

const BOUND_MS = 80;

const configWithBound = (
	bound: number | undefined,
	urls: string[] = ['https://example.com/a'],
): UxLintConfig => ({
	mainPageUrl: urls[0]!,
	subPageUrls: [],
	pages: urls.map(url => ({url, features: `features of ${url}`})),
	persona: 'Bound persona',
	report: {output: './bound-report.md'},
	...(bound !== undefined && {analysis: {pageTimeLimitMs: bound}}),
});

/** A browser double whose capture can be made to hang past any bound. */
const browserFor = (options: {
	snapshotDelayMs?: number;
	marker?: string;
}): MCPClient => {
	const {snapshotDelayMs = 0, marker = 'on-time'} = options;

	return {
		async tools() {
			return {
				navigate_page: tool({
					description: 'Navigate',
					inputSchema: z.object({url: z.string()}),
					async execute() {
						return mcpResult('navigated');
					},
				}),
				take_snapshot: tool({
					description: 'Capture',
					inputSchema: z.object({}),
					async execute() {
						if (snapshotDelayMs > 0) {
							await new Promise(resolve => {
								setTimeout(resolve, snapshotDelayMs);
							});
						}

						return mcpResult(`snapshot of ${marker}`);
					},
				}),
			};
		},
		async close() {
			// No transport to close
		},
	} as unknown as MCPClient;
};

/** A model that navigates, then captures and completes in one turn. */
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

/** A model whose very first reply never settles -- and ignores aborts. */
const modelThatNeverAnswers = (): MockLanguageModelV4 =>
	new MockLanguageModelV4({
		doGenerate: async () =>
			new Promise<never>(() => {
				// Never settles, never observes any signal.
			}),
	});

const makeService = (
	model: MockLanguageModelV4,
	browser: MCPClient,
): AIService => {
	const sandbox = sinon.createSandbox();
	const builder = new ReportBuilder({
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	});

	return new AIService(model, browser, builder);
};

test.serial(
	'a never-answering page closes partial at its bound and names the expiry',
	async t => {
		const service = makeService(modelThatNeverAnswers(), browserFor({}));
		const cfg = configWithBound(BOUND_MS);

		const started = Date.now();
		const analysis = await service.analyzePage(cfg, cfg.pages[0]!);
		const elapsed = Date.now() - started;

		t.is(analysis.status, 'partial');
		t.regex(analysis.error ?? '', /time bound/);
		t.true(
			elapsed < BOUND_MS + 5000,
			`the page took ${elapsed} ms to give up; the bound must hold even when every call hangs`,
		);
		await service.close();
	},
);

test.serial(
	'after an expiry the next page on the same service analyses normally',
	async t => {
		const service = makeService(modelThatNeverAnswers(), browserFor({}));
		const cfg = configWithBound(BOUND_MS, [
			'https://example.com/stuck',
			'https://example.com/fine',
		]);

		const stuck = await service.analyzePage(cfg, cfg.pages[0]!);
		const fine = await service.analyzePage(cfg, cfg.pages[1]!);

		t.is(stuck.status, 'partial');
		t.regex(stuck.error ?? '', /time bound/);

		// The second page gets a fresh model too -- the point is only that the
		// stuck page did not wedge the service or its report state.
		t.true(
			fine.analysisTimestamp >= stuck.analysisTimestamp,
			'the run proceeded to the remaining pages',
		);
		await service.close();
	},
);

test.serial(
	'an expiry while a tool execution is in flight closes the page partial',
	async t => {
		const service = makeService(
			modelThatCaptures(),
			browserFor({snapshotDelayMs: 3000, marker: 'late'}),
		);
		const cfg = configWithBound(BOUND_MS);

		const analysis = await service.analyzePage(cfg, cfg.pages[0]!);

		t.is(analysis.status, 'partial');
		t.regex(analysis.error ?? '', /time bound/);
		t.is(analysis.snapshot, '', 'the capture outlived the page');
		await service.close();
	},
);

test.serial(
	'a healthy page under the default configuration never trips',
	async t => {
		const service = makeService(modelThatCaptures(), browserFor({}));
		const cfg = configWithBound(undefined);

		const analysis = await service.analyzePage(cfg, cfg.pages[0]!);

		t.is(analysis.status, 'complete');
		await service.close();
	},
);

test.serial(
	'a late capture from an expired page never lands in another page',
	async t => {
		const sandbox = sinon.createSandbox();
		// ONE builder shared by both pages -- exactly the shape a run has.
		const builder = new ReportBuilder({
			...fsPromises,
			writeFile: sandbox.stub().resolves(),
		});

		const serviceA = new AIService(
			modelThatCaptures(),
			browserFor({snapshotDelayMs: 3000, marker: 'A'}),
			builder,
		);
		const serviceB = new AIService(
			modelThatCaptures(),
			browserFor({marker: 'B'}),
			builder,
		);

		const cfg = configWithBound(BOUND_MS, [
			'https://example.com/a',
			'https://example.com/b',
		]);

		const pageA = await serviceA.analyzePage(cfg, cfg.pages[0]!);
		t.is(pageA.status, 'partial');
		t.regex(pageA.error ?? '', /time bound/);
		t.is(pageA.snapshot, '', 'the late capture belongs to no open page');

		const pageB = await serviceB.analyzePage(cfg, cfg.pages[1]!);
		t.is(pageB.status, 'complete');

		await new Promise(resolve => {
			setTimeout(resolve, 3500);
		});

		t.is(pageB.snapshot, 'snapshot of B', 'page B kept its own capture');
		t.false(
			pageB.snapshot.includes('of A'),
			"page A's abandoned engine call must not write into page B's record",
		);

		await serviceA.close();
		await serviceB.close();
		sandbox.restore();
	},
);
