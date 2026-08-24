/**
 * Agent-loop baseline: capture and equivalence gate (008 SC-001 / SC-006).
 *
 * Drives the four canonical page scripts through the real provider client
 * with its HTTP call intercepted -- the technique proven by
 * `context-budget.spec.ts` -- and records what the CURRENT engine produces:
 * the rendered markdown report, the request bytes, and the wall clock.
 *
 * Dual mode, selected by whether the baseline artefacts exist:
 *
 * - Capture mode (artefacts absent): writes them. Used once, on the manual
 * loop, BEFORE the engine swap. Committed as the frozen "before".
 * - Compare mode (artefacts present): reruns the same scripts and asserts
 * the rendered markdown is byte-identical after normalising volatile
 * fields, and request bytes are within ±1%. Any diff is a regression until
 * proven otherwise in writing.
 *
 * Normalisation covers the two render sites that embed generation time
 * (`**Generated**:` header and the `Generated on` footer). Everything else in
 * the markdown must match byte for byte.
 */

import fs, {promises as fsPromises} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {createOpenAI} from '@ai-sdk/openai';
import {http, HttpResponse} from 'msw';
import {tool} from 'ai';
import test from 'ava';
import sinon from 'sinon';
import {z} from 'zod/v4';
import type {UxLintConfig, Page} from '../../source/models/config.js';
import {AIService} from '../../source/services/ai-service.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import {generateMarkdownReport} from '../../source/infrastructure/reports/report-generator.js';
import {
	scriptedProvider,
	providerEndpoint,
	type ScriptedReply,
} from '../mocks/handlers/provider.js';
import {ProviderRecorder} from '../mocks/provider-recorder.js';
import {server} from '../mocks/server.js';
import {mcpError, mcpResult} from '../fixtures/mcp-result.js';
import {auditReportJson} from '../fixtures/lighthouse-report.js';
import {auditSnapshotReply} from '../fixtures/lighthouse-reply.js';
import {traceWithNavigationReply as traceReply} from '../fixtures/trace-reply.js';
import {pageSnapshotFixture} from '../fixtures/page-snapshot.js';

/**
 * Where the frozen "before" lives.
 *
 * Anchored by walking up to the repository root rather than by counting
 * directories from this module: the compiled copy lives two levels deeper
 * (`dist/tests/e2e/`) than its source, and a relative guess that happens to
 * be right for one layout writes the "before" somewhere nobody will look --
 * which is exactly how a baseline silently stops being one.
 */
const locateRepoRoot = (start: string): string => {
	let current = start;
	while (!fs.existsSync(path.join(current, 'package.json'))) {
		const parent = path.dirname(current);
		if (parent === current) {
			throw new Error('Repository root not found from ' + start);
		}

		current = parent;
	}

	return current;
};

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const baselineDir = path.join(
	locateRepoRoot(moduleDirectory),
	'specs',
	'008-sdk-agent-loop',
	'baseline',
);

const baseConfig = (): UxLintConfig => ({
	mainPageUrl: 'https://example.com',
	subPageUrls: [],
	pages: [{url: 'https://example.com', features: 'Landing page'}],
	persona: 'A developer evaluating the product',
	report: {output: './ux-report.md'},
});

const findingInput = (description: string): string =>
	JSON.stringify({
		severity: 'medium',
		category: 'Navigation',
		description,
		personaRelevance: ['A developer evaluating the product'],
		recommendation: 'Raise the call to action',
		pageUrl: 'https://example.com',
	});

/**
 * A browser server offering the two tools the analysis uses, plus the
 * measurement answers reached through callTool.
 */
const browserServer = (navigateSucceeds = true): MCPClient =>
	({
		async tools() {
			return {
				navigate_page: tool({
					description: 'Navigate to a URL and wait for the page to load',
					inputSchema: z.object({url: z.string()}),
					async execute() {
						return navigateSucceeds
							? mcpResult('Successfully navigated.')
							: mcpError('Navigation failed: net::ERR_CONNECTION_REFUSED');
					},
				}),
				take_snapshot: tool({
					description: 'Capture a text snapshot of the page accessibility tree',
					inputSchema: z.object({}),
					async execute() {
						return mcpResult(pageSnapshotFixture);
					},
				}),
			};
		},
		async callTool({name}: {name: string}) {
			return mcpResult(name === 'lighthouse_audit' ? auditReply() : traceReply);
		},
		async close() {
			// Nothing to tear down.
		},
	}) as unknown as MCPClient;

/**
 * The audit's reply, pointed at a report that exists for this call only.
 * Written per call: the code under test deletes what it reads.
 */
function auditReply(): string {
	const directory = fs.mkdtempSync(
		path.join(os.tmpdir(), 'uxlint-baseline-audit-'),
	);
	fs.writeFileSync(path.join(directory, 'report.json'), auditReportJson);
	return auditSnapshotReply.replace(
		/- \S*report\.json/,
		() => `- ${path.join(directory, 'report.json')}`,
	);
}

