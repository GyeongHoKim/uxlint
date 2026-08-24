/**
 * Activity-feed tests (008 T014/T015 · FR-012 · spec US3).
 *
 * The engine knows when each tool starts and ends; the interactive display
 * must say so. These tests drive a scripted analysis and inspect the message
 * stream handed to onProgress: once real activity begins, every message is
 * an activity label, and none of the rotating filler pool leaks through.
 * RED at time of writing -- the manual loop only ever emitted filler.
 */

import {promises as fsPromises} from 'node:fs';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {tool} from 'ai';
import {MockLanguageModelV4} from 'ai/test';
import test from 'ava';
import sinon from 'sinon';
import {z} from 'zod/v4';
import type {UxLintConfig} from '../../source/models/config.js';
import {waitingMessages} from '../../source/constants/waiting-messages.js';
import {
	AIService,
	type AnalysisProgressCallback,
} from '../../source/services/ai-service.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import {mcpResult} from '../fixtures/mcp-result.js';

const config = (): UxLintConfig => ({
	mainPageUrl: 'https://example.com',
	subPageUrls: [],
	pages: [{url: 'https://example.com', features: 'Landing page'}],
	persona: 'Activity persona',
	report: {output: './activity-report.md'},
});

const browser = (): MCPClient =>
	({
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
						return mcpResult('button "Sign up"');
					},
				}),
			};
		},
		async close() {
			// No transport to close
		},
	}) as unknown as MCPClient;

/** Navigate, then capture and complete in one turn. */
const capturingModel = (): MockLanguageModelV4 => {
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
							toolCallId: 'nav',
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
						toolCallId: 'snap',
						toolName: 'take_snapshot',
						input: '{}',
					},
					{
						type: 'tool-call',
						toolCallId: 'done',
						toolName: 'completePageAnalysis',
						input: '{}',
					},
				],
				warnings: [],
			};
		},
	});
};

const collectMessages = async () => {
	const sandbox = sinon.createSandbox();
	const builder = new ReportBuilder({
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	});
	const service = new AIService(capturingModel(), browser(), builder);

	const messages: Array<{stage: string; message?: string}> = [];
	const onProgress: AnalysisProgressCallback = (stage, message) => {
		messages.push({stage, message});
	};

	const cfg = config();
	await service.analyzePage(cfg, cfg.pages[0]!, onProgress);
	await service.close();
	sandbox.restore();

	return messages;
};

const fillerSet = new Set(waitingMessages as readonly string[]);

test.serial('every executed tool surfaces its name as activity', async t => {
	const messages = await collectMessages();
	const labels = messages
		.map(entry => entry.message ?? '')
		.filter(message => message.startsWith('Running'));

	for (const toolName of ['navigate_page', 'take_snapshot']) {
		t.true(
			labels.some(label => label.includes(toolName)),
			`no activity label named ${toolName}`,
		);
	}
});

test.serial(
	'no filler appears after the first real activity label',
	async t => {
		const messages = await collectMessages();

		let firstActivityIndex = -1;
		for (const [index, entry] of messages.entries()) {
			if ((entry.message ?? '').startsWith('Running')) {
				firstActivityIndex = index;
				break;
			}
		}

		t.true(firstActivityIndex >= 0, 'the run never reported concrete activity');

		for (const entry of messages.slice(firstActivityIndex)) {
			t.false(
				entry.message !== undefined && fillerSet.has(entry.message),
				`filler "${entry.message}" shown while activity was being reported`,
			);
		}
	},
);

test.serial(
	'the measurement phase keeps its dedicated presentation trigger',
	async t => {
		const messages = await collectMessages();

		t.true(
			messages.some(entry => entry.stage === 'measuring'),
			'the measuring stage must still be announced for the display',
		);
	},
);
