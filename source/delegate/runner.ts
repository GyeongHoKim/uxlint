/**
 * Delegated run orchestrator
 *
 * uxlint does everything deterministic -- preflight, navigation, capture,
 * measurement, report assembly, gate verdict -- and hands only the judgement
 * to a coding agent the developer already runs.
 *
 * The order matters and is not incidental. Host availability is settled before
 * a browser starts, so an unusable agent costs no capture pass. Every page is
 * captured and measured before the agent is launched, because one session
 * covers the whole run. And the report is assembled after the session ends,
 * from what actually arrived rather than from what the agent said it did.
 *
 * @packageDocumentation
 */

import process from 'node:process';
import {fileURLToPath} from 'node:url';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {logger} from '../infrastructure/logger.js';
import {writeTerminalMessage} from '../infrastructure/console-output.js';
import type {UxLintConfig} from '../models/config.js';
import type {PageEvidence} from '../models/delegate.js';
import {evaluateGate, renderGateVerdict} from '../models/gate-result.js';
import {createDelegatedRun} from '../services/ai-service.js';
import {DeadlineExpired, withDeadline} from '../services/deadline.js';
import {runPreflight as defaultRunPreflight} from '../services/browser-preflight.js';
import {
	browserServerIdentity,
	narrowBrowserTools,
} from '../services/mcp-client.js';
import {MeasurementService} from '../services/measurement.js';
import type {ReportBuilder} from '../services/report-builder.js';
import {assembleReport, captureAllPages, checkBrowser} from './capture-pass.js';
import {buildEvidence} from './evidence.js';
import {collect} from './ingest.js';
import {DelegationSession} from './session.js';
import {
	assertReadOnly,
	type HostAgentAdapter,
	type HostLaunch,
	type HostOutcome,
} from './host/types.js';

/**
 * The floor under a session's bound, whatever the page count.
 *
 * A measured single-page delegated run spent 108 seconds inside the host agent
 * session, so ten minutes leaves roughly five times that even for the smallest
 * configuration.
 */
const minimumSessionTimeLimitMs = 600_000;

/**
 * How much of the bound each page adds.
 *
 * Measured at 108 seconds for the first page, which is the expensive one: it
 * carries the agent's own startup and the prompt. Five minutes a page is a
 * hang net over that, not a budget -- a run that regularly approaches it
 * should be read as something being wrong.
 */
const sessionTimeLimitPerPageMs = 300_000;

/**
 * How long a host agent session may take before the run abandons it.
 *
 * Scales with the page count because one session covers the whole run: a fixed
 * ceiling that suits one page starves ten, and one that suits ten lets a
 * single stuck page hold a terminal for half an hour.
 *
 * @param pageCount - How many pages the session covers
 * @returns The bound in milliseconds
 */
export function defaultSessionTimeLimitMs(pageCount: number): number {
	return Math.max(
		minimumSessionTimeLimitMs,
		pageCount * sessionTimeLimitPerPageMs,
	);
}

/**
 * Collaborators the orchestrator needs, injectable so a delegated run can be
 * asserted without a browser, a host agent, or a credential.
 */
export type DelegateDependencies = {
	/** The host agent that will judge this run */
	adapter: HostAgentAdapter;

	/** Browser connection; defaults to one built from the preflight verdict */
	client?: MCPClient;

	/** Report accumulator; defaults to one owned by this run */
	builder?: ReportBuilder;

	/** Checks the environment can run a browser */
	runPreflight?: typeof defaultRunPreflight;

	/** Where user-facing messages go */
	emitVerdict?: (verdict: string) => void;

	/** Where the session directory is created */
	sessionParentDirectory?: string;

	/** How long the host agent session may take */
	sessionTimeLimitMs?: number;

	/** Called as each page finishes capture and measurement */
	onPageCaptured?: (pageUrl: string) => void;
};

/**
 * How uxlint starts its own judgement server.
 *
 * Resolved from this module's location rather than from `process.argv`, which
 * on a global install points at a shim that re-execs and would leave the host
 * agent spawning something that is not this build.
 *
 * @returns The command and arguments a host agent should run
 */
function judgementServerCommand(): {command: string; args: string[]} {
	const cliEntryPoint = fileURLToPath(new URL('../cli.js', import.meta.url));
	return {command: process.execPath, args: [cliEntryPoint, 'mcp-serve']};
}

