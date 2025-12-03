import test from 'ava';
import {createActor, type ActorRefFrom} from 'xstate';
import {
	uxlintMachine,
	type UxlintMachineContext,
	type UxlintMachineInput,
} from '../../source/models/uxlint-machine.js';
import type {UxReport} from '../../source/models/analysis.js';

type UxlintActor = ActorRefFrom<typeof uxlintMachine>;

const createUxlintActor = (input: UxlintMachineInput): UxlintActor =>
	createActor(uxlintMachine, {input});

const getContext = (actor: UxlintActor): UxlintMachineContext =>
	actor.getSnapshot().context;

const createMockReport = (summary = 'test summary'): UxReport => ({
	metadata: {
		timestamp: 0,
		analyzedPages: [],
		failedPages: [],
		totalFindings: 0,
		persona: 'test persona',
	},
	pages: [],
	summary,
	prioritizedFindings: [],
});

test('machine has idle as initial state definition', t => {
	t.is(uxlintMachine.config.initial, 'idle');
});

test('machine context is initialized from input', t => {
	const actor = createUxlintActor({
		interactive: true,
		configExists: true,
	});
	const context = getContext(actor);
	t.is(context.interactive, true);
	t.is(context.configExists, true);
	t.is(context.exitCode, 0);
});

test('isInteractive guard returns true when interactive=true', t => {
	const actor = createUxlintActor({
		interactive: true,
		configExists: false,
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {tty: 'wizard'});
});

test('isInteractive guard returns false when interactive=false', t => {
	const actor = createUxlintActor({
		interactive: false,
		configExists: true,
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {ci: 'analyzeWithoutUI'});
});

test('hasConfig guard returns true when configExists=true in TTY mode', t => {
	const actor = createUxlintActor({
		interactive: true,
		configExists: true,
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {tty: 'analyzeWithUI'});
});

test('hasConfig guard returns false when configExists=false in TTY mode', t => {
	const actor = createUxlintActor({
		interactive: true,
		configExists: false,
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {tty: 'wizard'});
});

test('hasConfig guard returns true when configExists=true in CI mode', t => {
	const actor = createUxlintActor({
		interactive: false,
		configExists: true,
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {ci: 'analyzeWithoutUI'});
});

test('noConfig guard returns true when configExists=false in CI mode', t => {
	const actor = createUxlintActor({
		interactive: false,
		configExists: false,
	});
	actor.start();
	t.is(actor.getSnapshot().value, 'done');
	const context = getContext(actor);
	t.truthy(context.error);
});

test('tty.wizard transitions to tty.analyzeWithUI on WIZARD_COMPLETE', t => {
	const actor = createUxlintActor({
		interactive: true,
		configExists: false,
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {tty: 'wizard'});
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
	t.deepEqual(actor.getSnapshot().value, {tty: 'analyzeWithUI'});
});

test('tty.wizard transitions to done on WIZARD_CANCEL', t => {
	const actor = createUxlintActor({
		interactive: true,
		configExists: false,
	});
	actor.start();
	actor.send({type: 'WIZARD_CANCEL'});
	t.is(actor.getSnapshot().value, 'done');
	const context = getContext(actor);
	t.is(context.exitCode, 0);
});

test('tty.analyzeWithUI transitions to reportBuilder on ANALYSIS_COMPLETE', t => {
	const actor = createUxlintActor({
		interactive: true,
		configExists: true,
	});
	actor.start();
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: createMockReport('test'),
	});
	t.is(actor.getSnapshot().value, 'reportBuilder');
});

test('tty.analyzeWithUI transitions to done on ANALYSIS_ERROR', t => {
	const actor = createUxlintActor({
		interactive: true,
		configExists: true,
	});
	actor.start();
	actor.send({type: 'ANALYSIS_ERROR', error: new Error('Analysis failed')});
	t.is(actor.getSnapshot().value, 'done');
	const context = getContext(actor);
	t.is(context.exitCode, 1);
});

test('ci.analyzeWithoutUI transitions to reportBuilder on ANALYSIS_COMPLETE', t => {
	const actor = createUxlintActor({
		interactive: false,
		configExists: true,
	});
	actor.start();
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: createMockReport('test'),
	});
	t.is(actor.getSnapshot().value, 'reportBuilder');
});

test('ci.error state transitions to done with MissingConfigError', t => {
	const actor = createUxlintActor({
		interactive: false,
		configExists: false,
	});
	actor.start();
	t.is(actor.getSnapshot().value, 'done');
	const context = getContext(actor);
	t.truthy(context.error);
	t.true(context.error?.message.includes('Configuration file not found'));
	t.is(context.exitCode, 1);
});

test('reportBuilder transitions to done on REPORT_COMPLETE', t => {
	const actor = createUxlintActor({
		interactive: true,
		configExists: true,
	});
	actor.start();
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: createMockReport('test'),
	});
	actor.send({type: 'REPORT_COMPLETE'});
	t.is(actor.getSnapshot().value, 'done');
	const context = getContext(actor);
	t.is(context.exitCode, 0);
});

test('reportBuilder transitions to done on REPORT_ERROR', t => {
	const actor = createUxlintActor({
		interactive: true,
		configExists: true,
	});
	actor.start();
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: createMockReport('test'),
	});
	actor.send({type: 'REPORT_ERROR', error: new Error('Report failed')});
	t.is(actor.getSnapshot().value, 'done');
	const context = getContext(actor);
	t.is(context.exitCode, 1);
});
