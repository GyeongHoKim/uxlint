import test from 'ava';
import {
	advanceStage,
	initialStage,
	toolsForStage,
	type AnalysisStage,
} from '../../source/models/analysis-stage.js';

const navigated = {toolName: 'navigate_page', succeeded: true, output: 'ok'};
const captured = {
	toolName: 'take_snapshot',
	succeeded: true,
	output: 'button "Sign up"',
};

test('a page starts unloaded', t => {
	t.is(initialStage, 'unloaded');
});

test('a successful navigation loads the page', t => {
	t.is(advanceStage('unloaded', navigated), 'loaded');
});

test('a successful capture makes the page analysable', t => {
	t.is(advanceStage('loaded', captured), 'analysable');
});

test('a failed navigation advances nothing', t => {
	// This is what stops a blank page being captured and recorded as if it
	// were the site.
	t.is(advanceStage('unloaded', {...navigated, succeeded: false}), 'unloaded');
});

test('a failed capture advances nothing', t => {
	t.is(advanceStage('loaded', {...captured, succeeded: false}), 'loaded');
});

test('a successful navigation loads the page even when it returns nothing', t => {
	// Emptiness is only meaningful for the capture. Treating a terse
	// navigation success as a failure would strand the page one stage short,
	// with the capture tool never offered and the page ending as partial.
	t.is(advanceStage('unloaded', {...navigated, output: ''}), 'loaded');
});

test('an empty capture advances nothing', t => {
	// A capture that returns nothing is not a capture. Advancing here would
	// let the analysis judge a page whose structure was never read.
	t.is(advanceStage('loaded', {...captured, output: ''}), 'loaded');
});

test('a tool from the wrong stage advances nothing', t => {
	t.is(advanceStage('unloaded', captured), 'unloaded');
});

test('stages are one-way within a page', t => {
	// A later failure must not strand the analysis in an earlier stage, where
	// the tools it needs are no longer offered.
	const afterCapture = advanceStage('analysable', {
		...navigated,
		succeeded: false,
	});

	t.is(afterCapture, 'analysable');
});

test('every stage offers at least one tool', t => {
	// A stage offering nothing would stall the loop rather than end it.
	const stages: AnalysisStage[] = ['unloaded', 'loaded', 'analysable'];

	for (const stage of stages) {
		t.true(toolsForStage(stage).length > 0, `${stage} offers no tools`);
	}
});

test('each stage offers exactly the tools its contract names', t => {
	t.deepEqual(toolsForStage('unloaded'), [
		'navigate_page',
		'completePageAnalysis',
	]);
	t.deepEqual(toolsForStage('loaded'), [
		'take_snapshot',
		'completePageAnalysis',
	]);
	t.deepEqual(toolsForStage('analysable'), [
		'addFinding',
		'completePageAnalysis',
	]);
});

test('every stage can end the page', t => {
	// Completion is an exit rather than a step. Without it at every stage, a
	// page whose navigation failed could not be ended and the loop would run
	// its full iteration budget before giving up.
	for (const stage of ['unloaded', 'loaded', 'analysable'] as const) {
		t.true(toolsForStage(stage).includes('completePageAnalysis'));
	}
});

test('no stage offers a tool belonging to a later one', t => {
	// The sequence is enforced by what is available, so capture must not be
	// reachable before navigation has succeeded.
	t.false(toolsForStage('unloaded').includes('take_snapshot'));
	t.false(toolsForStage('unloaded').includes('addFinding'));
	t.false(toolsForStage('loaded').includes('addFinding'));
});

test('the echo tool is offered by no stage at all', t => {
	const everyTool = (['unloaded', 'loaded', 'analysable'] as const).flatMap(
		stage => toolsForStage(stage),
	);

	t.false(everyTool.includes('setPageSnapshot'));
});
