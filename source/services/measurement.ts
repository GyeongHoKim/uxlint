/**
 * Measurement service
 *
 * Runs the deterministic audit and the performance trace for one page, and
 * turns what they return into findings the report can attribute to a machine.
 *
 * **The model never calls these tools.** They are not added to any stage's
 * tool set, not adapted, not named in the prompt; this service calls them
 * itself. Three reasons, each sufficient on its own:
 *
 * The audit's reply carries no violations at all -- roughly 400 bytes of
 * counts and two file paths, with the full result written to disk. A model
 * offered the tool would receive nothing it could act on.
 *
 * The trace's reply is several kilobytes, most of it a static description of
 * call-frame and network formats repeated on every call.
 *
 * And tool definitions are re-sent on every request, so adding two would undo
 * part of the reduction the previous feature measured -- to deliver
 * information the model cannot use.
 *
 * @packageDocumentation
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {logger} from '../infrastructure/logger.js';
import type {PageStage} from '../models/analysis-stage.js';
import {
	isAxeImpact,
	noMeasurement,
	notTaken,
	taken,
	type AuditResult,
	type Measured,
	type NotTakenReason,
	type PageMeasurement,
	type TraceResult,
	type Violation,
} from '../models/measurement.js';
import {readToolOutcome} from '../models/tool-output.js';

/**
 * How long one measurement may take before it is abandoned.
 *
 * **This is a hang net, not a performance target.** A measured run costs about
 * 7.6 seconds per page against a fixture served from localhost, and the audit
 * carries its own 30-second internal page-load ceiling. Sixty seconds sits
 * above that ceiling deliberately: a bound below it would fire on pages the
 * tool would have handled, and every spurious timeout costs a second
 * measurement's worth of time on the call after it -- the abandoned work goes
 * on running in the browser and the next call queues behind it.
 *
 * A run that regularly approaches this should be read as something being
 * wrong, not as a budget being spent.
 */
export const measurementTimeoutMs = 60_000;

/** The tool names this service calls. */
const auditTool = 'lighthouse_audit';
const traceTool = 'performance_start_trace';

/**
 * The part of an MCP client this service needs.
 *
 * Narrow on purpose: a test double for the whole client would be most of a
 * protocol implementation, and none of it would be exercised.
 */
export type MeasurementClient = {
	callTool(args: {
		name: string;
		arguments?: Record<string, unknown>;
		options?: {signal?: AbortSignal};
	}): Promise<unknown>;
};

/** Where the audit wrote its report, alongside the scores it summarised. */
export type ParsedAuditReply = {
	scores: Record<string, number>;
	reportPath: string;
};

/** Somewhere to send a line about a measurement that did not happen. */
export type MeasurementLog = (message: string) => void;

/**
 * Read the audit's summary reply.
 *
 * The reply is text. `@ai-sdk/mcp` does not pass the server's structured
 * content through -- only `content` and `isError` survive -- so parsing is the
 * only route to the report path, and the format recorded in the contract is
 * the format this reads.
 *
 * The `URL:` line is deliberately ignored: in the mode this feature uses it
 * reads the literal string `undefined`.
 *
 * @param reply - The audit's text reply
 * @returns The scores and report path, or why they could not be read
 */
export function parseAuditReply(reply: string): Measured<ParsedAuditReply> {
	const scores: Record<string, number> = {};

	for (const line of reply.split('\n')) {
		// `- Accessibility: 67 (accessibility)` -- the id in parentheses is the
		// key, because the title is prose and the id is not.
		const match = /^- .+?: (?<score>[\d.]+) \((?<id>[-a-z]+)\)$/.exec(
			line.trim(),
		);
		if (match?.groups) {
			scores[match.groups['id']!] = Number(match.groups['score']);
		}
	}

	const reportPath = reply
		.split('\n')
		.map(line => line.trim())
		.find(line => line.startsWith('- ') && line.endsWith('.json'))
		?.slice(2);

	if (!reportPath || Object.keys(scores).length === 0) {
		return notTaken('unparseable');
	}

	return taken({scores, reportPath});
}

/**
 * Read the accessibility violations out of the audit's full report.
 *
 * A rule that failed is one whose score is below 1. A score of `null` means
 * the rule did not apply to this page, and reading that as a failure would
 * invent violations the page does not have.
 *
 * @param json - The report file's contents
 * @returns The violations, or why they could not be read
 */
