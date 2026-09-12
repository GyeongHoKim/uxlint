import test, {type ExecutionContext} from 'ava';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createJudgementServer} from '../../source/delegate/mcp-server.js';
import {DelegationSession} from '../../source/delegate/session.js';
import type {PageEvidence} from '../../source/models/delegate.js';

const first = 'https://example.com/';
const second = 'https://example.com/pricing';

const evidence: PageEvidence[] = [
	{
		pageUrl: first,
		features: 'Landing page',
		persona: 'A first-time visitor on a phone',
		snapshot: 'button "Sign up"',
		measurementDigest: 'No violations measured.',
	},
	{
		pageUrl: second,
		features: 'Pricing table',
		persona: 'A first-time visitor on a phone',
		snapshot: '',
		measurementDigest: 'Not measured: the page was never loaded.',
		captureFailureReason: 'navigation failed',
	},
];

/**
 * A connected client speaking to a judgement server over a linked pair.
 *
 * `beforeAppend` holds a write back for as long as the caller wants, which is
 * how a test makes the interleaving between two tool calls something it decides
 * rather than something the scheduler happens to produce that day.
 */
async function connect(
	t: ExecutionContext,
	options: {beforeAppend?: (write: number) => Promise<void>} = {},
) {
	const session = await DelegationSession.create({
		hostAgent: 'claude-code',
		pages: evidence,
	});

	if (options.beforeAppend) {
		const {beforeAppend} = options;
		const append = session.append.bind(session);
		let writes = 0;

		session.append = async (...submissions) => {
			writes += 1;
			await beforeAppend(writes);
			await append(...submissions);
		};
	}

	const server = createJudgementServer(session);
	const client = new Client({name: 'test', version: '0.0.0'});
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();

	await Promise.all([
		server.connect(serverTransport),
		client.connect(clientTransport),
	]);

	t.teardown(async () => {
		await client.close();
		await server.close();
		await session.dispose();
	});

	return {client, session};
}

/**
 * Call a tool and return its parsed result plus whether it was an error.
 */
async function call(
	client: Client,
	name: string,
	args: Record<string, unknown> = {},
) {
	try {
		const result = (await client.callTool({name, arguments: args})) as {
			isError?: boolean;
			content?: Array<{type: string; text?: string}>;
		};

		const text = result.content?.map(part => part.text ?? '').join('') ?? '';
		return {isError: result.isError === true, text};
	} catch (error) {
		// Two refusal routes reach the agent as the same thing. A contract
		// violation fails schema validation inside the server SDK and comes
		// back as a protocol error; a state violation -- a page not opened, a
		// page already finished -- is the server's own decision and comes back
		// as a tool error. Both are text the agent can act on, so the tests
		// treat them alike rather than pinning the transport detail.
		return {
			isError: true,
			text: error instanceof Error ? error.message : String(error),
		};
	}
}

// Every tool mutates page state and then writes the log, and the SDK does not
// wait for one request's handler before dispatching the next. A finding
// appended while the page's own `open` record is still in flight lands before
// it, and replay then drops the finding as out of turn -- the agent is told its
// work was accepted and the report never sees it.
test('a finding submitted while the page’s open record is in flight is kept', async t => {
	const {client, session} = await connect(t, {
		async beforeAppend(write) {
			// Only the first write is slow: the `open` record that
			// getPageEvidence journals.
			if (write === 1) {
				await new Promise(resolve => {
					setTimeout(resolve, 50);
				});
			}
		},
	});

	const [, added] = await Promise.all([
		call(client, 'getPageEvidence', {pageUrl: first}),
		call(client, 'addFinding', {
			severity: 'high',
			category: 'navigation',
			description: 'Submitted while the page was being opened.',
			personaRelevance: ['A first-time visitor on a phone'],
			recommendation: 'Fix it.',
			pageUrl: first,
		}),
	]);

	t.false(added.isError, added.text);

	const recorded = await session.submissions();
	const findings = recorded.filter(submission => submission.kind === 'finding');

	t.is(
		findings.length,
		1,
		'what the agent was told was accepted is in the log',
	);
});

test('the server offers exactly the five judgement tools and nothing else', async t => {
	const {client} = await connect(t);

	const {tools} = await client.listTools();

	t.deepEqual(
		tools.map(tool => tool.name).sort(),
		[
			'addFinding',
			'completePageAnalysis',
			'getPageEvidence',
			'listPages',
			'noteOnMeasuredIssues',
		],
		'a tool the host agent cannot act on is a definition re-sent on every request',
	);
});

test('listPages reports every page, in configuration order, with its state', async t => {
	const {client} = await connect(t);

	const {text} = await call(client, 'listPages');
	const listed = JSON.parse(text) as Array<{
		pageUrl: string;
		captured: boolean;
		judgement: string;
	}>;

	t.deepEqual(
		listed.map(page => page.pageUrl),
		[first, second],
	);
	t.true(listed[0]!.captured);
	t.false(listed[1]!.captured);
	t.is(listed[0]!.judgement, 'not-started');
});

