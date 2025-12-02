import test from 'ava';
import {createActor} from 'xstate';
import {uxlintMachine} from '../../dist/machines/uxlint-machine.js';

// =============================================================================
// T007: Tests for XState machine initial state
// =============================================================================

test('machine has idle as initial state definition', t => {
	// Note: XState v5 executes 'always' transitions during initialization,
	// so we verify the machine definition instead of runtime state
	t.is(uxlintMachine.config.initial, 'idle');
});

test('machine context is initialized from input', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: true},
	});

	const snapshot = actor.getSnapshot();
	t.is(snapshot.context.interactive, true);
	t.is(snapshot.context.configExists, true);
	t.is(snapshot.context.exitCode, 0);
});

// =============================================================================
// T008: Tests for guard functions (isInteractive, hasConfig)
// =============================================================================

test('isInteractive guard returns true when interactive=true', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: false},
	});
	actor.start();

	// Should transition to 'tty' state when interactive is true
	const snapshot = actor.getSnapshot();
	t.deepEqual(snapshot.value, {tty: 'wizard'});
});

test('isInteractive guard returns false when interactive=false', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: false, configExists: true},
	});
	actor.start();

	// Should transition to 'ci' state when interactive is false
	const snapshot = actor.getSnapshot();
	t.deepEqual(snapshot.value, {ci: 'analyzeWithoutUI'});
});

test('hasConfig guard returns true when configExists=true in TTY mode', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: true},
	});
	actor.start();

	// Should skip wizard and go directly to analyzeWithUI
	const snapshot = actor.getSnapshot();
	t.deepEqual(snapshot.value, {tty: 'analyzeWithUI'});
});

test('hasConfig guard returns false when configExists=false in TTY mode', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: false},
	});
	actor.start();

	// Should go to wizard
	const snapshot = actor.getSnapshot();
	t.deepEqual(snapshot.value, {tty: 'wizard'});
});

test('hasConfig guard returns true when configExists=true in CI mode', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: false, configExists: true},
	});
	actor.start();

	// Should go to analyzeWithoutUI
	const snapshot = actor.getSnapshot();
	t.deepEqual(snapshot.value, {ci: 'analyzeWithoutUI'});
});

test('noConfig guard returns true when configExists=false in CI mode', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: false, configExists: false},
	});
	actor.start();

	// Should go to error state
	const snapshot = actor.getSnapshot();
	t.deepEqual(snapshot.value, {ci: 'error'});
});

// =============================================================================
// Additional tests for state transitions (US1-US4)
// =============================================================================

// US1: tty.wizard → tty.analyzeWithUI on WIZARD_COMPLETE
test('tty.wizard transitions to tty.analyzeWithUI on WIZARD_COMPLETE', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: false},
	});
	actor.start();

	// Should be in wizard state
	t.deepEqual(actor.getSnapshot().value, {tty: 'wizard'});

	// Send WIZARD_COMPLETE event
	actor.send({
		type: 'WIZARD_COMPLETE',
		config: {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'test features'}],
			persona: 'test persona',
			report: {output: './report.md'},
		},
	});

	// Should transition to analyzeWithUI
	t.deepEqual(actor.getSnapshot().value, {tty: 'analyzeWithUI'});
});

// US1: tty.wizard → done on WIZARD_CANCEL
test('tty.wizard transitions to done on WIZARD_CANCEL', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: false},
	});
	actor.start();

	// Should be in wizard state
	t.deepEqual(actor.getSnapshot().value, {tty: 'wizard'});

	// Send WIZARD_CANCEL event
	actor.send({type: 'WIZARD_CANCEL'});

	// Should transition to done with exitCode 0
	t.is(actor.getSnapshot().value, 'done');
	t.is(actor.getSnapshot().context.exitCode, 0);
});

// US2: tty.analyzeWithUI → reportBuilder on ANALYSIS_COMPLETE
test('tty.analyzeWithUI transitions to reportBuilder on ANALYSIS_COMPLETE', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: true},
	});
	actor.start();

	// Should be in analyzeWithUI state
	t.deepEqual(actor.getSnapshot().value, {tty: 'analyzeWithUI'});

	// Send ANALYSIS_COMPLETE event
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: {pages: [], summary: 'test', recommendations: []},
	});

	// Should transition to reportBuilder
	t.is(actor.getSnapshot().value, 'reportBuilder');
});

// US2: tty.analyzeWithUI → done on ANALYSIS_ERROR
test('tty.analyzeWithUI transitions to done on ANALYSIS_ERROR', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: true},
	});
	actor.start();

	// Should be in analyzeWithUI state
	t.deepEqual(actor.getSnapshot().value, {tty: 'analyzeWithUI'});

	// Send ANALYSIS_ERROR event
	actor.send({
		type: 'ANALYSIS_ERROR',
		error: new Error('Analysis failed'),
	});

	// Should transition to done with exitCode 1
	t.is(actor.getSnapshot().value, 'done');
	t.is(actor.getSnapshot().context.exitCode, 1);
});

// US3: ci.analyzeWithoutUI → reportBuilder on ANALYSIS_COMPLETE
test('ci.analyzeWithoutUI transitions to reportBuilder on ANALYSIS_COMPLETE', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: false, configExists: true},
	});
	actor.start();

	// Should be in analyzeWithoutUI state
	t.deepEqual(actor.getSnapshot().value, {ci: 'analyzeWithoutUI'});

	// Send ANALYSIS_COMPLETE event
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: {pages: [], summary: 'test', recommendations: []},
	});

	// Should transition to reportBuilder
	t.is(actor.getSnapshot().value, 'reportBuilder');
});

// US4: ci.error transitions to done automatically
test('ci.error state has MissingConfigError in context', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: false, configExists: false},
	});
	actor.start();

	// Should be in error state
	t.deepEqual(actor.getSnapshot().value, {ci: 'error'});

	// Should have error in context
	const {error} = actor.getSnapshot().context;
	t.truthy(error);
	t.true(error?.message.includes('Configuration file not found'));
});

// ReportBuilder → done on REPORT_COMPLETE
test('reportBuilder transitions to done on REPORT_COMPLETE', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: true},
	});
	actor.start();

	// Transition to reportBuilder
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: {pages: [], summary: 'test', recommendations: []},
	});
	t.is(actor.getSnapshot().value, 'reportBuilder');

	// Send REPORT_COMPLETE event
	actor.send({type: 'REPORT_COMPLETE'});

	// Should transition to done with exitCode 0
	t.is(actor.getSnapshot().value, 'done');
	t.is(actor.getSnapshot().context.exitCode, 0);
});

// ReportBuilder → done on REPORT_ERROR
test('reportBuilder transitions to done on REPORT_ERROR', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: true},
	});
	actor.start();

	// Transition to reportBuilder
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: {pages: [], summary: 'test', recommendations: []},
	});
	t.is(actor.getSnapshot().value, 'reportBuilder');

	// Send REPORT_ERROR event
	actor.send({
		type: 'REPORT_ERROR',
		error: new Error('Report failed'),
	});

	// Should transition to done with exitCode 1
	t.is(actor.getSnapshot().value, 'done');
	t.is(actor.getSnapshot().context.exitCode, 1);
});
