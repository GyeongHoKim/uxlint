import test from 'ava';
import {createActor} from 'xstate';
import {uxlintMachine} from '../../source/models/uxlint-machine.js';

test('machine has idle as initial state definition', t => {
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

test('isInteractive guard returns true when interactive=true', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: false},
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {tty: 'wizard'});
});

test('isInteractive guard returns false when interactive=false', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: false, configExists: true},
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {ci: 'analyzeWithoutUI'});
});

test('hasConfig guard returns true when configExists=true in TTY mode', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: true},
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {tty: 'analyzeWithUI'});
});

test('hasConfig guard returns false when configExists=false in TTY mode', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: false},
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {tty: 'wizard'});
});

test('hasConfig guard returns true when configExists=true in CI mode', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: false, configExists: true},
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {ci: 'analyzeWithoutUI'});
});

test('noConfig guard returns true when configExists=false in CI mode', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: false, configExists: false},
	});
	actor.start();
	t.is(actor.getSnapshot().value, 'done');
	t.truthy(actor.getSnapshot().context.error);
});

test('tty.wizard transitions to tty.analyzeWithUI on WIZARD_COMPLETE', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: false},
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
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: false},
	});
	actor.start();
	actor.send({type: 'WIZARD_CANCEL'});
	t.is(actor.getSnapshot().value, 'done');
	t.is(actor.getSnapshot().context.exitCode, 0);
});

test('tty.analyzeWithUI transitions to reportBuilder on ANALYSIS_COMPLETE', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: true},
	});
	actor.start();
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: {pages: [], summary: 'test', recommendations: []},
	});
	t.is(actor.getSnapshot().value, 'reportBuilder');
});

test('tty.analyzeWithUI transitions to done on ANALYSIS_ERROR', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: true},
	});
	actor.start();
	actor.send({type: 'ANALYSIS_ERROR', error: new Error('Analysis failed')});
	t.is(actor.getSnapshot().value, 'done');
	t.is(actor.getSnapshot().context.exitCode, 1);
});

test('ci.analyzeWithoutUI transitions to reportBuilder on ANALYSIS_COMPLETE', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: false, configExists: true},
	});
	actor.start();
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: {pages: [], summary: 'test', recommendations: []},
	});
	t.is(actor.getSnapshot().value, 'reportBuilder');
});

test('ci.error state transitions to done with MissingConfigError', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: false, configExists: false},
	});
	actor.start();
	t.is(actor.getSnapshot().value, 'done');
	t.truthy(actor.getSnapshot().context.error);
	t.true(
		actor
			.getSnapshot()
			.context.error?.message.includes('Configuration file not found'),
	);
	t.is(actor.getSnapshot().context.exitCode, 1);
});

test('reportBuilder transitions to done on REPORT_COMPLETE', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: true},
	});
	actor.start();
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: {pages: [], summary: 'test', recommendations: []},
	});
	actor.send({type: 'REPORT_COMPLETE'});
	t.is(actor.getSnapshot().value, 'done');
	t.is(actor.getSnapshot().context.exitCode, 0);
});

test('reportBuilder transitions to done on REPORT_ERROR', t => {
	const actor = createActor(uxlintMachine, {
		input: {interactive: true, configExists: true},
	});
	actor.start();
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: {pages: [], summary: 'test', recommendations: []},
	});
	actor.send({type: 'REPORT_ERROR', error: new Error('Report failed')});
	t.is(actor.getSnapshot().value, 'done');
	t.is(actor.getSnapshot().context.exitCode, 1);
});
