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
import {notTaken, taken} from '../../source/models/measurement.js';
import {AIService} from '../../source/services/ai-service.js';
import type {MeasurementService} from '../../source/services/measurement.js';
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

/**
 * One model for a two-page run, scripted per call.
 *
 * Its first reply hangs forever (page one expires against the bound); every
 * later reply replays navigate → capture+complete (page two analyses
 * normally). Sharing one instance is the point: the service sees a single
 * model across pages, exactly as production does.
 */
const modelThatHangsThenCaptures = (): MockLanguageModelV4 => {
	let call = 0;

	return new MockLanguageModelV4({
		async doGenerate() {
			call++;

			if (call === 1) {
				return new Promise<never>(() => {
					// Page one: never settles, never observes any signal.
				});
			}

			const pageTwoCall = call - 1;
			const content =
				pageTwoCall === 1
					? [
							{
								type: 'tool-call' as const,
								toolCallId: 'call-nav-2',
								toolName: 'navigate_page',
								input: '{"url":"https://example.com/fine"}',
							},
						]
					: [
							{
								type: 'tool-call' as const,
								toolCallId: 'call-snap-2',
								toolName: 'take_snapshot',
								input: '{}',
							},
							{
								type: 'tool-call' as const,
								toolCallId: 'call-done-2',
								toolName: 'completePageAnalysis',
								input: '{}',
							},
						];

			return {
				finishReason: {unified: 'tool-calls' as const, raw: undefined},
				usage: {
					inputTokens: {
						total: 1,
						noCache: 1,
						cacheRead: undefined,
						cacheWrite: undefined,
					},
					outputTokens: {total: 1, text: 1, reasoning: undefined},
				},
				content,
				warnings: [],
			};
		},
	});
};

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

const usage = {
	inputTokens: {
		total: 1,
		noCache: 1,
		cacheRead: undefined,
		cacheWrite: undefined,
	},
	outputTokens: {total: 1, text: 1, reasoning: undefined},
};

/** One model turn: the tools it calls, and how long it thinks first. */
type ScriptedTurn = {
	readonly delayMs?: number;
	readonly calls: ReadonlyArray<{readonly id: string; readonly name: string}>;
};

/** A model that replays the given turns, repeating the last one forever. */
const modelForTurns = (turns: readonly ScriptedTurn[]): MockLanguageModelV4 => {
	let call = 0;

	return new MockLanguageModelV4({
		async doGenerate() {
			const turn = turns[Math.min(call, turns.length - 1)]!;
			call++;

			if (turn.delayMs) {
				await new Promise(resolve => {
					setTimeout(resolve, turn.delayMs);
				});
			}

			return {
				finishReason: {unified: 'tool-calls', raw: undefined},
				usage,
				content: turn.calls.map(({id, name}) => ({
					type: 'tool-call' as const,
					toolCallId: id,
					toolName: name,
					input:
						name === 'navigate_page' ? '{"url":"https://example.com"}' : '{}',
				})),
				warnings: [],
			};
		},
	});
};

/**
 * A page that captures, then holds its page open before completing.
 *
 * The hold is the point: a stale write from an already-expired page can only
 * be observed landing somewhere if some other page is open when it arrives.
 */
const modelThatLingers = (lingerMs: number): MockLanguageModelV4 =>
	modelForTurns([
		{calls: [{id: 'call-nav', name: 'navigate_page'}]},
		{calls: [{id: 'call-snap', name: 'take_snapshot'}]},
		{
			delayMs: lingerMs,
			calls: [{id: 'call-done', name: 'completePageAnalysis'}],
		},
	]);

/** A page that reaches `analysable` and then never completes on its own. */
const modelThatCapturesAndWaits = (): MockLanguageModelV4 =>
	modelForTurns([
		{calls: [{id: 'call-nav', name: 'navigate_page'}]},
		{calls: [{id: 'call-snap', name: 'take_snapshot'}]},
		{delayMs: 10_000, calls: [{id: 'call-idle', name: 'take_snapshot'}]},
	]);