test('getPageEvidence serves the capture and opens the page', async t => {
	const {client} = await connect(t);

	const {isError, text} = await call(client, 'getPageEvidence', {
		pageUrl: first,
	});
	t.false(isError);

	const served = JSON.parse(text) as PageEvidence;
	t.is(served.snapshot, 'button "Sign up"');
	t.is(served.persona, 'A first-time visitor on a phone');

	const pageList = await call(client, 'listPages');
	const listed = JSON.parse(pageList.text) as Array<{judgement: string}>;
	t.is(listed[0]!.judgement, 'open');
});

// A page whose capture failed is still served, carrying its reason. Withholding
// it would leave the agent unable to tell a page it has not reached from a page
// there is nothing to say about.
test('a page whose capture failed is served with the reason', async t => {
	const {client} = await connect(t);

	const {isError, text} = await call(client, 'getPageEvidence', {
		pageUrl: second,
	});

	t.false(isError);
	t.regex(text, /navigation failed/);
});

test('evidence for a page outside the run is refused, and the refusal lists the pages', async t => {
	const {client} = await connect(t);

	const {isError, text} = await call(client, 'getPageEvidence', {
		pageUrl: 'https://elsewhere.test/',
	});

	t.true(isError);
	t.regex(text, /example\.com/);
});

test('a finding is accepted once its page is open, and reports the running count', async t => {
	const {client} = await connect(t);
	await call(client, 'getPageEvidence', {pageUrl: first});

	const {isError, text} = await call(client, 'addFinding', {
		severity: 'high',
		category: 'Navigation',
		description: 'The primary action sits below the fold.',
		personaRelevance: ['first-time visitor'],
		recommendation: 'Move it above the fold.',
		pageUrl: first,
	});

	t.false(isError);
	t.regex(text, /"findingsOnPage":\s*1/);
});

test('a finding for a page whose evidence was never requested is refused', async t => {
	const {client} = await connect(t);

	const {isError, text} = await call(client, 'addFinding', {
		severity: 'high',
		category: 'Navigation',
		description: 'The primary action sits below the fold.',
		personaRelevance: ['first-time visitor'],
		recommendation: 'Move it above the fold.',
		pageUrl: first,
	});

	t.true(isError);
	t.regex(text, /evidence/);
});

test('a malformed finding is refused, and the refusal names the field', async t => {
	const {client} = await connect(t);
	await call(client, 'getPageEvidence', {pageUrl: first});

	const {isError, text} = await call(client, 'addFinding', {
		severity: 'catastrophic',
		category: 'Navigation',
		description: 'The primary action sits below the fold.',
		personaRelevance: [],
		recommendation: 'Move it above the fold.',
		pageUrl: first,
	});

	t.true(isError);
	t.regex(text, /severity/);
});

test('a finding submitted after its page is finished is refused as late', async t => {
	const {client, session} = await connect(t);
	await call(client, 'getPageEvidence', {pageUrl: first});
	await call(client, 'completePageAnalysis', {pageUrl: first});

	const {isError, text} = await call(client, 'addFinding', {
		severity: 'low',
		category: 'Content',
		description: 'Late arrival.',
		personaRelevance: [],
		recommendation: 'Ignore.',
		pageUrl: first,
	});

	t.true(isError);
	t.regex(text, /finished/);

	const recorded = await session.submissions();
	t.false(
		recorded.some(
			submission =>
				submission.kind === 'finding' &&
				submission.finding.description === 'Late arrival.',
		),
		'a refused submission must be stored nowhere',
	);
});

test('the measurement note is accepted once and refused twice', async t => {
	const {client} = await connect(t);
	await call(client, 'getPageEvidence', {pageUrl: first});

	const accepted = await call(client, 'noteOnMeasuredIssues', {
		pageUrl: first,
		note: 'Contrast failures matter most to this persona.',
	});
	t.false(accepted.isError);

	const repeated = await call(client, 'noteOnMeasuredIssues', {
		pageUrl: first,
		note: 'A second note.',
	});
	t.true(repeated.isError);
	t.regex(repeated.text, /once/);
});

test('completing a page that was never opened is refused', async t => {
	const {client} = await connect(t);

	const {isError, text} = await call(client, 'completePageAnalysis', {
		pageUrl: first,
	});

	t.true(isError);
	t.regex(text, /evidence/);
});

test('completion is recorded so the orchestrator can tell finished from unreached', async t => {
	const {client, session} = await connect(t);
	await call(client, 'getPageEvidence', {pageUrl: first});
	await call(client, 'completePageAnalysis', {pageUrl: first});

	const recorded = await session.submissions();
	t.true(
		recorded.some(
			submission =>
				submission.kind === 'complete' && submission.pageUrl === first,
		),
	);
});

// The contract omits origin, ruleId and affectedElements. Accepting any of
// them would let a submitter claim a verification that never happened.
test('a finding claiming to be measured is refused', async t => {
	const {client} = await connect(t);
	await call(client, 'getPageEvidence', {pageUrl: first});

	const {isError} = await call(client, 'addFinding', {
		severity: 'high',
		category: 'Accessibility',
		description: 'Contrast is insufficient.',
		personaRelevance: [],
		recommendation: 'Raise the contrast ratio.',
		pageUrl: first,
		origin: 'audit',
		ruleId: 'color-contrast',
	});

	t.true(isError);
});