export function readAuditReport(json: string): Measured<{
	violations: Violation[];
	engineVersion?: string;
}> {
	let report: unknown;

	try {
		report = JSON.parse(json);
	} catch {
		return notTaken('unparseable');
	}

	const audits = (report as {audits?: Record<string, unknown>})?.audits;
	const refs = (
		report as {
			categories?: {accessibility?: {auditRefs?: Array<{id?: string}>}};
		}
	)?.categories?.accessibility?.auditRefs;

	if (!audits || !Array.isArray(refs)) {
		return notTaken('unparseable');
	}

	const violations = refs
		.map(ref => toViolation(ref.id ? audits[ref.id] : undefined, ref.id))
		.filter((violation): violation is Violation => violation !== undefined);

	const {lighthouseVersion} = report as {lighthouseVersion?: unknown};

	return taken({
		violations,
		engineVersion:
			typeof lighthouseVersion === 'string' ? lighthouseVersion : undefined,
	});
}

/**
 * One audit entry, as a violation -- or nothing, if it is not one.
 *
 * Split out from the loop above so that neither has to be read while holding
 * the other in mind. Everything here is a reason an audit does *not* become a
 * violation, and each reason is different.
 *
 * @param audit - The report's entry for one rule
 * @param fallbackId - The rule id the reference carried
 * @returns The violation, or nothing
 */
function toViolation(
	audit: unknown,
	fallbackId?: string,
): Violation | undefined {
	if (!audit || typeof audit !== 'object') {
		return undefined;
	}

	const typed = audit as {
		id?: string;
		title?: string;
		// The report really does use JSON null for "not applicable". Typed as
		// unknown so the narrowing below is what decides, rather than a type
		// that would have to name null to be accurate.
		score?: unknown;
		details?: {
			debugData?: {impact?: unknown};
			items?: unknown[];
		};
	};

	// A rule that passed, or one that did not apply to this page. `null` is
	// not-applicable, and reading it as a failure would invent violations the
	// page does not have.
	if (typeof typed.score !== 'number' || typed.score >= 1) {
		return undefined;
	}

	const {impact} = typed.details?.debugData ?? {};

	if (!isAxeImpact(impact)) {
		// No impact means no basis for a severity. Defaulting one would put a
		// guessed number inside a finding the report calls measured.
		logger.warn('Audit failure skipped: no impact rating', {
			ruleId: typed.id ?? fallbackId,
		});
		return undefined;
	}

	return {
		ruleId: typed.id ?? fallbackId ?? '',
		// The audit's own words, unaltered. Nothing the report labels as
		// measured may carry text this project or a model wrote.
		title: typed.title ?? '',
		impact,
		affectedElements: Math.max(1, typed.details?.items?.length ?? 1),
	};
}

/**
 * Read the observed metrics out of a trace reply.
 *
 * Each metric is wrapped separately: a trace over a page that produced no
 * navigation reports layout shift and no paint, so a successful trace is not a
 * guarantee that every metric within it exists.
 *
 * There is no First Contentful Paint here. The reply's only FCP figure is a
 * projected saving from a suggested fix, and publishing that as the page's FCP
 * would fabricate the kind of number this feature exists to remove.
 *
 * @param reply - The trace's text reply
 * @returns The metrics, each present or accounted for
 */
export function parseTraceReply(reply: string): Measured<TraceResult> {
	if (!reply.includes('Metrics (lab / observed)')) {
		return notTaken('unparseable');
	}

	// `  - LCP: 80 ms, event: ...`. Matching the value form rather than the
	// name, because `- LCP breakdown:` is a heading and a loose match eats it.
	const lcp = /^[\t ]*- LCP: (?<value>[\d.]+) ms/m.exec(reply);
	const cls = /^[\t ]*- CLS: (?<value>[\d.]+)[\t ]*$/m.exec(reply);

	return taken({
		largestContentfulPaint: lcp?.groups
			? taken(Number(lcp.groups['value']))
			: notTaken('unparseable'),
		cumulativeLayoutShift: cls?.groups
			? taken(Number(cls.groups['value']))
			: notTaken('unparseable'),
	});
}

