/**
 * Test doubles for delegate mode.
 *
 * The scripted host below is not a stub over the intake: it loads the real
 * session, builds the real judgement server, and speaks to it over a real MCP
 * client. Only the process boundary is removed. A double that appended
 * submissions to the log directly would pass while every rejection rule was
 * broken.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {tool} from 'ai';
import {z} from 'zod/v4';
import {createJudgementServer} from '../../source/delegate/mcp-server.js';
import {DelegationSession} from '../../source/delegate/session.js';
import type {
	HostAgentAdapter,
	HostLaunch,
	HostOutcome,
} from '../../source/delegate/host/types.js';
import type {PreflightVerdict} from '../../source/models/browser-preflight.js';
import type {UxLintConfig} from '../../source/models/config.js';
import {sessionEnvironmentVariable} from '../../source/models/delegate.js';
import {auditReportJson} from '../fixtures/lighthouse-report.js';
import {auditSnapshotReply} from '../fixtures/lighthouse-reply.js';
import {mcpError, mcpResult} from '../fixtures/mcp-result.js';
import {pageSnapshotFixture} from '../fixtures/page-snapshot.js';
import {traceWithNavigationReply} from '../fixtures/trace-reply.js';

/** A preflight verdict that lets a run proceed. */
export const readyVerdict: PreflightVerdict = {
	kind: 'ready',
	browser: {
		executablePath: '/opt/google/chrome/chrome',
		version: 'Google Chrome 151.0.7922.137',
		majorVersion: 151,
	},
};

/**
 * A configuration over `pageCount` pages.
 *
 * @param pageCount - How many pages the run should cover
 * @param output - Where the report is written
 * @returns The configuration
 */
export function configFor(pageCount: number, output: string): UxLintConfig {
	const urls = Array.from(
		{length: pageCount},
		(_, index) => `https://example.com/page-${index + 1}`,
	);

	return {
		mainPageUrl: urls[0]!,
		subPageUrls: urls.slice(1),
		pages: urls.map((url, index) => ({
			url,
			features: `Features of page ${index + 1}`,
		})),
		persona: 'A first-time visitor on a phone',
		report: {output},
	};
}

/**
 * A browser that navigates, captures and measures without a browser.
 *
 * Measurement replies come from the same fixtures the built-in mode's tests
 * use, which is what makes a measured-parity comparison meaningful rather than
 * circular.
 *
 * @param options - Failure switches
 * @param options.navigateSucceeds - Whether navigation reports success
 * @param options.snapshot - What a capture returns
 * @returns A client standing in for the browser server
 */
export function fakeBrowser(
	options: {navigateSucceeds?: boolean; snapshot?: string} = {},
): MCPClient {
	const {navigateSucceeds = true, snapshot = pageSnapshotFixture} = options;

	// A fresh report directory per audit call, because the measurement service
	// removes the one it just read. A single directory reused across pages
	// would leave every page after the first unmeasured -- and a test asserting
	// that measured findings survive would then be asserting nothing.
	const writeAuditReport = () => {
		const directory = fs.mkdtempSync(
			path.join(os.tmpdir(), 'uxlint-delegate-audit-'),
		);
		fs.writeFileSync(path.join(directory, 'report.json'), auditReportJson);
		return path.join(directory, 'report.json');
	};

	return {
		async tools() {
			return {
				navigate_page: tool({
					description: 'Navigate to a URL',
					inputSchema: z.object({url: z.string()}),
					async execute() {
						return mcpResult('Successfully navigated.');
					},
				}),
				take_snapshot: tool({
					description: 'Capture the accessibility tree',
					inputSchema: z.object({}),
					async execute() {
						return mcpResult(snapshot);
					},
				}),
			};
		},
		async callTool({name}: {name: string}) {
			if (name === 'navigate_page') {
				return navigateSucceeds
					? mcpResult('Successfully navigated.')
					: mcpError('Navigation failed: refused');
			}

			if (name === 'take_snapshot') {
				return mcpResult(snapshot);
			}

			if (name === 'lighthouse_audit') {
				const reportPath = writeAuditReport();
				return mcpResult(
					auditSnapshotReply.replace(
						/- \S*report\.json/,
						() => `- ${reportPath}`,
					),
				);
			}

			return mcpResult(traceWithNavigationReply);
		},
		async close() {
			// No transport to close
		},
	} as unknown as MCPClient;
}