/**
 * Remove the volatile fields from a rendered report so two runs of the same
 * engine compare byte for byte.
 *
 * @param markdown - The rendered report
 * @returns The normalised markdown
 */
const normaliseReport = (markdown: string): string =>
	markdown
		.replaceAll(/\*\*Generated\*\*:.*/g, '**Generated**: <normalised>')
		.replaceAll(/Generated on .*/g, 'Generated on <normalised>');

/**
 * One canonical case: its script, and what kind of browser answers.
 */
type CaseDefinition = {
	name: string;
	script: ScriptedReply[];
	navigateSucceeds?: boolean;
};

/**
 * The four canonical scripts.
 *
 * - happy-path: navigate, capture, judge, finish -> `complete`.
 * - budget-exhaustion: twenty tool-call replies without completion; the loop
 * spends its whole budget and closes the page `partial`.
 * - failed-navigation: navigation errors server-side; the capture is never
 * offered, completion ends it, page recorded `partial`.
 * - mid-run-failure: one good page, then the provider itself fails on the
 * next -- the report carries both.
 */
const budgetReplies: ScriptedReply[] = [
	{
		kind: 'tool-call',
		toolName: 'navigate_page',
		input: '{"url":"https://example.com"}',
	},
	{kind: 'tool-call', toolName: 'take_snapshot'},
	...Array.from({length: 18}, (_, index) => ({
		kind: 'tool-call' as const,
		toolName: 'addFinding',
		input: findingInput(`Finding ${index + 1}`),
	})),
];

const cases: CaseDefinition[] = [
	{
		name: 'happy-path',
		script: [
			{
				kind: 'tool-call',
				toolName: 'navigate_page',
				input: '{"url":"https://example.com"}',
			},
			{kind: 'tool-call', toolName: 'take_snapshot'},
			{
				kind: 'tool-call',
				toolName: 'addFinding',
				input: findingInput('The primary action is below the fold'),
			},
			{kind: 'tool-call', toolName: 'completePageAnalysis'},
		],
	},
	{name: 'budget-exhaustion', script: budgetReplies},
	{
		name: 'failed-navigation',
		script: [
			{
				kind: 'tool-call',
				toolName: 'navigate_page',
				input: '{"url":"https://example.com"}',
			},
			{kind: 'tool-call', toolName: 'completePageAnalysis'},
		],
		navigateSucceeds: false,
	},
];

/** Result of running one canonical case against the current engine. */
type CaseRecording = {
	status: string;
	requests: number;
	totalBytes: number;
	wallClockMs: number;
	markdown: string;
};

/**
 * Run a single-page case end to end and record everything the baseline needs.
 */
const recordCase = async (
	definition: CaseDefinition,
): Promise<CaseRecording> => {
	server.resetHandlers();
	const recorder = new ProviderRecorder();
	server.use(scriptedProvider(definition.script, recorder.record));

	const builder = new ReportBuilder({
		...fsPromises,
		writeFile: sinon.stub().resolves(),
	});
	const model = createOpenAI({apiKey: 'test-placeholder-never-sent'})('gpt-5');
	const service = new AIService(
		model,
		browserServer(definition.navigateSucceeds),
		builder,
	);
	const config = baseConfig();

	const started = Date.now();
	const analysis = await service.analyzePage(config, config.pages[0]!);
	const wallClockMs = Date.now() - started;

	return {
		status: analysis.status,
		requests: recorder.count,
		totalBytes: recorder.totalBytes(),
		wallClockMs,
		markdown: normaliseReport(
			generateMarkdownReport(builder.generateFinalReport()),
		),
	};
};

/**
 * The mid-run-failure case: two pages in one run, the second killed by the
 * provider itself. Retries apply (the SDK defaults to two retries), which is
 * fine -- the point is a report carrying a complete page AND a failed one.
 */
const recordMidRunFailure = async (): Promise<CaseRecording> => {
	server.resetHandlers();
	const recorder = new ProviderRecorder();
	const happyScript: ScriptedReply[] = cases[0]!.script;
	server.use(scriptedProvider(happyScript, recorder.record));

	const builder = new ReportBuilder({
		...fsPromises,
		writeFile: sinon.stub().resolves(),
	});
	const model = createOpenAI({apiKey: 'test-placeholder-never-sent'})('gpt-5');
	const service = new AIService(model, browserServer(), builder);
	const config = baseConfig();

	const started = Date.now();
	await service.analyzePage(config, config.pages[0]!);

	// The provider dies for the second page. Every attempt fails, so the
	// service's error path records the page as failed and keeps the first
	// page's work intact.
	server.resetHandlers();
	server.use(
		http.post(providerEndpoint, () =>
			HttpResponse.json(
				{error: {message: 'baseline-injected provider outage'}},
				{status: 500},
			),
		),
	);
	const secondPage: Page = {
		url: 'https://example.com/pricing',
		features: 'Pricing',
	};
	const failed = await service.analyzePage(config, secondPage);
	const wallClockMs = Date.now() - started;

	return {
		status: failed.status,
		requests: recorder.count,
		totalBytes: recorder.totalBytes(),
		wallClockMs,
		markdown: normaliseReport(
			generateMarkdownReport(builder.generateFinalReport()),
		),
	};
};

