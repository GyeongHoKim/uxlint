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
import {
	advanceStage,
	initialStage,
	type PageStage,
} from '../models/analysis-stage.js';
import {
	describeSandboxRelaxation,
	describeUnmetRequirement,
	type PreflightVerdict,
} from '../models/browser-preflight.js';
import type {Page, UxLintConfig} from '../models/config.js';
import type {PageEvidence} from '../models/delegate.js';
import {evaluateGate, renderGateVerdict} from '../models/gate-result.js';
import type {PageMeasurement} from '../models/measurement.js';
import {readToolOutcome} from '../models/tool-output.js';
import {createDelegatedRun} from '../services/ai-service.js';
import {withDeadline} from '../services/deadline.js';
import {runPreflight as defaultRunPreflight} from '../services/browser-preflight.js';
import {
	browserServerIdentity,
	narrowBrowserTools,
} from '../services/mcp-client.js';
import {MeasurementService, measuredFindings} from '../services/measurement.js';
import type {ReportBuilder} from '../services/report-builder.js';
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
 * How long a host agent session may take before the run abandons it.
 *
 * **Provisional.** No baseline for a delegated run exists yet, so this is a
 * hang net rather than a budget: high enough that a healthy run on a slow
 * machine cannot trip it, and low enough that a stuck agent does not hold a
 * terminal overnight. It is scheduled to be replaced with a measured figure.
 */
export const defaultSessionTimeLimitMs = 1_800_000;

/**
 * What one page yielded before any judgement was made on it.
 */
type CapturedPage = {
	page: Page;
	snapshot: string;
	measurement: PageMeasurement;
	stage: PageStage;
	failureReason?: string;
};

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
 * Navigate to a page and capture its structure.
 *
 * Driven by direct tool calls rather than by a model, which is the whole point:
 * this is deterministic work. The stage machine decides whether the result
 * counts as a capture, so the rule that an empty tree is not a read page has
 * one implementation rather than two.
 *
 * @param client - Connected browser client
 * @param page - The page to open
 * @returns What was captured, and why not when nothing was
 */
async function capturePage(
	client: MCPClient,
	page: Page,
): Promise<{snapshot: string; stage: PageStage; failureReason?: string}> {
	const callTool = (
		client as unknown as {
			callTool(args: {
				name: string;
				arguments?: Record<string, unknown>;
			}): Promise<unknown>;
		}
	).callTool.bind(client);

	let stage: PageStage = initialStage;

	const navigation = readToolOutcome(
		await callTool({name: 'navigate_page', arguments: {url: page.url}}),
	);
	stage = advanceStage(stage, {
		toolName: 'navigate_page',
		succeeded: !navigation.failed,
		output: navigation.text,
	});

	if (stage === initialStage) {
		return {
			snapshot: '',
			stage,
			failureReason: `The page could not be opened: ${navigation.text || 'navigation failed'}`,
		};
	}

	const capture = readToolOutcome(
		await callTool({name: 'take_snapshot', arguments: {}}),
	);
	stage = advanceStage(stage, {
		toolName: 'take_snapshot',
		succeeded: !capture.failed,
		output: capture.text,
	});

	if (stage !== 'analysable') {
		return {
			snapshot: '',
			stage,
			failureReason: `The page structure could not be read: ${capture.text || 'the capture returned nothing'}`,
		};
	}

	return {snapshot: capture.text, stage};
}

/**
 * Why a page ended up short of a finished judgement.
 *
 * @param captured - What the deterministic half produced
 * @param judged - Whether the host agent signalled the page finished
 * @param touched - Whether the host agent submitted anything for it
 * @returns The reason, or undefined when the page is complete
 */
function shortfallReason(
	captured: CapturedPage,
	judged: boolean,
	touched: boolean,
): string | undefined {
	if (captured.failureReason) {
		return captured.failureReason;
	}

	if (judged) {
		return undefined;
	}

	return touched
		? 'The host agent began judging this page but did not complete it before the session ended.'
		: 'The host agent session ended before judgement reached this page.';
}

/**
 * Open, capture and measure every page before any judgement begins.
 *
 * All of it happens up front because one host agent session covers the whole
 * run: the agent cannot be launched until there is something to judge on every
 * page.
 *
 * @param client - Connected browser client
 * @param measurement - The measurement service bound to that client
 * @param pages - The pages to cover, in configuration order
 * @param onPageCaptured - Called as each page finishes
 * @returns What each page yielded, in configuration order
 */
