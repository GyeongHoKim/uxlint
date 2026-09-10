/**
 * `delegate submit`
 *
 * Judgement in, report out. The document is **split, not parsed**: every finding
 * inside it goes through the same `validateFinding` and `toUxFinding` the MCP
 * judgement server uses, so origin assignment has exactly one implementation.
 * Nothing here may construct a finding itself — a second intake would be a third
 * place for the rule that a submitter cannot declare its own output measured to
 * drift, and 009 already had to harden that boundary twice.
 *
 * The report is rewritten on every call rather than on a final one. An agent may
 * submit per page, and uxlint cannot know which submission is the last, because
 * page status is decided by what arrived and never by the agent's account of
 * itself. Writing every time means a review abandoned after any call has already
 * produced its honest partial report.
 *
 * @packageDocumentation
 */

import {promises as fsPromises} from 'node:fs';
import process from 'node:process';
import type {z} from 'zod/v4';
import {logger} from '../../infrastructure/logger.js';
import {writeTerminalMessage} from '../../infrastructure/console-output.js';
import type {UxLintConfig} from '../../models/config.js';
import {
	judgementDocumentSchema,
	type JudgementDocument,
} from '../../models/delegate.js';
import {evaluateGate, renderGateVerdict} from '../../models/gate-result.js';
import {ReportBuilder} from '../../services/report-builder.js';
import {assembleReport, type CapturedPage} from '../capture-pass.js';
import {collect, validateFinding, SubmissionRejected} from '../ingest.js';
import {DelegationSession} from '../session.js';

/**
 * What `submit` needs.
 */
export type SubmitOptions = {
	/** The run identity, from `--run` */
	run: string;

	/** The document's path, from `--file`; stdin when absent or `-` */
	file?: string;

	/** Where run directories live */
	parentDirectory?: string;

	/** The document itself, so a test need not go through a file */
	document?: JudgementDocument;

	/** Where user-facing messages go */
	emitMessage?: (message: string) => void;
};

/**
 * Render an envelope failure as something the agent can act on.
 *
 * Only the envelope reaches here. A finding's own problems are reported one at a
 * time by the intake, which is what lets the rest of the document through.
 *
 * @param error - What the schema reported
 * @returns One line naming each problem
 */
function describeDocumentIssues(error: z.ZodError): string {
	return `the judgement document was refused — ${error.issues
		.map(issue =>
			issue.code === 'unrecognized_keys'
				? `${issue.keys.join(', ')}: not part of a judgement document`
				: `${issue.path.join('.') || 'the document'}: ${issue.message}`,
		)
		.join('; ')}`;
}

/**
 * Read the whole of stdin.
 *
 * @returns What was piped in
 */
async function readStdin(): Promise<string> {
	const decoder = new TextDecoder();
	let text = '';

	for await (const chunk of process.stdin) {
		text += decoder.decode(chunk as Uint8Array, {stream: true});
	}

	return text + decoder.decode();
}

/**
 * Attach the page a finding was submitted under.
 *
 * The envelope already names the page, so requiring every finding to repeat it
 * is redundant — and a live run showed it is worse than redundant: the natural
 * document an agent writes omits it, and every finding was then refused for a
 * field the document had already supplied one level up. The page entry is
 * authoritative, so uxlint fills it in.
 *
 * A finding that names a *different* page is left alone rather than corrected,
 * so the intake refuses the contradiction instead of uxlint silently picking a
 * side.
 *
 * @param candidate - One finding, exactly as it arrived
 * @param pageUrl - The page it was submitted under
 * @returns The finding with its page attributed
 */
function attributeToPage(candidate: unknown, pageUrl: string): unknown {
	if (typeof candidate !== 'object' || candidate === null) {
		return candidate;
	}

	return 'pageUrl' in candidate ? candidate : {...candidate, pageUrl};
}

/**
 * Record everything in a document that the intake accepts.
 *
 * Partial acceptance is the normal case, not an error path: one malformed
 * finding must not cost an agent a page's work, and every refusal has to name
 * what was wrong, because the agent's only chance to act on it is its next call.
 *
 * @param session - The run being submitted to
 * @param document - The validated document
 * @returns One line per refusal, in the order they were found
 */
