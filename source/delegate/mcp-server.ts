/**
 * Judgement server
 *
 * uxlint as an MCP server. A host agent connects to this, pulls each page's
 * evidence, and submits its judgement back through tools uxlint defines.
 *
 * **This process's stdout carries JSON-RPC.** It is the first place in the
 * project where uxlint's own stdout is a protocol stream rather than a stream
 * merely reserved against a child's transport, so the sanctioned exception for
 * terminating messages does not apply here at all: `console-output.ts` must
 * stay unreachable from this module, and a test enforces that. Everything
 * diagnostic goes to the file logger.
 *
 * @packageDocumentation
 */

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod/v4';
import {logger} from '../infrastructure/logger.js';
import {
	judgementFindingSchema,
	sessionEnvironmentVariable,
} from '../models/delegate.js';
import {SubmissionRejected, validateFinding} from './ingest.js';
import {DelegationSession, PageJudgementTracker} from './session.js';

/**
 * A tool result carrying text.
 */
type ToolReply = {
	content: Array<{type: 'text'; text: string}>;
	isError?: boolean;
};

/**
 * Render a value as a successful tool result.
 *
 * @param value - What to send back
 * @returns The reply
 */
function reply(value: unknown): ToolReply {
	return {
		content: [
			{
				type: 'text',
				text: typeof value === 'string' ? value : JSON.stringify(value),
			},
		],
	};
}

/**
 * Render a refusal.
 *
 * A rejection is an instruction: the host agent is the only party that can act
 * on it, and it gets one chance to do so on its next call.
 *
 * @param message - What the submitter should do differently
 * @returns The reply, marked as an error
 */
function refuse(message: string): ToolReply {
	logger.info('Judgement submission refused', {message});
	return {content: [{type: 'text', text: message}], isError: true};
}

/**
 * Run `body`, turning a refusal into a tool error rather than a crash.
 *
 * @param body - The tool's work
 * @returns Its reply, or the refusal
 */
async function guarded(body: () => Promise<ToolReply>): Promise<ToolReply> {
	try {
		return await body();
	} catch (error) {
		if (error instanceof SubmissionRejected) {
			return refuse(error.message);
		}

		throw error;
	}
}

/**
 * Build the judgement server for one session.
 *
 * Exactly five tools, and nothing else. A tool the host agent cannot act on is
 * not a one-off cost but a definition re-sent on every request, which is the
 * same reasoning that keeps the measurement tools out of the built-in mode's
 * tool set.
 *
 * @param session - The run this server belongs to
 * @param tracker - Page state; defaults to a fresh tracker over the session's pages
 * @returns The server, not yet connected to a transport
 */
export function createJudgementServer(
	session: DelegationSession,
	tracker: PageJudgementTracker = new PageJudgementTracker(session.pageUrls),
): McpServer {
	const server = new McpServer({name: 'uxlint', version: '1.0.0'});
	const noted = new Set<string>();

	server.registerTool(
		'listPages',
		{
			description:
				'List every page in this review, in order, with whether its structure was captured and how far its judgement has got. Call this first, and again if you lose your place.',
			inputSchema: {},
		},
		async () =>
			reply(
				session.manifest.pages.map(page => ({
					pageUrl: page.pageUrl,
					features: page.features,
					captured: page.captureFailureReason === undefined,
					judgement: tracker.stateOf(page.pageUrl),
				})),
			),
	);

	server.registerTool(
		'getPageEvidence',
		{
			description:
				'Get one page: the persona, the page structure captured from the browser, and what was measured on it. Call this before judging that page.',
			inputSchema: {pageUrl: z.string()},
		},
		async ({pageUrl}) =>
			guarded(async () => {
				tracker.open(pageUrl);
				// Journalled as well as tracked. This route keeps page state in
				// one live server, so it could do without the record -- but then
				// the two routes write logs of different shapes, and a rule read
				// back off the log could only hold for one of them.
				await session.recordOpened(pageUrl);
				const evidence = session.evidenceFor(pageUrl);

				if (!evidence) {
					// Unreachable past tracker.open, which shares the page set.
					// Stated anyway so a future change to either cannot make
					// this return an empty page as though it were a read one.
					return refuse(`${pageUrl} is not a page in this run.`);
				}

				return reply(evidence);
			}),
	);

	server.registerTool(
		'addFinding',
		{
			description:
				"Record ONE UX problem you found on a page, from the persona's perspective. Call it once per problem, typically three to ten per page. Do not report anything already listed in that page's measurements: it is recorded already, and repeating it would put a guess beside a fact.",
			inputSchema: judgementFindingSchema,
		},
		async input =>
			guarded(async () => {
				tracker.requireOpen(input.pageUrl);
				const finding = validateFinding(input, session.pageUrls);
				await session.append({
					kind: 'finding',
					pageUrl: finding.pageUrl,
					finding,
				});

				const recorded = await session.submissions();
				const findingsOnPage = recorded.filter(
					submission =>
						submission.kind === 'finding' &&
						submission.pageUrl === finding.pageUrl,
				).length;

				return reply({accepted: true, findingsOnPage});
			}),
	);

	server.registerTool(
		'noteOnMeasuredIssues',
		{
			description:
				'Record ONE note about the measured violations on a page: what they mean for this persona and how to address them in this product. At most once per page, and only where measurements were supplied. Do not restate the violations.',
			inputSchema: {pageUrl: z.string(), note: z.string().min(1)},
		},
		async ({pageUrl, note}) =>
			guarded(async () => {
				tracker.requireOpen(pageUrl);

				if (noted.has(pageUrl)) {
					return refuse(
						`${pageUrl} already carries a measurement note. It is recorded once per page; a second note would overwrite the first.`,
					);
				}

				noted.add(pageUrl);
				await session.append({kind: 'note', pageUrl, note});
				return reply({accepted: true});
			}),
	);

	server.registerTool(
		'completePageAnalysis',
		{
			description:
				'REQUIRED for every page. Mark one page finished when you have reported everything you found on it, then move to the next page. Later submissions naming it are refused.',
			inputSchema: {pageUrl: z.string()},
		},
		async ({pageUrl}) =>
			guarded(async () => {
				tracker.finish(pageUrl);
				await session.append({kind: 'complete', pageUrl});

				const recorded = await session.submissions();
				const findingsOnPage = recorded.filter(
					submission =>
						submission.kind === 'finding' && submission.pageUrl === pageUrl,
				).length;

				return reply({accepted: true, pageUrl, findingsOnPage});
			}),
	);

	return server;
}

/**
 * Serve judgement for the session named in the environment.
 *
 * The entry point behind `uxlint mcp-serve`. Not meant to be typed at a
 * prompt: a host agent spawns it, and the session it belongs to arrives
 * through an inherited environment variable rather than an argument, because
 * neither the host agent nor uxlint's own launcher should have to know the
 * shape of the other's command line.
 *
 * @param environment - Where to read the session path from
 * @throws Error when no session is named, or the one named does not exist
 */
export async function serveJudgement(
	environment: Record<string, string | undefined>,
): Promise<void> {
	const directory = environment[sessionEnvironmentVariable];

	if (!directory) {
		// Loud rather than a guess. A server that picks a session writes
		// findings into somebody else's report.
		throw new Error(
			`${sessionEnvironmentVariable} is not set. uxlint mcp-serve is started by a delegated run, not by hand.`,
		);
	}

	const session = await DelegationSession.load(directory);
	const server = createJudgementServer(session);

	logger.info('Judgement server starting', {
		session: session.id,
		pages: session.pageUrls.length,
	});

	await server.connect(new StdioServerTransport());
}