/**
 * The measurement, as a few lines for the model to read.
 *
 * This is the *only* thing this feature adds to a model request. Not the
 * audit's reply, not the trace's, and certainly not the report: roughly 300 to
 * 600 bytes against a budget measured in the hundreds of thousands.
 *
 * It exists for two reasons. The model must not re-report a defect that has
 * already been verified -- duplicate findings, one measured and one guessed,
 * are worse than either alone. And it needs something concrete to write its
 * single page note about.
 *
 * Nothing here is a finding, and none of it is rendered as one.
 *
 * @param measurement - What was measured for the page
 * @returns The digest, or nothing when there is nothing to say
 */
export function describeMeasurement(measurement: PageMeasurement): string {
	const lines: string[] = [];

	if (measurement.audit.state === 'taken') {
		const {scores, violations} = measurement.audit.value;
		const {accessibility} = scores;

		if (accessibility !== undefined) {
			lines.push(`Accessibility score: ${accessibility}/100`);
		}

		if (violations.length > 0) {
			lines.push(
				'These accessibility rules were verified as failing. They are already recorded as findings -- do not report them again:',
			);
			for (const violation of violations) {
				const elements =
					violation.affectedElements === 1
						? '1 element'
						: `${violation.affectedElements} elements`;
				lines.push(
					`- ${violation.ruleId} (${violation.impact}, ${elements}): ${violation.title}`,
				);
			}
		} else {
			lines.push('The accessibility audit found no failing rules.');
		}
	}

	if (measurement.trace.state === 'taken') {
		const {largestContentfulPaint: lcp, cumulativeLayoutShift: cls} =
			measurement.trace.value;
		const parts: string[] = [];

		if (lcp.state === 'taken') {
			parts.push(`Largest Contentful Paint: ${lcp.value} ms`);
		}

		if (cls.state === 'taken') {
			parts.push(`Cumulative Layout Shift: ${cls.value}`);
		}

		if (parts.length > 0) {
			lines.push(parts.join(' \u{B7} '));
		}
	}

	if (lines.length === 0) {
		return '';
	}

	return [
		'## Verified measurements for this page',
		...lines,
		'',
		'Performance has been measured. Do not offer performance findings of your own -- you cannot see anything these numbers do not show.',
	].join('\n');
}

/** Raised when a measurement outlives its bound. */
class MeasurementTimeout extends Error {
	constructor() {
		super('Measurement abandoned at its time bound');
		this.name = 'MeasurementTimeout';
	}
}

/**
 * Run something under a deadline this process actually owns.
 *
 * `AbortSignal.timeout` is not usable here: its internal timer is unref'd, so
 * a call that never settles leaves nothing keeping the event loop alive and
 * the abort never fires -- the run simply stops. The bound has to be a timer
 * this code holds and clears.
 *
 * The controller is still handed to the callee so it can abandon its own
 * work; the race is what guarantees *we* stop waiting, whether or not it
 * does. A bound that depends on the callee honouring it is not a bound.
 *
 * @param timeoutMs - How long to wait
 * @param run - Given a signal, does the work
 * @returns Whatever the work returned
 * @throws MeasurementTimeout when the deadline passes first
 */
async function withDeadline<T>(
	timeoutMs: number,
	run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const controller = new AbortController();
	let expire: NodeJS.Timeout | undefined;

	const deadline = new Promise<never>((_resolve, reject) => {
		expire = setTimeout(() => {
			controller.abort();
			reject(new MeasurementTimeout());
		}, timeoutMs);
	});

	try {
		return await Promise.race([run(controller.signal), deadline]);
	} finally {
		// Without this a finished measurement would hold the process open for
		// the rest of the bound -- a minute per page, on every page.
		clearTimeout(expire);
	}
}

/**
 * Takes the measurements for a page.
 */
export class MeasurementService {
	constructor(
		private readonly client: MeasurementClient,
		private readonly timeoutMs: number = measurementTimeoutMs,
		private readonly log: MeasurementLog = message => {
			logger.warn(message);
		},
	) {}

	/**
	 * Measure the page the browser currently has open.
	 *
	 * The audit runs first because the trace reloads the page. Both are
	 * independent: one failing never prevents the other, and neither failing
	 * ever fails the page's analysis.
	 *
	 * @param stage - How far the page's analysis has got
	 * @returns What was measured, and an account of whatever was not
	 */
	async measure(stage: PageStage): Promise<PageMeasurement> {
		if (stage !== 'analysable') {
			// Nothing loaded, so there is nothing to audit. Recorded rather
			// than skipped, so the report can say the page was not measured
			// instead of leaving a blank that reads as a pass.
			this.record('audit', 'page-not-loaded');
			this.record('trace', 'page-not-loaded');
			return noMeasurement('page-not-loaded');
		}

		const audit = await this.runAudit();
		const trace = await this.runTrace();

		return {audit, trace};
	}

