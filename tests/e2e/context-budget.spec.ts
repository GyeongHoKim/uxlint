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

test.serial('today the tree is carried twice in the same request', async t => {
	const {recorder} = await analyse(promptFollowingPath);

	// The duplication this feature removes, asserted rather than described:
	// once as the capture tool's result, once as the echo call's argument.
	t.is(
		recorder.maxOccurrencesOf(pageSnapshotMarker),
		2,
		'a request should currently carry the page structure twice',
	);
});

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
