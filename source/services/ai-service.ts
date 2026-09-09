/**
 * AI Service
 * Handles AI-powered UX analysis using MCP tools and Manual Agent Loop pattern
 * Implements singleton pattern for global instance management
 *
 * @packageDocumentation
 */

import {promises as fsPromises} from 'node:fs';
import {type experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {type LanguageModelV4} from '@ai-sdk/provider';
import {
	hasToolCall,
	stepCountIs,
	tool,
	ToolLoopAgent,
	type ModelMessage,
} from 'ai';
import {z} from 'zod/v4';
import {getRandomWaitingMessage} from '../constants/waiting-messages.js';
import {logger} from '../infrastructure/logger.js';
import type {
	AnalysisStage as ProgressStage,
	PageAnalysis,
} from '../models/analysis.js';
import {
	advanceStage,
	initialStage,
	toolsForStage,
	type ObservedToolResult,
	type PageStage,
} from '../models/analysis-stage.js';
import type {PreflightVerdict} from '../models/browser-preflight.js';
import {readToolOutcome} from '../models/tool-output.js';
import {
	defaultPageTimeLimitMs,
	type Page,
	type UxLintConfig,
} from '../models/config.js';
import type {LLMResponseData} from '../models/llm-response.js';
import {noMeasurement, type PageMeasurement} from '../models/measurement.js';
import {withDeadline} from './deadline.js';
import {getLanguageModel} from './llm-provider.js';
import {
	getMCPClient,
	narrowBrowserTools,
	resetMCPClient,
} from './mcp-client.js';
import {
	MeasurementService,
	describeMeasurement,
	measuredFindings,
} from './measurement.js';
import {ReportBuilder} from './report-builder.js';

/**
 * Maximum steps for the agent loop, expressed as a stop condition. The value
 * is unchanged from the hand-written counter it replaces: budget exhaustion
 * still closes a page `partial`, so existing pipelines see no difference.
 */
const MAX_AGENT_STEPS = 20;

/**
 * Raised by the page bound when a page outlives its configured time limit.
 */
class PageBoundExceeded extends Error {
	constructor(limitMs: number) {
		super(`Page analysis exceeded its ${limitMs} ms time bound`);
		this.name = 'PageBoundExceeded';
	}
}

/**
 * The browser tool whose result is the page structure.
 */
const captureToolName = 'take_snapshot';

/**
 * Reduce a tool execution event to what the stage machine needs.
 *
 * The event's output field only exists on the success variant, so the
 * discriminant is checked before reading it rather than after.
 *
 * @param event - A tool execution end event
 * @returns The result as the loop observed it
 */
function observeTool(event: ToolExecutionEndEvent): ObservedToolResult {
	const outcome = readToolOutcome(
		event.toolOutput.output,
		event.toolOutput.type !== 'tool-result',
	);

	return {
		toolName: event.toolCall.toolName,
		succeeded: !outcome.failed,
		output: outcome.text,
	};
}

/**
 * The shape `onToolExecutionEnd` receives.
 *
 * Narrowed to the fields this code reads. Note `toolCall.toolName` rather than
 * a top-level `toolName`, which is undefined on this event.
 */
type ToolExecutionEndEvent = {
	toolCall: {toolName: string};
	toolOutput: {type: string; output?: unknown};
};

/**
 * Analysis progress callback type
 * Extended to support LLM response data display
 */
export type AnalysisProgressCallback = (
	stage: ProgressStage,
	message?: string,
	llmResponse?: LLMResponseData,
) => void;

/**
 * UX Finding schema for structured output
 */
const UxFindingSchema = z.object({
	severity: z.enum(['critical', 'high', 'medium', 'low']),
	category: z.string(),
	description: z.string(),
	personaRelevance: z.array(z.string()),
	recommendation: z.string(),
	pageUrl: z.string(),
});

// Deliberately absent from the schema above: `origin`. The model does not get
// to say where a finding came from -- the code that received it does. A model
// able to declare its own output measured would make the distinction this
// feature exists for worthless.

/**
 * AI Service
 * Orchestrates AI-powered UX analysis using MCP tools
 */
export class AIService {
	private readonly model: LanguageModelV4;
	private readonly mcpClient: MCPClient;
	private readonly measurement: MeasurementService;
	private readonly reportBuilder: ReportBuilder;
	private isClosed = false;

	/**
	 * Incremented per analyzePage call. Lifecycle events carrying an older
	 * epoch belong to an abandoned engine call -- a page whose bound expired
	 * while its capture was still in flight -- and must never touch the run's
	 * report state again.
	 */
	private pageEpoch = 0;

	/**
	 * Create an analysis service bound to one model and MCP connection.
	 *
	 * @param model - Language model backing the analysis
	 * @param mcpClient - Connected MCP client providing browser tools
	 * @param builder - Report builder collecting findings
	 * @param options - Optional collaborators
	 * @param options.measurement - Measurement service; defaults to one bound to this client
	 */
	constructor(
		model: LanguageModelV4,
		mcpClient: MCPClient,
		builder: ReportBuilder,
		options: {measurement?: MeasurementService} = {},
	) {
		const {measurement} = options;
		this.model = model;
		this.mcpClient = mcpClient;
		this.reportBuilder = builder;
		// Built from the same client the browser tools come from. Injectable so
		// a test can drive the measurement paths without a browser, which is
		// most of what makes this feature testable at all.
		this.measurement = measurement ?? new MeasurementService(mcpClient);
	}

	/**
	 * Close the MCP client connection.
	 *
	 * The transport is released with it. Report state belongs to the run that
	 * owns this service and is never touched here, but the transport is
	 * process-wide and memoised: leaving a closed handle in that memo hands
	 * the next run a connection nobody can use. The release is identity-checked
	 * so a service holding its own injected client evicts nothing.
	 *
	 * A closed instance answers further analyzePage calls with a failed page
	 * naming the cause, which is all the guard a per-run object needs.
	 */
	async close(): Promise<void> {
		try {
			if (this.mcpClient) {
				await this.mcpClient.close();
			}
		} finally {
			resetMCPClient(this.mcpClient);
			this.isClosed = true;
		}
	}

	/**
	 * Analyze a single page using Manual Agent Loop pattern
	 */
	async analyzePage(
		config: UxLintConfig,
		page: Page,
		onProgress?: AnalysisProgressCallback,
	): Promise<PageAnalysis> {
		if (!this.model || !this.mcpClient) {
			throw new Error('AIService not initialized');
		}

		if (this.isClosed) {
			// Name the real cause instead of letting the closed transport raise
			// whatever it raises. Reported straight to the caller and not
			// through the builder: this service is closed, so the page never
			// belonged to the report the builder is still holding, and writing
			// it there would plant a phantom failed page in a finished run.
			return {
				pageUrl: page.url,
				features: page.features,
				snapshot: '',
				findings: [],
				analysisTimestamp: Date.now(),
				status: 'failed',
				measurement: noMeasurement('page-not-loaded'),
				error:
					'AIService has been closed; create a new instance before analyzing again',
			};
		}

		try {
			// The persona belongs to the run, not to a page, but nothing else
			// records it: this used to live only in the error path, so a run
			// where every page succeeded produced a report with a blank
			// persona. Setting it here is idempotent.
			this.reportBuilder.setPersona(config.persona);

			// Initialize page analysis in report builder
			this.reportBuilder.initializePageAnalysis(page.url, page.features);

			// Identity of THIS page's engine run. Any lifecycle event arriving
			// after the page settles -- or after a newer page began -- belongs
			// to an abandoned call and is dropped before it can touch state.
			const epoch = ++this.pageEpoch;
			let pageSettled = false;
			const boundMs =
				config.analysis?.pageTimeLimitMs ?? defaultPageTimeLimitMs;

			// Get browser tools from the MCP server, narrowed to the ones the
			// analysis uses. Everything else the server offers would be re-sent,
			// in full, on every request.
			onProgress?.('navigating', `Navigating to ${page.url}`);
			const mcpTools = narrowBrowserTools(await this.mcpClient.tools());

			// Build system prompt
			const systemPrompt = this.buildSystemPrompt(config);

			// Build user prompt for this page
			const userPrompt = this.buildUserPrompt(page);

			// Create report building tools
			const reportTools = this.createReportTools();

			// Every tool the analysis could use at some point. Which of them is
			// offered is decided per iteration, by stage.
			const allTools = {
				...mcpTools,
				...reportTools,
			};

			// Where the page's analysis has reached. Advances only on observed
			// tool results -- never on the model asserting it did something --
			// so an unloaded page has no capture tool to call and the sequence
			// holds by construction rather than by reminder.
			let stage = initialStage;

			// Observations land here from the execution callback and are
			// drained in prepareStep, i.e. after the step that produced them
			// has fully finished. The close-out decision therefore never
			// depends on the order concurrent executions happened to resolve.
			const observed: ObservedToolResult[] = [];

			// Take everything observed so far, leaving the queue empty.
			const drainObservations = (): ObservedToolResult[] => {
				const drained = [...observed];
				observed.length = 0;
				return drained;
			};

			// One measurement per page: the moment the page first becomes
			// readable is the moment to measure it, before the model can
			// judge -- INCLUDING the turn where the model captures and
			// completes together, which is why this lives outside prepareStep.
			let measured = false;
			let digestSent = false;
			let pendingDigest: ModelMessage | undefined;

			const ensureMeasured = async () => {
				if (measured || stage !== 'analysable') {
					return;
				}

				measured = true;
				const digest = await this.measurePage(
					page,
					// Checked AFTER the await inside, not before it: a
					// measurement can outlive the bound that closed its page,
					// and its writes are report state like any other.
					() => !pageSettled && epoch === this.pageEpoch,
					onProgress,
				);

				if (digest) {
					pendingDigest = {role: 'user', content: digest};
				}
			};

			const agent = new ToolLoopAgent({
				model: this.model,
				instructions: systemPrompt,
				tools: allTools,
				stopWhen: [
					stepCountIs(MAX_AGENT_STEPS),
					hasToolCall('completePageAnalysis'),
				],
				prepareStep: async options => {
					if (pageSettled || epoch !== this.pageEpoch) {
						// This loop was abandoned at its page's bound. Throwing
						// stops it for good; its rejection is swallowed below.
						throw new PageBoundExceeded(boundMs);
					}

					for (const observation of drainObservations()) {
						stage = advanceStage(stage, observation);
					}

					await ensureMeasured();

					const messages = [...options.messages];
					if (pendingDigest && !digestSent) {
						digestSent = true;
						// The digest is a new user turn appended AFTER the
						// assistant/tool exchange it comments on. Inserted
						// anywhere else it splits a call from its result --
						// a malformed transcript some providers reject.
						messages.push(pendingDigest);
					}

					return {
						activeTools: toolsForStage(stage).filter(
							(name): name is keyof typeof allTools =>
								Object.hasOwn(allTools, name),
						),
						// Returning messages overrides the list for this step
						// and carries forward, which is how the digest rides
						// along without the loop ever assembling transcripts.
						messages,
					};
				},
				onToolExecutionStart: event => {
					if (pageSettled || epoch !== this.pageEpoch) {
						return;
					}

					onProgress?.('analyzing', `Running ${event.toolCall.toolName}…`);
				},
				onToolExecutionEnd: event => {
					// A late execution from an abandoned run must not write a
					// snapshot into whatever page is open now (F1 guard).
					if (pageSettled || epoch !== this.pageEpoch) {
						return;
					}

					// Derived once. The stage machine, the snapshot write and
					// the page's final status all read this one observation,
					// which is what keeps them in step.
					const observation = observeTool(event);
					this.recordCapture(observation);
					observed.push(observation);
				},
			});

			onProgress?.('analyzing', getRandomWaitingMessage(), undefined);

			// The page bound is a timer THIS run owns, raced against the whole
			// engine call. The derived signal is handed in so the engine can
			// abandon its work early, but the race is what guarantees this
			// await settles at the bound whether or not the callee honours it.
			// (The SDK's own totalMs rides an unref'd AbortSignal.timeout and
			// has been observed never to fire as the sole pending handle.)
			const controller = new AbortController();
			const generation = agent.generate({
				messages: [{role: 'user', content: userPrompt}],
				abortSignal: controller.signal,
				onStepStart: event => {
					// Same scoping rule as every other lifecycle callback: an
					// abandoned engine call must not narrate over the page
					// that replaced it.
					if (pageSettled || epoch !== this.pageEpoch) {
						return;
					}

					logger.info('AI Request', {
						context: `Page Analysis - ${page.url} - Step ${event.stepNumber}`,
					});

					// Honest placeholder for pure model-thinking time: the
					// rotating pool stays reserved for phases with no
					// engine events at all (startup, report writing).
					onProgress?.('analyzing', 'Analyzing with the model…');
				},
				onStepEnd: event => {
					if (pageSettled || epoch !== this.pageEpoch) {
						return;
					}

					logger.info('AI Response', {
						context: `Page Analysis - ${page.url} - Step ${event.stepNumber}`,
						response: {
							text: event.text,
							finishReason: event.finishReason,
							toolCalls: event.toolCalls,
							usage: event.usage,
						},
					});

					const llmResponse = this.createLLMResponseData(
						event,
						event.stepNumber + 1,
					);
					onProgress?.('analyzing', undefined, llmResponse);
				},
			});

			// A zombie loop that keeps stepping after expiry rejects here;
			// nobody is awaiting it any more, so swallow that rejection.
			generation.catch(() => undefined);

			let result;
			try {
				// The helper hands its own signal to the run callback; it stays
				// unused here ON PURPOSE. Cancellation reaches the engine through
				// the outer controller below -- the one generate already holds --
				// because aborting a second, unwired controller would reach
				// nothing. The race alone guarantees this await settles at the
				// bound whether or not the callee honours either signal.
				result = await withDeadline(boundMs, async () => generation, {
					timeoutError() {
						controller.abort();
						return new PageBoundExceeded(boundMs);
					},
				});
			} catch (error) {
				if (error instanceof PageBoundExceeded) {
					// The page's evidence is whatever landed before expiry:
					// drain observations, advance the stage, close out partial
					// with the expiry named, and let the run move on. Abort is
					// not instantaneous: callbacks still in flight may land
					// while this drain runs, and they count; whatever arrives
					// after the close-out is dropped by the scoping guards.
					for (const observation of drainObservations()) {
						stage = advanceStage(stage, observation);
					}

					this.finalisePage(false, stage, error.message);
					pageSettled = true;

					const expiredState = this.reportBuilder.getCurrentState();
					const expiredAnalysis = expiredState.completedAnalyses.at(-1);

					if (!expiredAnalysis) {
						throw new Error('Failed to complete page analysis', {
							cause: error,
						});
					}

					return expiredAnalysis;
				}

				throw error;
			}

			// Observations from the final step (the one whose completion tool
			// fired, if any) still have to advance the stage before the page
			// is closed out on its evidence.
			for (const observation of drainObservations()) {
				stage = advanceStage(stage, observation);
			}

			// The completing turn may itself be the one that made the page
			// readable; the old loop measured on that turn and so must this.
			await ensureMeasured();

			const signalledComplete = result.steps.some(step =>
				step.content.some(
					part =>
						part.type === 'tool-call' &&
						part.toolName === 'completePageAnalysis',
				),
			);

			// Close the page out with the status its evidence supports:
			// `complete` needs both the completion signal AND a captured page;
			// anything shorter -- budget spent, model stopping early, no
			// capture -- is exactly what `partial` exists to record for the
			// CI gate to distinguish from a finished sweep.
			this.finalisePage(signalledComplete && stage === 'analysable', stage);
			pageSettled = true;

			// Get the completed analysis from report builder
			const state = this.reportBuilder.getCurrentState();
			const completedAnalysis =
				// eslint-disable-next-line unicorn/prefer-at
				state.completedAnalyses[state.completedAnalyses.length - 1];

			if (!completedAnalysis) {
				throw new Error('Failed to complete page analysis');
			}

			onProgress?.('page-complete', `Finished analyzing ${page.url}`);

			return completedAnalysis;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';

			// Log the error for debugging
			logger.error('Page analysis failed', {
				pageUrl: page.url,
				error: errorMessage,
				errorName: error instanceof Error ? error.name : 'Unknown',
				stack: error instanceof Error ? error.stack : undefined,
			});

			// Record the failure and drop only this page. Calling reset() here
			// emptied the whole run, so a single failing page erased every page
			// already analysed -- and the hand-built result below was returned to
			// a caller that discards it, leaving the failure out of the report.
			return this.reportBuilder.failCurrentPage(errorMessage, page);
		}
	}

	/**
	 * Close the current page out with the status its evidence supports.
	 *
	 * Called after every observation from the last step has been applied, so
	 * the status cannot depend on the order the SDK happened to resolve
	 * concurrent tool calls in. Finalising inside the completion tool raced
	 * with the capture: both are offered at the same stage, so a model can
	 * call them in one response, and completion executing first closed the
	 * page out and left the capture with no open page to attach to -- the
	 * snapshot was dropped and a fully captured page recorded as partial.
	 *
	 * A page whose structure was never captured has not been analysed,
	 * whatever the model concluded about it, and neither has one the loop ran
	 * out of iterations on. Both are `partial`: the distinction 004 needed in
	 * order to gate a pipeline.
	 *
	 * @param signalledComplete - Whether the model called the completion tool
	 * @param stage - Where the page's analysis reached
	 * @param reason - Why the page stopped short, when the bound or an outer failure ended it; recorded on the partial page
	 */
	private finalisePage(
		signalledComplete: boolean,
		stage: PageStage,
		reason?: string,
	): void {
		const pending = this.reportBuilder.getCurrentState().currentPageAnalysis;
		if (!pending) {
			return;
		}

		// `analysable` is reached only by a capture that succeeded and returned
		// something, which is the same condition the snapshot write uses. Asking
		// the stage rather than re-inspecting the snapshot keeps one answer to
		// the question instead of two that must be kept in agreement.
		this.reportBuilder.completePageAnalysis(
			signalledComplete && stage === 'analysable' ? 'complete' : 'partial',
			reason,
		);
	}

	/**
	 * Measure the page, record what was found, and describe it to the model.
	 *
	 * Called at the single moment the page has become readable and nothing has
	 * yet been judged: the facts exist, and the model has not had a chance to
	 * invent competing ones. Measuring later would mean judging first.
	 *
	 * @param page - The page under analysis
	 * @param stillOurs - Whether the page measured is still the page open, asked after the measurement returns
	 * @param onProgress - Progress reporter for the interactive display
	 * @returns The digest to put in front of the model, empty when nothing was measured or it outlived its page
	 */
	private async measurePage(
		page: Page,
		stillOurs: () => boolean,
		onProgress?: AnalysisProgressCallback,
	): Promise<string> {
		onProgress?.('measuring', `Measuring ${page.url}`);

		const measurement = await this.measurement.measure('analysable');

		if (!stillOurs()) {
			// The page this was measured for closed while the measurement was
			// in flight -- almost always its time bound expiring mid-audit.
			// Whatever page is open now is a different page, and these numbers
			// and violations are not its own.
			logger.warn('Discarding a measurement that outlived its page', {
				pageUrl: page.url,
			});
			return '';
		}

		this.reportBuilder.setPageMeasurement(measurement);
		this.registerMeasuredFindings(measurement, page.url);

		if (
			measurement.audit.state === 'taken' &&
			measurement.audit.value.engineVersion
		) {
			this.reportBuilder.recordAuditEngine(
				measurement.audit.value.engineVersion,
			);
		}

		if (measurement.audit.state === 'not-taken') {
			onProgress?.(
				'measuring',
				`Measurement not taken for ${page.url}: ${measurement.audit.reason}`,
			);
		}

		return describeMeasurement(measurement);
	}

	/**
	 * Turn measured violations into findings.
	 *
	 * Registered by this code, not by the model: the violations arrive with a
	 * rule id, an impact rating and an element count, and every one of those
	 * would be degraded by asking a model to restate them. The description is
	 * the audit's own title, unaltered, so that nothing the report marks as
	 * measured carries a sentence this project or a model wrote.
	 *
	 * One finding per rule, whatever the element count. A single CSS rule
	 * failing on forty buttons is one problem, and forty findings would drown
	 * the report this feature is trying to make trustworthy.
	 *
	 * @param measurement - What was measured for the page
	 * @param pageUrl - The page they were measured on
	 */
	private registerMeasuredFindings(
		measurement: PageMeasurement,
		pageUrl: string,
	): void {
		for (const finding of measuredFindings(measurement, pageUrl)) {
			this.reportBuilder.addFinding(finding);
		}
	}

	/**
	 * Record a page structure capture as the browser produced it.
	 *
	 * The model is shown the capture as a tool result and is not asked to
	 * repeat it. Recording here rather than through a tool the model calls is
	 * what makes the stored snapshot byte-identical to the browser's output:
	 * there is no step in which it is re-encoded, shortened, or paraphrased.
	 *
	 * Only successful results are recorded. Failure arrives two ways -- the SDK
	 * reporting `tool-error`, or the server returning a result carrying
	 * `isError` -- and `readToolOutcome` collapses both, so an errored capture
	 * is skipped rather than stored as though the page had been read.
	 *
	 * @param observation - The tool result as the loop observed it
	 */
	private recordCapture(observation: ObservedToolResult): void {
		if (observation.toolName !== captureToolName) {
			return;
		}

		if (!observation.succeeded || observation.output.length === 0) {
			logger.warn('Page capture failed; nothing recorded', {
				toolName: observation.toolName,
			});
			return;
		}

		this.reportBuilder.setPageSnapshot(observation.output);
	}

	/**
	 * Create LLM response data for UI display
	 */
	private createLLMResponseData(
		result: {
			text?: string;
			toolCalls?: ReadonlyArray<{
				toolName: string;
				toolCallId?: string;
				input?: unknown;
			}>;
			finishReason?: unknown;
		},
		iteration: number,
	): LLMResponseData {
		// Structural on purpose: the caller is the loop's step-end event, and
		// only these three fields drive the UI. Tying the signature to a
		// specific SDK result type is what once shipped empty tool-call args
		// past a rename; reading exactly what the UI needs is the stable seam.
		const emptyArgs: Record<string, unknown> = {};
		return {
			text: result.text,
			toolCalls: result.toolCalls?.map((tc, index) => ({
				id: tc.toolCallId ?? `${tc.toolName}-${iteration}-${index}`,
				toolName: tc.toolName,
				// The SDK has called this `input` since v5; this code read the
				// pre-v5 `args`, so every tool call silently rendered as {}.
				args:
					typeof tc.input === 'object' &&
					tc.input !== null &&
					!Array.isArray(tc.input)
						? (tc.input as Record<string, unknown>)
						: emptyArgs,
			})),
			finishReason:
				typeof result.finishReason === 'string'
					? result.finishReason
					: undefined,
			iteration,
			timestamp: Date.now(),
		};
	}

	/**
	 * Create report building tools for LLM
	 */
	private createReportTools() {
		const builder = this.reportBuilder;

		return {
			addFinding: tool({
				description: `Add a UX finding to the current page analysis. Call this once for each UX issue you identify (typically 3-10 issues per page).

Usage: Call this tool multiple times, once per issue. Do not batch findings together.`,
				inputSchema: UxFindingSchema,
				async execute(input) {
					// The origin is set here rather than accepted from the model.
					// Everything arriving through this tool is the model's own
					// conclusion, whatever the model believes about it.
					builder.addFinding({...input, origin: 'judgement'});
					return {
						success: true,
						message: 'Finding added successfully',
						currentFindingsCount:
							builder.getCurrentState().currentPageAnalysis?.findings?.length ??
							0,
					};
				},
			}),

			noteOnMeasuredIssues: tool({
				description: `Record ONE note about the accessibility violations that were measured on this page: why they matter to this persona, and how to address them in this product.

Call this at most once per page, and only when measurements were supplied. Do not restate the violations -- they are already recorded. Explain what they mean for this persona.`,
				inputSchema: z.object({note: z.string()}),
				async execute(input) {
					builder.setMeasurementNote(input.note);
					return {success: true, message: 'Note recorded'};
				},
			}),

			completePageAnalysis: tool({
				description:
					'Mark the current page analysis as complete. REQUIRED: You MUST call this tool when you have finished analyzing all UX aspects and reporting findings. The analysis is not complete until you call this.',
				inputSchema: z.object({}),
				async execute() {
					// Signals intent; the loop finalises the page once every tool
					// result from this step has landed.
					//
					// Finalising here raced with the capture. Both tools are
					// offered at the same stage, so a model can call them in one
					// response -- and if completion executed first it closed the
					// page out, leaving the capture that arrived moments later
					// with no open page to attach to. The snapshot was dropped
					// entirely and a fully captured page was recorded as partial.
					const current = builder.getCurrentState().currentPageAnalysis;
					return {
						success: true,
						message: 'Page analysis completed',
						pageUrl: current?.pageUrl ?? '',
						findingsCount: current?.findings?.length ?? 0,
					};
				},
			}),
		};
	}

	/**
	 * Build system prompt for UX analysis
	 */
	private buildSystemPrompt(config: UxLintConfig): string {
		return `You are an expert UX analyst specializing in comprehensive web usability analysis.

## Target Persona
${config.persona}

Analyze pages from this persona's perspective, identifying usability issues across: Navigation, Visual Design, Content, Interaction, and Mobile Responsiveness.

## What you are not asked to judge

Accessibility violations and performance are **measured** on every page by
tooling, and the results are given to you. You are not asked to find them, and
you cannot: you are reading a text description of the page, which carries no
contrast ratios, no computed roles, no focus order and no paint timings. A
severity you assign to something you cannot observe is a guess.

Where measurements are supplied, treat them as established fact. Your work is
what measurement cannot reach -- whether the wording makes sense, whether the
structure matches how this persona thinks, whether the flow is one they could
finish.`;
	}

	/**
	 * Build user prompt for a specific page
	 */
	private buildUserPrompt(page: Page): string {
		return `Analyze this page for UX issues:

URL: ${page.url}

Page Features/Context:
${page.features}

## Workflow - Complete ALL Steps

**Step 1: Navigate and Capture**
1. Call navigate_page to load the page
2. Call take_snapshot to capture the page structure

**Step 2: Analyze and Document**
3. Thoroughly analyze the page from the persona's perspective
4. For EACH UX issue found, immediately call addFinding
   - Report 3-10 issues per page typically
   - Call addFinding once per issue (do not batch)
   - Cover multiple UX categories
   - Do NOT report anything already listed as a verified measurement. It is
     recorded already, and reporting it again would put a guess beside a fact
5. If verified measurements were supplied for this page, call
   noteOnMeasuredIssues ONCE to say what that set of violations means for this
   persona and how to address it here. Do not call it more than once, and do
   not restate the violations themselves

**Step 3: Complete**
6. Call completePageAnalysis when finished
   - This is REQUIRED to complete the analysis
   - Do not stop until you call this tool

IMPORTANT: You MUST call completePageAnalysis before finishing. The analysis is not complete until this tool is called.`;
	}
}

/**
 * One analysis run: a service and the report accumulator it writes to,
 * created together and shared with nothing.
 *
 * Previously an implicit module singleton plus a per-config service cache --
 * the arrangement behind one failing page erasing every analysed page, and
 * behind a closed client being handed to the next run. Explicit ownership
 * makes both impossible by construction.
 */
export type AnalysisRun = {
	aiService: AIService;
	reportBuilder: ReportBuilder;
};

/**
 * Collaborators for tests: supply any subset and `createAIService` uses it
 * instead of building the real thing, so isolation can be exercised without
 * credentials or a browser.
 */
export type AIServiceOverrides = {
	model?: LanguageModelV4;
	client?: MCPClient;
	builder?: ReportBuilder;
};

/**
 * Assemble one analysis run from a validated configuration.
 *
 * Every call returns a fresh pair; there is no cache to be poisoned and no
 * singleton to reset. Callers own the builder for provenance, finalisation
 * and saving -- see ci-runner.ts and use-analysis.ts.
 *
 * @param config - Validated configuration for this run
 * @param verdict - The preflight verdict proving a browser is usable
 * @param overrides - Test collaborators replacing real construction
 * @returns The run's service and report builder
 */
export async function createAIService(
	config: UxLintConfig,
	verdict: PreflightVerdict | undefined,
	overrides: AIServiceOverrides = {},
): Promise<AnalysisRun> {
	const {model, client, builder} = overrides;

	// Model resolution is the only step delegate mode does not want, so it
	// happens here rather than inside the shared assembly below. Reaching for a
	// provider is what makes a credential mandatory, and a delegated run never
	// calls one.
	const resolvedModel = model ?? (await getLanguageModel(config));
	const {mcpClient, reportBuilder} = await assembleBrowserRun(config, verdict, {
		client,
		builder,
	});

	return {
		aiService: new AIService(resolvedModel, mcpClient, reportBuilder),
		reportBuilder,
	};
}

/**
 * One delegated run: the browser connection and the report accumulator, with
 * no language model between them.
 */
export type DelegatedRun = {
	mcpClient: MCPClient;
	reportBuilder: ReportBuilder;
};

/**
 * Collaborators for tests, as `AIServiceOverrides` but without a model: there
 * is none to override.
 */
export type DelegatedRunOverrides = {
	client?: MCPClient;
	builder?: ReportBuilder;
};

/**
 * Assemble the model-free half of a run.
 *
 * Shared by both assemblies so that the browser client and the report builder
 * a delegated run gets are the same ones the built-in run gets, rather than a
 * second construction that could drift from it.
 *
 * @param config - Validated configuration for this run
 * @param verdict - The preflight verdict proving a browser is usable
 * @param overrides - Test collaborators replacing real construction
 * @returns The browser connection and the report accumulator
 */
async function assembleBrowserRun(
	config: UxLintConfig,
	verdict: PreflightVerdict | undefined,
	overrides: DelegatedRunOverrides,
): Promise<DelegatedRun> {
	const {client, builder} = overrides;

	return {
		mcpClient:
			client ?? (await getMCPClient(requireVerdict(verdict), config.browser)),
		reportBuilder: builder ?? new ReportBuilder(fsPromises),
	};
}

/**
 * Assemble a run whose judgement a host agent will perform.
 *
 * Deliberately does not resolve a language model, and therefore never reads a
 * provider credential. That is not a convenience: delegate mode exists so a
 * developer who already pays for a coding agent does not need a second
 * credential, and a run that constructs a provider it never calls has still
 * handed a third-party SDK the developer's key.
 *
 * @param config - Validated configuration for this run
 * @param verdict - The preflight verdict proving a browser is usable
 * @param overrides - Test collaborators replacing real construction
 * @returns The browser connection and the report accumulator
 */
export async function createDelegatedRun(
	config: UxLintConfig,
	verdict: PreflightVerdict | undefined,
	overrides: DelegatedRunOverrides = {},
): Promise<DelegatedRun> {
	return assembleBrowserRun(config, verdict, overrides);
}

/**
 * A browser client cannot be built without proof a browser exists. Reaching
 * here without a verdict means a caller skipped preflight -- an ordering bug
 * worth naming rather than silently analysing with whatever transport answers.
 *
 * @param verdict - The preflight verdict, when one was produced
 * @returns The verdict, narrowed
 * @throws Error when the verdict is missing
 */
function requireVerdict(
	verdict: PreflightVerdict | undefined,
): PreflightVerdict {
	if (!verdict) {
		throw new Error(
			'A usable browser preflight verdict is required before creating an analysis run',
		);
	}

	return verdict;
}