	/**
	 * Call a tool under the time bound, collapsing every failure route.
	 *
	 * Failure arrives three ways -- a rejection, an abort, and a result that
	 * carries `isError` without throwing. The third is the one that looks like
	 * success, and is the one this project has shipped a bug on before.
	 *
	 * @param name - Tool to call
	 * @param args - Arguments for it
	 * @returns The tool's text, or why there is none
	 */
	private async call(
		name: string,
		args: Record<string, unknown>,
	): Promise<Measured<string>> {
		try {
			const result = await withDeadline(this.timeoutMs, async signal =>
				this.client.callTool({name, arguments: args, options: {signal}}),
			);

			const outcome = readToolOutcome(result);

			return outcome.failed ? notTaken('tool-failed') : taken(outcome.text);
		} catch (error) {
			const timedOut =
				error instanceof MeasurementTimeout ||
				(error instanceof Error &&
					(error.name === 'AbortError' || error.name === 'TimeoutError'));

			return notTaken(timedOut ? 'timed-out' : 'tool-failed');
		}
	}

	/** Run the audit and read its report. */
	private async runAudit(): Promise<Measured<AuditResult>> {
		// `snapshot` rather than the tool's default `navigation`: the default
		// reloads, which would leave the captured page structure describing a
		// different load than the one that was audited. It is also markedly
		// faster, and the accessibility result is identical.
		const reply = await this.call(auditTool, {
			mode: 'snapshot',
			device: 'desktop',
		});

		if (reply.state !== 'taken') {
			this.record('audit', reply.reason);
			return reply;
		}

		const parsed = parseAuditReply(reply.value);

		if (parsed.state !== 'taken') {
			this.record('audit', parsed.reason);
			return parsed;
		}

		const report = await this.readAndDiscardReport(parsed.value.reportPath);

		if (report.state !== 'taken') {
			this.record('audit', report.reason);
			return report;
		}

		return taken({
			scores: parsed.value.scores,
			violations: report.value.violations,
			engineVersion: report.value.engineVersion,
			snapshotMode: true,
		});
	}

	/**
	 * Read the report file, then remove the directory the server made for it.
	 *
	 * The server writes a fresh random temp directory per call, holding the
	 * full JSON result and an HTML rendering of it. Nothing else cleans those
	 * up, so a run of any length would leave them accumulating.
	 *
	 * @param reportPath - Where the audit said it wrote the report
	 * @returns The violations, or why there are none
	 */
	private async readAndDiscardReport(
		reportPath: string,
	): Promise<Measured<{violations: Violation[]; engineVersion?: string}>> {
		let contents: string;

		try {
			contents = await fs.readFile(reportPath, 'utf8');
		} catch {
			return notTaken('unparseable');
		}

		const violations = readAuditReport(contents);

		try {
			await fs.rm(path.dirname(reportPath), {recursive: true, force: true});
		} catch (error) {
			// Failing to tidy up is not a reason to lose a measurement that was
			// taken successfully.
			logger.warn('Could not remove audit report directory', {
				reportPath,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		return violations;
	}

	/** Run the trace. */
	private async runTrace(): Promise<Measured<TraceResult>> {
		// One call: with autoStop the server records, waits and stops by
		// itself, so there is no stop call to pair with this.
		const reply = await this.call(traceTool, {reload: true, autoStop: true});

		if (reply.state !== 'taken') {
			this.record('trace', reply.reason);
			return reply;
		}

		const parsed = parseTraceReply(reply.value);

		if (parsed.state !== 'taken') {
			this.record('trace', parsed.reason);
		}

		return parsed;
	}

	/**
	 * Note that a measurement did not happen, and why.
	 *
	 * The reason is in the message rather than only in the returned value, so
	 * that a slow site and a broken one do not read alike to whoever is
	 * reading the log. Log files only: stdout and stderr carry MCP traffic.
	 *
	 * @param what - Which measurement
	 * @param reason - Why it is missing
	 */
	private record(what: 'audit' | 'trace', reason: NotTakenReason): void {
		this.log(`Measurement not taken (${what}): ${reason}`);
	}
}
