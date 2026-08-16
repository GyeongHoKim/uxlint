/**
 * Context budget measurements.
 *
 * Drives a full page analysis through the real provider client with its HTTP
 * call intercepted, and measures the request bodies that would have been sent.
 * Everything asserted here is a property of what the system puts into a
 * request, which is knowable without a provider account -- so these run in CI
 * on every commit rather than by hand, once, if someone remembers.
 *
 * Numbers recorded by this file live in `specs/006-context-diet/baseline.md`.
 */

import {Buffer} from 'node:buffer';
import {promises as fsPromises} from 'node:fs';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {createOpenAI} from '@ai-sdk/openai';
import {tool} from 'ai';
import test from 'ava';
import sinon from 'sinon';
import {z} from 'zod/v4';
import type {UxLintConfig} from '../../source/models/config.js';
import {AIService} from '../../source/services/ai-service.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import {
	scriptedProvider,
	type ScriptedReply,
} from '../mocks/handlers/provider.js';
import {ProviderRecorder} from '../mocks/provider-recorder.js';
import {server} from '../mocks/server.js';
import {
	toolsForStage,
	type AnalysisStage,
} from '../../source/models/analysis-stage.js';
import {
	pageSnapshotFixture,
	pageSnapshotMarker,
} from '../fixtures/page-snapshot.js';

const baseConfig = (): UxLintConfig => ({
	mainPageUrl: 'https://example.com',
	subPageUrls: [],
	pages: [{url: 'https://example.com', features: 'Landing page'}],
	persona: 'A developer evaluating the product',
	report: {output: './ux-report.md'},
});

/**
 * A browser server offering the two tools the analysis uses.
 */
const browserServer = (): MCPClient =>
	({
		async tools() {
			return {
				navigate_page: tool({
					description: 'Navigate to a URL and wait for the page to load',
					inputSchema: z.object({url: z.string()}),
					async execute() {
						return 'Successfully navigated.';
					},
				}),
				take_snapshot: tool({
					description: 'Capture a text snapshot of the page accessibility tree',
					inputSchema: z.object({}),
					async execute() {
						return pageSnapshotFixture;
					},
				}),
			};
		},
		async close() {
			// Nothing to tear down.
		},
	}) as unknown as MCPClient;

/**
 * Interception uses the project's shared server, already listening from
 * `tests/setup.ts`.
 *
 * Standing up a second `setupServer` here silently broke the measurement:
 * both instances patch global fetch, the global one is configured to bypass
 * unhandled requests, and the result was a run that recorded plausible
 * numbers describing something other than the analysis under test. The tests
 * are `serial` because handlers are global state.
 */
test.afterEach(() => {
	server.resetHandlers();
});

/**
 * Infer which stage a request belongs to from the conversation it carries.
 *
 * Derived from the transcript rather than from a counter, so the assertion
 * still holds if the loop ever issues a different number of requests.
 */
const stageOfRequest = (request: {
	body: Record<string, unknown>;
}): AnalysisStage => {
	const input = Array.isArray(request.body['input'])
		? (request.body['input'] as Array<{type?: string; name?: string}>)
		: [];

	// Read the calls the transcript actually contains. Matching on the raw
	// text would find the tool names inside the prompt itself, which mentions
	// every step it wants the model to take.
	const called = new Set(
		input
			.filter(entry => entry.type === 'function_call')
			.map(entry => entry.name),
	);

	if (!called.has('navigate_page')) {
		return 'unloaded';
	}

	return called.has('take_snapshot') ? 'analysable' : 'loaded';
};

/**
 * Run one page analysis against a scripted provider and return the recording.
 */
const analyse = async (script: ScriptedReply[]) => {
	const recorder = new ProviderRecorder();
	// Reset first: `use` prepends, so calling analyse twice within one test
	// would otherwise leave the earlier script still registered.
	server.resetHandlers();
	server.use(scriptedProvider(script, recorder.record));

	const builder = new ReportBuilder({
		...fsPromises,
		writeFile: sinon.stub().resolves(),
	});
	const model = createOpenAI({apiKey: 'test-placeholder-never-sent'})('gpt-5');
	const service = new AIService(model, browserServer(), builder);
	const config = baseConfig();

	const analysis = await service.analyzePage(config, config.pages[0]!);
	return {recorder, builder, analysis};
};

/**
 * The script a model following today's prompt produces.
 *
 * Today's instructions tell the model to call `setPageSnapshot` with the tree
 * it has just been shown, so the baseline has to include that call — a
 * baseline measured without it would describe a run nobody has, and would
 * understate what this feature removes.
 */
const promptFollowingPath: ScriptedReply[] = [
	{
		kind: 'tool-call',
		toolName: 'navigate_page',
		input: '{"url":"https://example.com"}',
	},
	{kind: 'tool-call', toolName: 'take_snapshot'},
	{
		kind: 'tool-call',
		toolName: 'setPageSnapshot',
		input: JSON.stringify({snapshot: pageSnapshotFixture}),
	},
	{
		kind: 'tool-call',
		toolName: 'addFinding',
		input: JSON.stringify({
			severity: 'medium',
			category: 'Navigation',
			description: 'The primary action is below the fold',
			personaRelevance: ['A developer evaluating the product'],
			recommendation: 'Raise the call to action',
			pageUrl: 'https://example.com',
		}),
	},
	{kind: 'tool-call', toolName: 'completePageAnalysis'},
];