/** A measurement that takes `delayMs` and is identifiable in a report. */
const measurementTaking = (
	delayMs: number,
	engineVersion: string,
	ruleId: string,
): MeasurementService =>
	({
		async measure() {
			if (delayMs > 0) {
				await new Promise(resolve => {
					setTimeout(resolve, delayMs);
				});
			}

			return {
				audit: taken({
					scores: {accessibility: 50},
					violations: [
						{
							ruleId,
							title: `Violation from ${engineVersion}`,
							impact: 'serious' as const,
							affectedElements: 1,
						},
					],
					engineVersion,
					snapshotMode: true,
				}),
				trace: notTaken('tool-failed'),
			};
		},
	}) as unknown as MeasurementService;

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
		const service = makeService(modelThatHangsThenCaptures(), browserFor({}));
		const cfg = configWithBound(BOUND_MS, [
			'https://example.com/stuck',
			'https://example.com/fine',
		]);

		const stuck = await service.analyzePage(cfg, cfg.pages[0]!);
		const fine = await service.analyzePage(cfg, cfg.pages[1]!);

		t.is(stuck.status, 'partial');
		t.regex(stuck.error ?? '', /time bound/);

		// One shared model, scripted per call: its first reply hangs past the
		// bound, and every later reply drives a normal analysis. The second
		// page finishing `complete` is what shows an expiry wedged nothing --
		// neither the engine nor the report state the next page writes into.
		t.is(fine.status, 'complete');
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
	'a late capture from an expired page never lands in the page open after it',
	async t => {
		const sandbox = sinon.createSandbox();
		// ONE builder shared by both pages -- exactly the shape a run has.
		const builder = new ReportBuilder({
			...fsPromises,
			writeFile: sandbox.stub().resolves(),
		});

		const serviceA = new AIService(
			modelThatCaptures(),
			browserFor({snapshotDelayMs: 400, marker: 'A'}),
			builder,
		);
		// B holds its page open past the moment A's abandoned capture resolves,
		// which is the only window in which the stale write could land anywhere.
		const serviceB = new AIService(
			modelThatLingers(600),
			browserFor({marker: 'B'}),
			builder,
		);

		const boundA = configWithBound(BOUND_MS, ['https://example.com/a']);
		// B is deliberately unbounded on this timescale: a page that expired
		// too would close before the stale write could reach it, and the test
		// would pass without exercising anything.
		const openB = configWithBound(60_000, ['https://example.com/b']);

		const pageA = await serviceA.analyzePage(boundA, boundA.pages[0]!);
		t.is(pageA.status, 'partial');
		t.regex(pageA.error ?? '', /time bound/);

		const pageB = await serviceB.analyzePage(openB, openB.pages[0]!);

		t.is(pageB.status, 'complete');
		t.is(
			pageB.snapshot,
			'snapshot of B',
			"page A's abandoned engine call must not write into page B's record",
		);

		await serviceA.close();
		await serviceB.close();
		sandbox.restore();
	},
);

test.serial(
	'a measurement outliving its page never lands in the page open after it',
	async t => {
		const sandbox = sinon.createSandbox();
		const builder = new ReportBuilder({
			...fsPromises,
			writeFile: sandbox.stub().resolves(),
		});

		// A reaches `analysable`, starts measuring, and expires mid-measurement.
		const serviceA = new AIService(
			modelThatCapturesAndWaits(),
			browserFor({marker: 'A'}),
			builder,
			{measurement: measurementTaking(400, 'engine-A', 'stale-rule')},
		);
		const serviceB = new AIService(
			modelThatLingers(600),
			browserFor({marker: 'B'}),
			builder,
			{measurement: measurementTaking(0, 'engine-B', 'own-rule')},
		);

		const boundA = configWithBound(BOUND_MS, ['https://example.com/a']);
		const openB = configWithBound(60_000, ['https://example.com/b']);

		const pageA = await serviceA.analyzePage(boundA, boundA.pages[0]!);
		t.is(pageA.status, 'partial');

		const pageB = await serviceB.analyzePage(openB, openB.pages[0]!);

		const audit = pageB.measurement?.audit;
		t.is(
			audit?.state === 'taken' ? audit.value.engineVersion : undefined,
			'engine-B',
			"page A's straggling measurement must not overwrite page B's",
		);
		t.false(
			pageB.findings.some(finding => finding.ruleId === 'stale-rule'),
			"page A's measured violations must not be filed against page B",
		);

		await serviceA.close();
		await serviceB.close();
		sandbox.restore();
	},
);

test.serial(
	'an expired page reports no further progress once it is closed out',
	async t => {
		const service = makeService(
			modelThatCaptures(),
			browserFor({snapshotDelayMs: 400, marker: 'late'}),
		);
		const cfg = configWithBound(BOUND_MS);

		let settled = false;
		const afterSettle: string[] = [];

		const analysis = await service.analyzePage(cfg, cfg.pages[0]!, stage => {
			if (settled) {
				afterSettle.push(stage);
			}
		});
		settled = true;

		// Long enough for the abandoned engine call to finish its in-flight step.
		await new Promise(resolve => {
			setTimeout(resolve, 600);
		});

		t.is(analysis.status, 'partial');
		t.deepEqual(
			afterSettle,
			[],
			'an abandoned engine call must not narrate over the page that follows it',
		);

		await service.close();
	},
);