/**
 * What the host agent is asked to do.
 *
 * Short on purpose. The evidence is served through tools rather than pasted
 * here, so this only has to establish the persona, the job, and the order.
 *
 * @param config - Validated configuration for this run
 * @param pageCount - How many pages the session covers
 * @returns The prompt
 */
function buildPrompt(config: UxLintConfig, pageCount: number): string {
	return `You are an expert UX analyst reviewing a web application for one specific persona.

## Target Persona
${config.persona}

## What you are doing
uxlint has already opened every page in a real browser, captured its structure, and measured its accessibility and performance. Your job is the part measurement cannot reach: whether the wording makes sense, whether the structure matches how this persona thinks, whether the flow is one they could finish.

## What you are not asked to judge
Accessibility violations and performance are **measured** and are already recorded. You are reading a text description of a page: it carries no contrast ratios, no computed roles, no focus order and no paint timings. A severity you assign to something you cannot observe is a guess. Treat the measurements you are shown as established fact and do not repeat them as findings.

## How to work
There are ${pageCount} pages. For each one, in order:

1. Call \`getPageEvidence\` for it.
2. Read the captured structure from this persona's perspective.
3. Call \`addFinding\` once per problem you find. Three to ten per page is typical. Cover several categories: navigation, visual design, content, interaction, mobile responsiveness.
4. If measurements were supplied for that page, call \`noteOnMeasuredIssues\` ONCE to say what that set of violations means for this persona and how to address it here. Do not restate the violations.
5. Call \`completePageAnalysis\` for that page before moving to the next one.

Call \`listPages\` first, and again at any point you lose track of where you are. Finish every page. A page you never complete is recorded as unjudged.`;
}

/**
 * Raised when a host agent session outlives the run's bound.
 */
class SessionBoundExceeded extends Error {
	constructor(boundMs: number) {
		super(`The host agent session exceeded its ${boundMs} ms bound`);
		this.name = 'SessionBoundExceeded';
	}
}

/**
 * How long a session is given to end once its bound has expired.
 *
 * Longer than the grace `runLaunch` allows between SIGTERM and SIGKILL, so a
 * spawned agent is always seen to exit. An adapter that honours neither the
 * timeout nor the signal is waited for this long and no longer.
 */
const settlementGraceMs = 10_000;

/**
 * Wait for work to settle, but not indefinitely.
 *
 * @param work - What to wait for
 * @param graceMs - How long to wait
 * @returns Whether it settled within the grace period
 */
async function settlesWithin(
	work: Promise<unknown> | undefined,
	graceMs: number,
): Promise<boolean> {
	try {
		await withDeadline(graceMs, async () => work);
	} catch (error) {
		// A session that fails on its way out has still ended.
		return !(error instanceof DeadlineExpired);
	}

	return true;
}

/**
 * Run the host agent under a bound the run owns.
 *
 * The bound is a timer raced against the work rather than a promise the run
 * waits on. On expiry the signal handed to the adapter is aborted, which ends
 * a spawned agent whether or not its adapter honoured the timeout, and the
 * session is then waited for: the caller reads the log and removes the
 * directory next, and a judgement server still running would be writing into
 * both. An adapter that honours nothing at all is waited for only as long as
 * `settlementGraceMs`, so it still cannot hold the run open. Expiry is not a
 * failure: whatever the agent submitted before it expired is real, and the
 * report is assembled from that.
 *
 * @param adapter - The host agent
 * @param launch - What it should run
 * @param boundMs - How long it may take
 * @returns How the session ended
 */
async function boundedRun(
	adapter: HostAgentAdapter,
	launch: HostLaunch,
	boundMs: number,
): Promise<HostOutcome> {
	let running: Promise<HostOutcome> | undefined;

	try {
		return await withDeadline(
			boundMs,
			async signal => {
				running = adapter.run(launch, {timeoutMs: boundMs, signal});
				return running;
			},
			{timeoutError: () => new SessionBoundExceeded(boundMs)},
		);
	} catch (error) {
		if (error instanceof SessionBoundExceeded) {
			const ended = await settlesWithin(running, settlementGraceMs);

			logger.warn('Host agent session exceeded its bound', {
				hostAgent: adapter.id,
				boundMs,
				ended,
			});
			return {terminated: 'timed-out'};
		}

		// Anything else is the adapter failing, not the bound expiring. Reported
		// as a failed run rather than folded into a timeout, because the two
		// have different causes and a developer chasing one should not be shown
		// the other.
		throw error;
	}
}

