/**
 * `delegate capture`
 *
 * The deterministic half, run by the agent. Preflight, navigate, capture,
 * measure — then a run on disk and its identity printed, so the agent can come
 * back for the evidence one page at a time without a browser being opened again.
 *
 * No model provider credential is read anywhere in here. That is the whole
 * premise of delegate mode, and it holds for the same reason on both routes: the
 * work this command does needs no model at all.
 *
 * @packageDocumentation
 */

import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {logger} from '../../infrastructure/logger.js';
import {
	writeStructuredOutput,
	writeTerminalMessage,
} from '../../infrastructure/console-output.js';
import type {UxLintConfig} from '../../models/config.js';
import {agentDrivenRoute, type PageEvidence} from '../../models/delegate.js';
import {createDelegatedRun} from '../../services/ai-service.js';
import {runPreflight as defaultRunPreflight} from '../../services/browser-preflight.js';
import {
	browserServerIdentity,
	narrowBrowserTools,
} from '../../services/mcp-client.js';
import {MeasurementService} from '../../services/measurement.js';
import {captureAllPages, checkBrowser} from '../capture-pass.js';
import {buildEvidence} from '../evidence.js';
import {DelegationSession} from '../session.js';
import {pruneRuns} from './runs.js';

/**
 * Collaborators `capture` needs, injectable so the command can be driven without
 * a browser.
 */
export type CaptureDependencies = {
	/** Browser connection; defaults to one built from the preflight verdict */
	client?: MCPClient;

	/** Checks the environment can run a browser */
	runPreflight?: typeof defaultRunPreflight;

	/** Where the payload goes */
	emitPayload?: (payload: unknown) => void;

	/** Where user-facing messages go */
	emitMessage?: (message: string) => void;

	/** Where run directories live */
	parentDirectory?: string;
};

/**
 * What `capture` prints.
 *
 * Deliberately small. The evidence itself comes from `evidence`, so an agent
 * decides how much to read rather than being handed everything at once.
 */
type CapturePayload = {
	run: string;
	pages: Array<{pageUrl: string; captured: boolean; failureReason?: string}>;
};

/**
 * Do every deterministic step of a review and leave a run behind.
 *
 * @param config - Validated configuration for this run
 * @param dependencies - Collaborators, all optional in production
 * @returns `0` when at least one page was captured, `1` when the run could not start
 */
export async function captureForAgent(
	config: UxLintConfig,
	dependencies: CaptureDependencies = {},
): Promise<number> {
	const {
		client,
		runPreflight = defaultRunPreflight,
		emitPayload = writeStructuredOutput,
		emitMessage = writeTerminalMessage,
		parentDirectory,
	} = dependencies;

	logger.info('Agent-driven capture started', {
		totalPages: config.pages.length,
	});

	// Swept here and nowhere else. This is the one command always run before a
	// review and never during one, which makes it the only safe moment to delete
	// a run somebody else may still be working through.
	await pruneRuns(parentDirectory === undefined ? {} : {parentDirectory});

	const preflight = await checkBrowser(config, runPreflight, emitMessage);
	if (!preflight) {
		return 1;
	}

	let run: Awaited<ReturnType<typeof createDelegatedRun>> | undefined;

	try {
		run = await createDelegatedRun(config, preflight, {client});
		const {mcpClient} = run;

		// The same startup guarantee the other routes make: a browser server
		// missing a tool the analysis requires is a startup failure, not a
		// surprise partway through a page.
		narrowBrowserTools(await mcpClient.tools());

		const measurement = new MeasurementService(mcpClient);
		const captured = await captureAllPages(
			mcpClient,
			measurement,
			config.pages,
		);

		const evidence: PageEvidence[] = captured.map(item =>
			buildEvidence({
				page: item.page,
				persona: config.persona,
				snapshot: item.snapshot,
				measurement: item.measurement,
				...(item.failureReason !== undefined && {
					captureFailureReason: item.failureReason,
				}),
			}),
		);

		const server = browserServerIdentity();
		const session = await DelegationSession.create(
			{
				// No agent launched this, and none will be. The field records the
				// route rather than naming an adapter that had no part in it --
				// and naming one here would be a driven module knowing which agent
				// exists, which is exactly what host neutrality forbids.
				hostAgent: agentDrivenRoute,
				pages: evidence,
				captured,
				persona: config.persona,
				provenance: {
					browserServer: server.name,
					browserServerVersion: server.version,
					browserVersion: preflight.browser.version,
					externalDataAllowed: config.browser?.allowExternalData ?? false,
				},
			},
			parentDirectory === undefined ? {} : {parentDirectory},
		);

		// Closed before anything is printed, so nothing else owns stdout when the
		// payload goes out -- which is the condition console-output.ts requires.
		await mcpClient.close();
		run = undefined;

		const payload: CapturePayload = {
			run: session.id,
			pages: captured.map(item => ({
				pageUrl: item.page.url,
				captured: item.stage === 'analysable',
				...(item.failureReason !== undefined && {
					failureReason: item.failureReason,
				}),
			})),
		};

		emitPayload(payload);
		return 0;
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'Unknown error';
		logger.error('Agent-driven capture failed', {
			error: reason,
			stack: error instanceof Error ? error.stack : undefined,
		});
		emitMessage(`uxlint: ${reason}`);
		return 1;
	} finally {
		if (run) {
			await run.mcpClient.close();
		}
	}
}