/**
 * Run every canonical case, in order.
 */
const recordAllCases = async (): Promise<Map<string, CaseRecording>> => {
	const recordings = new Map<string, CaseRecording>();
	for (const definition of cases) {
		// Sequential by design: each case rewrites global handler state.
		// eslint-disable-next-line no-await-in-loop
		recordings.set(definition.name, await recordCase(definition));
	}

	recordings.set('mid-run-failure', await recordMidRunFailure());
	return recordings;
};

test.afterEach(() => {
	server.resetHandlers();
});

test.serial(
	'agent-loop baseline: capture or verify (SC-001, SC-006)',
	async t => {
		const recordings = await recordAllCases();

		t.is(recordings.get('happy-path')?.status, 'complete');
		t.is(recordings.get('budget-exhaustion')?.status, 'partial');
		t.is(recordings.get('failed-navigation')?.status, 'partial');
		t.is(recordings.get('mid-run-failure')?.status, 'failed');

		const expectedStatuses = [
			'happy-path',
			'budget-exhaustion',
			'failed-navigation',
			'mid-run-failure',
		];
		for (const name of expectedStatuses) {
			const recording = recordings.get(name)!;
			t.true(recording.requests > 0, `${name} intercepted nothing`);
			t.true(recording.markdown.length > 100, `${name} rendered nothing`);
		}

		if (fs.existsSync(path.join(baselineDir, 'cases.json'))) {
			// ---- COMPARE MODE: the permanent equivalence gate.
			const stored = JSON.parse(
				fs.readFileSync(path.join(baselineDir, 'cases.json'), 'utf8'),
			) as Record<string, {totalBytes: number; requests: number}>;

			for (const name of expectedStatuses) {
				const current = recordings.get(name)!;
				const previous = stored[name]!;
				const markdownPath = path.join(baselineDir, `${name}.md`);
				const storedMarkdown = fs.readFileSync(markdownPath, 'utf8');

				t.is(
					current.markdown,
					storedMarkdown,
					`${name}: rendered report drifted from the frozen baseline`,
				);

				const drift =
					Math.abs(current.totalBytes - previous.totalBytes) /
					previous.totalBytes;
				t.true(
					drift <= 0.01,
					`${name}: request bytes moved ${(drift * 100).toFixed(2)}% (SC-006 allows ±1%)`,
				);
				t.log(`${name}: bytes ${current.totalBytes} vs ${previous.totalBytes}`);
			}
		} else {
			// ---- CAPTURE MODE: first run, on the manual loop. Freeze the before.
			fs.mkdirSync(baselineDir, {recursive: true});
			const summary: Record<string, unknown> = {};
			for (const [name, recording] of recordings) {
				fs.writeFileSync(
					path.join(baselineDir, `${name}.md`),
					recording.markdown,
					'utf8',
				);
				summary[name] = {
					status: recording.status,
					requests: recording.requests,
					totalBytes: recording.totalBytes,
					wallClockMs: recording.wallClockMs,
				};
			}

			fs.writeFileSync(
				path.join(baselineDir, 'cases.json'),
				JSON.stringify(summary, undefined, '\t'),
				'utf8',
			);

			const timingLines = Object.entries(summary)
				.map(([name, entry]) => {
					const values = entry as Record<string, number | string>;
					return `| ${name} | ${values['requests']} | ${values['totalBytes']} | ${values['wallClockMs']} |`;
				})
				.join('\n');

			fs.writeFileSync(
				path.join(baselineDir, '..', 'baseline.md'),
				`# 008 Baseline: pre-swap engine (manual loop)

Captured by \`tests/e2e/agent-loop-baseline.spec.ts\` in capture mode --
run ONCE on the manual loop, before the ToolLoopAgent swap, then committed
as the frozen "before". After the swap the same file runs in compare mode
and gates the change (SC-001 byte-identical, SC-006 ±1%).

Volatile fields normalised before storage: \`**Generated**:\` header and
\`Generated on\` footer (both derive from one \`Date.now()\` at render time).
Everything else in the stored markdown must reproduce byte for byte.

| case | requests | total bytes | wall clock (ms, mocked) |
| --- | --- | --- | --- |
${timingLines}

Wall clock is fixture-clock data (no network, no browser); it feeds the
SC-004 headroom calibration, not any external claim. Per-case rendered
reports sit beside this file as \`baseline/<case>.md\`; numeric captures in
\`baseline/cases.json\`.
`,
				'utf8',
			);

			t.log('baseline captured; commit specs/008-sdk-agent-loop/baseline*/');
		}
	},
);
