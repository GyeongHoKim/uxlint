/**
 * The capture pass, and the report assembly both routes share
 *
 * Everything here is work uxlint does itself: open a page, read its structure,
 * measure it, and later fold what arrived into the report. Neither the launcher
 * route nor the agent-driven route may own a private copy, because a measured
 * report that differed between them would make the two routes incomparable --
 * and SC-003 says the measured half must be identical.
 *
 * It lives in its own module rather than in `runner.ts` for a structural reason,
 * not a tidy one. `runner.ts` imports `./host/`, and nothing under
 * `./driven/` may reach a host adapter; importing the capture pass from the
 * runner would carry the whole launcher registry across that line, and
 * `tests/delegate/driven/host-neutrality.spec.ts` would say so.
 *
 * @packageDocumentation
 */

import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {logger} from '../infrastructure/logger.js';
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
import type {PageMeasurement} from '../models/measurement.js';
import {readToolOutcome} from '../models/tool-output.js';
import type {runPreflight as defaultRunPreflight} from '../services/browser-preflight.js';
import {
	measuredFindings,
	type MeasurementService,
} from '../services/measurement.js';
import type {ReportBuilder} from '../services/report-builder.js';
import type {collect} from './ingest.js';

/**
 * What one page yielded before any judgement was made on it.
 */
export type CapturedPage = {
	page: Page;
	snapshot: string;
	measurement: PageMeasurement;
	stage: PageStage;
	failureReason?: string;
};

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
export async function capturePage(
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
export function shortfallReason(
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
export async function captureAllPages(
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
 * A verdict that permits the run to continue.
 */
export type UsableBrowser = Exclude<PreflightVerdict, {kind: 'unmet'}>;

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
export async function checkBrowser(
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
export function assembleReport(
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