/**
 * Run a review whose judgement a host agent performs.
 *
 * @param config - Validated configuration for this run
 * @param dependencies - Collaborators; the adapter is required
 * @returns `0` when the gate passed, `1` when it did not or the run failed
 */
export async function runDelegatedAnalysis(
	config: UxLintConfig,
	dependencies: DelegateDependencies,
): Promise<number> {
	const {
		adapter,
		client,
		builder,
		runPreflight = defaultRunPreflight,
		emitVerdict = writeTerminalMessage,
		sessionParentDirectory,
		sessionTimeLimitMs,
		onPageCaptured,
	} = dependencies;

	logger.info('Delegated analysis started', {
		hostAgent: adapter.id,
		totalPages: config.pages.length,
	});

	// Availability first. A host agent discovered to be missing after the
	// capture pass has already cost a full navigation and measurement sweep,
	// which is the exact waste FR-016 exists to prevent.
	const availability = await adapter.detect();
	if (availability.kind !== 'ready') {
		logger.error('Host agent unavailable', {
			hostAgent: adapter.id,
			kind: availability.kind,
		});
		emitVerdict(availability.message);
		return 1;
	}

	const preflight = await checkBrowser(config, runPreflight, emitVerdict);
	if (!preflight) {
		return 1;
	}

	let session: DelegationSession | undefined;
	let run: Awaited<ReturnType<typeof createDelegatedRun>> | undefined;
	let failure: string | undefined;

	try {
		run = await createDelegatedRun(config, preflight, {client, builder});
		const {mcpClient, reportBuilder} = run;

		// The startup guarantee the built-in path already makes: a browser
		// server missing a tool the analysis requires is a startup failure, not
		// a surprise partway through a page.
		narrowBrowserTools(await mcpClient.tools());

		const server = browserServerIdentity();
		reportBuilder.setProvenance({
			browserServer: server.name,
			browserServerVersion: server.version,
			browserVersion: preflight.browser.version,
			externalDataAllowed: config.browser?.allowExternalData ?? false,
			hostAgent: adapter.id,
		});
		reportBuilder.setPersona(config.persona);

		const measurement = new MeasurementService(mcpClient);

		const captured = await captureAllPages(
			mcpClient,
			measurement,
			config.pages,
			onPageCaptured,
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

		session = await DelegationSession.create(
			{hostAgent: adapter.id, pages: evidence},
			sessionParentDirectory === undefined
				? {}
				: {parentDirectory: sessionParentDirectory},
		);

		const launch = adapter.buildLaunch({
			sessionDirectory: session.directory,
			prompt: buildPrompt(config, evidence.length),
			server: judgementServerCommand(),
		});

		// Checked here rather than trusted from the adapter. An adapter edited
		// to drop its read-only flag would otherwise hand a developer's whole
		// repository to a model with nothing to notice it.
		assertReadOnly(adapter.id, launch);

		const boundMs =
			sessionTimeLimitMs ?? defaultSessionTimeLimitMs(evidence.length);
		const outcome = await boundedRun(adapter, launch, boundMs);

		logger.info('Host agent session finished', {
			hostAgent: adapter.id,
			terminated: outcome.terminated,
		});

		// What arrived, not what the agent said. An exit code is not evidence
		// about a page: a session that ends badly after judging four pages
		// leaves those four judged.
		const judgement = collect(await session.submissions());

		assembleReport(reportBuilder, captured, judgement);

		const report = reportBuilder.generateFinalReport();
		await reportBuilder.saveReport(config.report.output);

		await mcpClient.close();
		run = undefined;

		const gate = evaluateGate(report, config.thresholds);
		const verdict = renderGateVerdict(gate);

		if (verdict) {
			emitVerdict(verdict);
		}

		return gate.passed ? 0 : 1;
	} catch (error) {
		failure = error instanceof Error ? error.message : 'Unknown error';
		logger.error('Delegated analysis failed', {
			error: failure,
			stack: error instanceof Error ? error.stack : undefined,
		});
	} finally {
		// Unconditional on every path, including the failing one: a session
		// directory left behind is a delegated run that did not clean up after
		// itself on the developer's own machine.
		await session?.dispose();

		if (run) {
			try {
				await run.mcpClient.close();
			} catch (closeError) {
				logger.error('Failed to close the browser client', {
					error:
						closeError instanceof Error
							? closeError.message
							: String(closeError),
				});
			}
		}
	}

	emitVerdict(`uxlint: analysis failed — ${failure ?? 'Unknown error'}`);
	return 1;
}