/** The same analysis with no echo step. */
const happyPath: ScriptedReply[] = [
	{
		kind: 'tool-call',
		toolName: 'navigate_page',
		input: '{"url":"https://example.com"}',
	},
	{kind: 'tool-call', toolName: 'take_snapshot'},
	{
		kind: 'tool-call',
		toolName: 'addFinding',
		input: JSON.stringify({
			severity: 'medium',
			category: 'Navigation',
			description: 'The primary action is below the fold',
			personaRelevance: ['A developer evaluating the product'],
			recommendation: 'Raise the call to action',
			pageUrl: 'https://example.com',
		}),
	},
	{kind: 'tool-call', toolName: 'completePageAnalysis'},
];

test.serial(
	'the harness intercepts the provider and records what would be sent',
	async t => {
		const {recorder} = await analyse(happyPath);

		t.true(recorder.count > 0, 'requests must reach the interceptor');
		for (const request of recorder.all()) {
			t.true(request.bytes > 0);
		}
	},
);

test.serial('MEASUREMENT: request budget for one page', async t => {
	const {recorder, analysis} = await analyse(promptFollowingPath);
	const requests = recorder.all();

	// Reported rather than asserted at this stage; the thresholds arrive with
	// the baseline. Printed so a run of this file is itself the measurement.
	t.log(`requests:        ${requests.length}`);
	t.log(`total bytes:     ${recorder.totalBytes()}`);
	t.log(`median bytes:    ${recorder.medianBytes()}`);
	t.log(`tools per req:   ${requests.map(r => r.toolNames.length).join(', ')}`);
	t.log(
		`snapshot copies: ${requests.map(r => r.occurrencesOf(pageSnapshotMarker)).join(', ')}`,
	);
	t.log(`fixture bytes:   ${Buffer.byteLength(pageSnapshotFixture)}`);
	t.log(`stored snapshot: ${analysis.snapshot.length} chars`);

	// The measurement is the point, but a measurement of nothing is not one.
	t.true(requests.length > 0);
});

test.serial('the echo path is what the baseline measured', async t => {
	// Kept as the record of what this feature removed. A model can no longer
	// reach this shape -- the tool is gone and the prompt no longer asks for
	// it -- but scripting the call still puts the tree in the request twice,
	// which is precisely the cost being removed.
	const {recorder} = await analyse(promptFollowingPath);

	t.is(recorder.maxOccurrencesOf(pageSnapshotMarker), 2);
});

test.serial('the page structure is carried at most once (SC-003)', async t => {
	const {recorder} = await analyse(happyPath);

	t.is(
		recorder.maxOccurrencesOf(pageSnapshotMarker),
		1,
		'the tree should appear once, as the capture result',
	);
});

test.serial(
	'the request budget for a page is within the threshold (SC-002)',
	async t => {
		// Threshold from specs/006-context-diet/baseline.md: the recorded total of
		// 350,420 bytes, reduced by the 40% SC-002 requires.
		//
		// Total rather than median. Removing the echo removes a request, so the
		// two runs have different request counts, and a median over an even-length
		// list is the mean of the two middle values while a median over an odd one
		// is a single sample. Comparing those compares statistics, not runs.
		const budget = 210_252;
		const {recorder} = await analyse(happyPath);

		t.log(
			`requests=${recorder.count} total=${recorder.totalBytes()} median=${recorder.medianBytes()}`,
		);
		t.true(
			recorder.totalBytes() <= budget,
			`total ${recorder.totalBytes()} bytes exceeds the ${budget} budget`,
		);
	},
);

test.serial('every request carries only its stage tools (SC-004)', async t => {
	const {recorder} = await analyse(happyPath);

	for (const request of recorder.all()) {
		t.deepEqual(
			[...request.toolNames].sort(),
			[...toolsForStage(stageOfRequest(request))].sort(),
			`a request offered ${request.toolNames.join(', ')}`,
		);
	}
});

test.serial(
	'the snapshot recorded is the one the browser produced',
	async t => {
		const {analysis} = await analyse(happyPath);

		t.is(analysis.snapshot, pageSnapshotFixture);
	},
);

test.serial('the measurement is reproducible across runs (SC-008)', async t => {
	const first = await analyse(happyPath);
	const second = await analyse(happyPath);

	// A measurement that drifts between runs on one commit cannot support a
	// threshold, so reproducibility is asserted rather than assumed.
	t.is(first.recorder.totalBytes(), second.recorder.totalBytes());
	t.deepEqual(
		first.recorder.all().map(request => request.toolNames),
		second.recorder.all().map(request => request.toolNames),
	);
});