async function captureAllPages(
	client: MCPClient,
	measurement: MeasurementService,
	pages: readonly Page[],
	onPageCaptured?: (pageUrl: string) => void,
): Promise<CapturedPage[]> {
	const captured: CapturedPage[] = [];

	for (const page of pages) {
		// eslint-disable-next-line no-await-in-loop -- one browser, one page at a time
		const opened = await capturePage(client, page);
		// eslint-disable-next-line no-await-in-loop -- measurement follows its own page
		const measured = await measurement.measure(opened.stage);

		captured.push({page, ...opened, measurement: measured});
		onPageCaptured?.(page.url);

		logger.info('Page captured for delegation', {
			pageUrl: page.url,
			stage: opened.stage,
		});
	}

	return captured;
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
 * Run the host agent under a bound the run owns.
 *
 * The bound is a timer raced against the work rather than a signal handed to
 * it. An adapter that spawns a process can kill it; an adapter that does not
 * honour the timeout at all still cannot hold the run open, because the race
 * settles either way. Expiry is not a failure: whatever the agent submitted
 * before it expired is real, and the report is assembled from that.
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
	try {
		return await withDeadline(
			boundMs,
			async () => adapter.run(launch, {timeoutMs: boundMs}),
			{timeoutError: () => new SessionBoundExceeded(boundMs)},
		);
	} catch (error) {
		if (error instanceof SessionBoundExceeded) {
			logger.warn('Host agent session exceeded its bound', {
				hostAgent: adapter.id,
				boundMs,
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
 * A verdict that permits the run to continue.
 */
type UsableBrowser = Exclude<PreflightVerdict, {kind: 'unmet'}>;

/**
 * Establish that this environment can run a browser, reporting if it cannot.
 *
 * The same three outcomes the CI runner already handles, kept here rather than
 * shared with it because the two runners differ in everything around this step
 * and a shared helper would have to take both their shapes.
 *
 * @param config - Validated configuration for this run
 * @param runPreflight - The preflight probe
 * @param emitVerdict - Where user-facing messages go
 * @returns The verdict when the run may proceed, or undefined when it may not
 */
async function checkBrowser(
	config: UxLintConfig,
	runPreflight: typeof defaultRunPreflight,
	emitVerdict: (verdict: string) => void,
): Promise<UsableBrowser | undefined> {
	let preflight: PreflightVerdict;

	try {
		preflight = await runPreflight(config.browser);
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'Unknown error';
		logger.error('Preflight could not run', {error: reason});
		emitVerdict(
			`uxlint: the browser preflight check could not run — ${reason}. This is an environment problem rather than a missing browser.`,
		);
		return undefined;
	}

	if (preflight.kind === 'unmet') {
		logger.error('Preflight failed', {requirement: preflight.requirement.kind});
		emitVerdict(describeUnmetRequirement(preflight.requirement));
		return undefined;
	}

	if (preflight.kind === 'ready-without-sandbox') {
		logger.warn('Sandbox relaxation', {cause: preflight.cause});
		emitVerdict(describeSandboxRelaxation(preflight.cause));
	}

	return preflight;
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

		const boundMs = sessionTimeLimitMs ?? defaultSessionTimeLimitMs;
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

/**
 * Write every page into the report, in configuration order.
 *
 * Deferred until the session has ended because the builder holds one page at a
 * time and a delegated run judges them all in one pass. Measured findings are
 * registered here by code, exactly as the built-in path registers them.
 *
 * @param builder - The run's report accumulator
 * @param captured - What the deterministic half produced, per page
 * @param judgement - What the host agent submitted, grouped by page
 */
function assembleReport(
	builder: ReportBuilder,
	captured: readonly CapturedPage[],
	judgement: ReturnType<typeof collect>,
): void {
	for (const item of captured) {
		const {page} = item;
		builder.initializePageAnalysis(page.url, page.features);

		if (item.snapshot.length > 0) {
			builder.setPageSnapshot(item.snapshot);
		}

		builder.setPageMeasurement(item.measurement);

		for (const finding of measuredFindings(item.measurement, page.url)) {
			builder.addFinding(finding);
		}

		if (
			item.measurement.audit.state === 'taken' &&
			item.measurement.audit.value.engineVersion
		) {
			builder.recordAuditEngine(item.measurement.audit.value.engineVersion);
		}

		const findings = judgement.findingsByPage.get(page.url) ?? [];
		for (const finding of findings) {
			builder.addFinding(finding);
		}

		const note = judgement.noteByPage.get(page.url);
		if (note !== undefined) {
			builder.setMeasurementNote(note);
		}

		const judged = judgement.finished.has(page.url);
		const touched = findings.length > 0 || note !== undefined;
		const reason = shortfallReason(item, judged, touched);

		builder.completePageAnalysis(
			judged && item.stage === 'analysable' ? 'complete' : 'partial',
			reason,
		);
	}
}
