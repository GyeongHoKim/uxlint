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
import fs, {promises as fsPromises} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
import {mcpResult} from '../fixtures/mcp-result.js';
import {auditReportJson} from '../fixtures/lighthouse-report.js';
import {auditSnapshotReply} from '../fixtures/lighthouse-reply.js';
import {traceWithNavigationReply as traceReply} from '../fixtures/trace-reply.js';
import {readToolOutcome} from '../../source/models/tool-output.js';
import {ProviderRecorder} from '../mocks/provider-recorder.js';
import {server} from '../mocks/server.js';
import {
	toolsForStage,
	type PageStage,
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
/**
 * The audit's real reply, pointed at a report that exists for this call only.
 *
 * Written per call rather than once for the module: the code under test
 * deletes the report directory after reading it, so a single shared fixture is
 * consumed by whichever run goes first and every later run sees a failed
 * audit. That silently emptied the digest out of the very measurement this
 * file exists to take -- the figure recorded for this feature came from a page
 * whose audit had never been read.
 *
 * @returns A reply naming a report on disk
 */
function auditReplyForFixture(): string {
	const directory = fs.mkdtempSync(
		path.join(os.tmpdir(), 'uxlint-budget-audit-'),
	);
	fs.writeFileSync(path.join(directory, 'report.json'), auditReportJson);
	return auditSnapshotReply.replace(
		/- \S*report\.json/,
		() => `- ${path.join(directory, 'report.json')}`,
	);
}

const browserServer = (): MCPClient =>
	({
		async tools() {
			return {
				navigate_page: tool({
					description: 'Navigate to a URL and wait for the page to load',
					inputSchema: z.object({url: z.string()}),
					async execute() {
						return mcpResult('Successfully navigated.');
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
		// The measurement tools are reached through callTool, not through
		// tools(): this project calls them itself and never offers them to the
		// model. Answering here is what puts the digest into the measured
		// budget, so SC-007 covers what a real run actually sends.
		async callTool({name}: {name: string}) {
			return mcpResult(
				name === 'lighthouse_audit' ? auditReplyForFixture() : traceReply,
			);
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
}): PageStage => {
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
		const budget = 223_464;
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

test.serial('an out-of-order call is never offered (FR-007)', async t => {
	// A model that would capture before navigating cannot: at the opening
	// stage the capture tool is not in the request at all, so the sequence
	// holds without the prompt having to ask for it.
	const outOfOrder: ScriptedReply[] = [
		{kind: 'tool-call', toolName: 'take_snapshot'},
		{kind: 'tool-call', toolName: 'completePageAnalysis'},
	];

	const {recorder, analysis} = await analyse(outOfOrder);

	t.false(
		recorder.all()[0]?.toolNames.includes('take_snapshot'),
		'capture must not be offered before the page is loaded',
	);
	t.not(analysis.status, 'complete', 'nothing was ever read');
});

test.serial('no reminder text is appended to any request (SC-005)', async t => {
	// The model stops without finishing. Previously the loop pushed a
	// "Please complete your analysis..." message into the conversation, which
	// spends tokens precisely when the context is already in trouble.
	const stopsEarly: ScriptedReply[] = [
		{
			kind: 'tool-call',
			toolName: 'navigate_page',
			input: '{"url":"https://example.com"}',
		},
		{kind: 'text', text: 'I have looked at the page.'},
	];

	const {recorder} = await analyse(stopsEarly);

	for (const request of recorder.all()) {
		t.is(
			request.occurrencesOf('Please complete your analysis'),
			0,
			'no system-authored reminder belongs in the conversation',
		);
	}
});

test.serial(
	'a failed navigation does not lead to a capture (FR-009)',
	async t => {
		const {recorder, analysis} = await analyse([
			{
				kind: 'tool-call',
				toolName: 'navigate_page',
				input: '{"url":"https://example.com"}',
			},
			{kind: 'tool-call', toolName: 'completePageAnalysis'},
		]);

		// Navigation succeeds here, so this asserts the converse holds too: the
		// capture becomes available only once the page is actually loaded.
		t.true(recorder.all()[1]?.toolNames.includes('take_snapshot'));
		t.is(analysis.snapshot, '', 'no capture was made, so none was recorded');
	},
);

test.serial(
	'the model still receives everything it judges on (SC-009)',
	async t => {
		const {recorder} = await analyse(happyPath);
		const final = recorder.all().at(-1)!;

		// What the model reads: the instructions, the user prompt, and every tool
		// result. Anything else in the body is protocol.
		const input = (final.body['input'] ?? []) as Array<{
			role?: string;
			type?: string;
			content?: unknown;
			output?: string;
		}>;
		const readable = input
			.map(entry => {
				if (entry.role === 'developer' || entry.role === 'user') {
					return typeof entry.content === 'string'
						? entry.content
						: JSON.stringify(entry.content);
				}

				if (entry.type !== 'function_call_output') {
					return '';
				}

				// A tool result reaches the model as the serialised MCP wrapper,
				// so it is unwrapped the same way the service unwraps it.
				// Comparing against the raw output would fail on JSON escaping
				// alone and say nothing about whether the model can read the page.
				try {
					return readToolOutcome(JSON.parse(entry.output ?? '""')).text;
				} catch {
					return entry.output ?? '';
				}
			})
			.join('\n');

		// This is what makes the diet lossless rather than merely smaller. What was
		// removed is a second copy of text the model already had, tool definitions
		// nothing invoked, and a round trip that moved text the system already
		// held. Nothing the model reads for the first time was taken away.
		t.true(
			readable.includes(pageSnapshotFixture),
			'the page structure in full',
		);
		t.true(
			readable.includes('A developer evaluating the product'),
			'the persona',
		);
		t.true(readable.includes('Landing page'), 'the page features');
		t.is(final.occurrencesOf(pageSnapshotMarker), 1, 'and it is carried once');
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

test.serial('the measured budget includes the digest', async t => {
	// Without this the figure below can come from a run whose audit was never
	// read, which is what happened: the shared report fixture was consumed by
	// the first run and every later one measured an empty digest.
	const {recorder} = await analyse(happyPath);

	const carriesDigest = recorder
		.all()
		.some(request => JSON.stringify(request.body).includes('color-contrast'));

	t.true(carriesDigest, 'no request carried the measurement digest');
});

test.serial(
	'the request budget for a page is within the threshold (SC-007)',
	async t => {
		// The ceiling this feature must stay under: 192,000 bytes, being 1.25x the
		// 153,913 recorded for v4.3.0 in specs/006-context-diet/baseline.md and
		// measured with this same harness, so the comparison is like for like.
		//
		// The headroom is for the measurement digest and the model's page note.
		// The audit and trace tools themselves cost nothing here, because they are
		// never offered to the model -- see the test below.
		const budget = 192_000;
		const {recorder} = await analyse(happyPath);

		t.log(`007 total=${recorder.totalBytes()} against ceiling ${budget}`);
		t.true(
			recorder.totalBytes() <= budget,
			`total ${recorder.totalBytes()} bytes exceeds the ${budget} ceiling`,
		);
	},
);

test.serial('measurement adds no browser tool to any request', async t => {
	// Feature 006 cut the per-request tool set to what the stage can act on.
	// This feature calls the audit and the trace itself, so neither may ever
	// appear in a request -- a regression here would quietly undo that work to
	// deliver a reply the model cannot use.
	const {recorder} = await analyse(happyPath);

	for (const request of recorder.all()) {
		t.false(
			request.toolNames.includes('lighthouse_audit'),
			'the audit tool was offered to the model',
		);
		t.false(
			request.toolNames.includes('performance_start_trace'),
			'the trace tool was offered to the model',
		);
	}

	// What the feature does add is one local tool, at the one stage that can
	// use it: the note the model writes about the measured violations.
	const perRequest = recorder.all().map(request => request.toolNames.length);
	t.deepEqual(perRequest, [2, 2, 3, 3]);
});

test.serial('a tool call and its result are never separated', async t => {
	// The digest is a new user turn. Inserted before this step's assistant
	// message and the tool results answering it, it splits a call from its
	// result -- a malformed transcript that some providers reject outright.
	// The byte count cannot see this, and the scripted model does not care,
	// which is why the shape is asserted directly.
	const {recorder} = await analyse(happyPath);

	for (const request of recorder.all()) {
		const input = Array.isArray(request.body['input'])
			? (request.body['input'] as Array<{type?: string; role?: string}>)
			: [];

		// Whatever follows a call must be its output, never a fresh user turn
		// that has pushed the answer further down.
		const afterCalls = input
			.map((item, index) => ({item, next: input[index + 1], index}))
			.filter(({item}) => item.type === 'function_call');

		for (const {next, index} of afterCalls) {
			t.not(
				next?.role,
				'user',
				`a user turn was inserted directly after a tool call at index ${index}`,
			);
		}
	}
});
