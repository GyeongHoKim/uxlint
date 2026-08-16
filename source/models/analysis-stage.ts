/**
 * Analysis stages
 *
 * A page's analysis moves through three stages, and the stage decides which
 * tools the model is offered. That is what makes the sequence structural: an
 * unloaded page has no capture tool to call, so it cannot be captured early,
 * and the system does not have to ask the model nicely and then send a
 * reminder when it declines.
 *
 * Stages advance on **observed tool results**, never on the model asserting it
 * did something. A navigation that failed leaves the page unloaded, so what
 * follows cannot be a capture of a blank page recorded as if it were the site.
 *
 * @packageDocumentation
 */

/**
 * Where a page's analysis has reached.
 */
export type AnalysisStage = 'unloaded' | 'loaded' | 'analysable';

/** Every page begins here. */
export const initialStage: AnalysisStage = 'unloaded';

/**
 * A tool result as the loop observed it.
 */
export type ObservedToolResult = {
	/** Which tool produced it */
	toolName: string;

	/** Whether the tool completed rather than erroring */
	succeeded: boolean;

	/** What it returned, as text */
	output: string;
};

/**
 * The tool that moves each stage forward, and what the next stage is.
 *
 * Kept as data so that adding a stage touches one place rather than every
 * site that reasons about ordering.
 */
const advancingTool: Record<
	AnalysisStage,
	{tool: string; next: AnalysisStage} | undefined
> = {
	unloaded: {tool: 'navigate_page', next: 'loaded'},
	loaded: {tool: 'take_snapshot', next: 'analysable'},
	analysable: undefined,
};

/**
 * Which tools a stage offers.
 *
 * `addFinding` and `completePageAnalysis` are built by this project rather
 * than adapted from the browser server; only `navigate_page` and
 * `take_snapshot` are ever requested from it.
 *
 * Completion is offered at every stage because it is an exit, not a step in
 * the sequence. Withholding it until a capture succeeded left a page whose
 * navigation failed with no way to end: the loop ran its full twenty
 * iterations before giving up, which is a twentyfold cost increase on the
 * failure path in a feature whose subject is cost. Ending without a capture
 * is recorded as `partial`, so the escape hatch cannot be used to pass an
 * unread page off as analysed.
 */
const stageTools: Record<AnalysisStage, readonly string[]> = {
	unloaded: ['navigate_page', 'completePageAnalysis'],
	loaded: ['take_snapshot', 'completePageAnalysis'],
	analysable: ['addFinding', 'completePageAnalysis'],
};

/**
 * Browser-server tools this project requires, across all stages.
 *
 * Anything else the server exposes is not adapted, and its absence from the
 * server is a startup failure rather than a surprise mid-analysis.
 */
export const requiredBrowserTools = ['navigate_page', 'take_snapshot'] as const;

/**
 * The tools offered at a stage.
 *
 * @param stage - Where the analysis has reached
 * @returns Tool names to expose, never empty
 */
export function toolsForStage(stage: AnalysisStage): readonly string[] {
	return stageTools[stage];
}

/**
 * Move the stage on, if this result is the one that moves it.
 *
 * Anything that is not the current stage's advancing tool, or that failed, or
 * that came back empty, leaves the stage where it was. An empty capture is
 * treated as no capture on purpose: advancing would let the analysis judge a
 * page whose structure was never read.
 *
 * @param stage - Current stage
 * @param result - A tool result the loop observed
 * @returns The stage after this result
 */
export function advanceStage(
	stage: AnalysisStage,
	result: ObservedToolResult,
): AnalysisStage {
	const advance = advancingTool[stage];

	if (result.toolName !== advance?.tool) {
		return stage;
	}

	if (!result.succeeded || result.output.length === 0) {
		return stage;
	}

	return advance.next;
}