/**
 * What a scripted host agent does with one page.
 */
export type PageScript = {
	/** How many findings to submit for it */
	findings?: number;

	/** Whether to record a measurement note */
	note?: boolean;

	/** Whether to signal the page finished */
	complete?: boolean;
};

/**
 * A host agent that judges according to a script.
 *
 * @param script - What to do per page, in configuration order. A page with no
 * entry is left untouched, which is how a session that ends early is reproduced
 * @param options - Outcome switches
 * @param options.terminated - How the session ends
 * @param options.onLaunch - Called with every launch, for spawn accounting
 * @returns An adapter that never spawns anything
 */
export function scriptedHost(
	script: PageScript[],
	options: {
		terminated?: HostOutcome['terminated'];
		onLaunch?: (launch: HostLaunch) => void;
	} = {},
): HostAgentAdapter {
	const {terminated = 'completed', onLaunch} = options;

	return {
		id: 'claude-code',
		binary: 'scripted-host',
		async detect() {
			return {kind: 'ready'};
		},
		buildLaunch(context) {
			return {
				command: 'scripted-host',
				args: [],
				env: {[sessionEnvironmentVariable]: context.sessionDirectory},
				stdin: context.prompt,
			};
		},
		async run(launch) {
			onLaunch?.(launch);

			const directory = launch.env[sessionEnvironmentVariable]!;
			const session = await DelegationSession.load(directory);
			const server = createJudgementServer(session);
			const client = new Client({name: 'scripted-host', version: '0.0.0'});
			const [clientTransport, serverTransport] =
				InMemoryTransport.createLinkedPair();

			await Promise.all([
				server.connect(serverTransport),
				client.connect(clientTransport),
			]);

			try {
				for (const [index, page] of session.manifest.pages.entries()) {
					const step = script[index];
					if (!step) {
						continue;
					}

					// eslint-disable-next-line no-await-in-loop -- a host agent works one page at a time
					await client.callTool({
						name: 'getPageEvidence',
						arguments: {pageUrl: page.pageUrl},
					});

					for (let n = 0; n < (step.findings ?? 0); n++) {
						// eslint-disable-next-line no-await-in-loop -- submissions are sequential
						await client.callTool({
							name: 'addFinding',
							arguments: {
								severity: 'medium',
								category: 'Navigation',
								description: `Judgement ${n + 1} on ${page.pageUrl}`,
								personaRelevance: ['first-time visitor'],
								recommendation: 'Make it clearer.',
								pageUrl: page.pageUrl,
							},
						});
					}

					if (step.note) {
						// eslint-disable-next-line no-await-in-loop -- submissions are sequential
						await client.callTool({
							name: 'noteOnMeasuredIssues',
							arguments: {
								pageUrl: page.pageUrl,
								note: `What the measurements mean on ${page.pageUrl}`,
							},
						});
					}

					if (step.complete) {
						// eslint-disable-next-line no-await-in-loop -- submissions are sequential
						await client.callTool({
							name: 'completePageAnalysis',
							arguments: {pageUrl: page.pageUrl},
						});
					}
				}
			} finally {
				await client.close();
				await server.close();
			}

			return {
				terminated,
				exitCode: terminated === 'completed' ? 0 : 1,
			};
		},
	};
}

/**
 * A temporary directory removed when the test ends.
 *
 * @param teardown - The test's teardown registrar
 * @returns The directory path
 */
export function temporaryDirectory(teardown: (fn: () => void) => void): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-delegate-'));
	teardown(() => {
		fs.rmSync(directory, {recursive: true, force: true});
	});
	return directory;
}