async function record(
	session: DelegationSession,
	document: JudgementDocument,
): Promise<string[]> {
	const refusals: string[] = [];

	for (const page of document.pages) {
		// eslint-disable-next-line no-await-in-loop -- the tracker must see each page's submissions in order
		const tracker = await session.trackerFromLog();

		try {
			tracker.requireOpen(page.pageUrl);
		} catch (error) {
			refusals.push(
				error instanceof SubmissionRejected ? error.message : String(error),
			);
			continue;
		}

		for (const candidate of page.findings ?? []) {
			try {
				const finding = validateFinding(
					attributeToPage(candidate, page.pageUrl),
					session.pageUrls,
				);
				// eslint-disable-next-line no-await-in-loop -- submissions are sequential
				await session.append({
					kind: 'finding',
					pageUrl: finding.pageUrl,
					finding,
				});
			} catch (error) {
				refusals.push(
					error instanceof SubmissionRejected ? error.message : String(error),
				);
			}
		}

		if (page.measurementNote !== undefined) {
			// eslint-disable-next-line no-await-in-loop -- as above
			await session.append({
				kind: 'note',
				pageUrl: page.pageUrl,
				note: page.measurementNote,
			});
		}

		if (page.finished === true) {
			// eslint-disable-next-line no-await-in-loop -- as above
			await session.append({kind: 'complete', pageUrl: page.pageUrl});
		}
	}

	return refusals;
}

/**
 * Record an agent's judgement, then write the report and report the gate verdict.
 *
 * @param config - Validated configuration, for the report's output path and thresholds
 * @param options - The run, and where the document comes from
 * @returns The gate's exit code, or `1` when the submission could not be read at all
 */
export async function submitJudgement(
	config: UxLintConfig,
	options: SubmitOptions,
): Promise<number> {
	const {
		run,
		file,
		parentDirectory,
		document: supplied,
		emitMessage = writeTerminalMessage,
	} = options;

	let session: DelegationSession;

	try {
		session = await DelegationSession.loadById(
			run,
			parentDirectory === undefined ? {} : {parentDirectory},
		);
	} catch {
		emitMessage(
			`uxlint: no run ${run}. Run \`uxlint delegate capture\` first, or \`uxlint delegate runs\` to see which runs exist.`,
		);
		return 1;
	}

	let candidate: unknown;

	if (supplied === undefined) {
		let raw: string;

		try {
			raw =
				file === undefined || file === '-'
					? await readStdin()
					: await fsPromises.readFile(file, 'utf8');
		} catch (error) {
			emitMessage(
				`uxlint: the judgement document could not be read — ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
			return 1;
		}

		let parsedJson: unknown;
		try {
			parsedJson = JSON.parse(raw);
		} catch (error) {
			// Nothing is appended, so the run's recorded state survives a document
			// that arrived truncated.
			emitMessage(
				`uxlint: the judgement document is not valid JSON — ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
			return 1;
		}

		candidate = parsedJson;
	} else {
		// A caller may hand the document over directly, but it goes through the
		// same schema below: a path that skipped validation would be a second
		// intake.
		candidate = supplied;
	}

	const validated = judgementDocumentSchema.safeParse(candidate);

	if (!validated.success) {
		emitMessage(`uxlint: ${describeDocumentIssues(validated.error)}`);
		return 1;
	}

	const refusals = await record(session, validated.data);

	for (const refusal of refusals) {
		emitMessage(`uxlint: ${refusal}`);
	}

	return writeReport(config, session, emitMessage);
}

/**
 * Assemble the report from everything the run has accumulated.
 *
 * @param config - Validated configuration for this run
 * @param session - The run
 * @param emitMessage - Where the gate verdict goes
 * @returns The gate's exit code
 */
async function writeReport(
	config: UxLintConfig,
	session: DelegationSession,
	emitMessage: (message: string) => void,
): Promise<number> {
	const builder = new ReportBuilder(fsPromises);
	const {provenance, persona, captured} = session.manifest;

	if (provenance) {
		builder.setProvenance({
			...provenance,
			hostAgent: session.manifest.hostAgent,
		});
	}

	builder.setPersona(persona ?? '');

	// What arrived, not what the agent said about it.
	const judgement = collect(await session.submissions());
	assembleReport(builder, (captured ?? []) as CapturedPage[], judgement);

	const report = builder.generateFinalReport();
	await builder.saveReport(config.report.output);

	logger.info('Agent-driven report written', {
		run: session.id,
		output: config.report.output,
	});

	const gate = evaluateGate(report, config.thresholds);
	const verdict = renderGateVerdict(gate);

	if (verdict) {
		emitMessage(verdict);
	}

	return gate.passed ? 0 : 1;
}
