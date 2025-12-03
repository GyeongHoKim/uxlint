import test from 'ava';
import {createActor, type ActorRefFrom} from 'xstate';
import {MissingConfigError} from '../../source/models/errors.js';
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

const createMockReport = (): UxReport => ({
	metadata: {
		timestamp: 0,
		analyzedPages: [],
		failedPages: [],
		totalFindings: 0,
		persona: 'test persona',
	},
	pages: [],
	summary: 'Test summary',
	prioritizedFindings: [],
});

test('CI mode with config: transitions to ci.analyzeWithoutUI', t => {
	const actor = createUxlintActor({
		interactive: false,
		configExists: true,
		config: {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'test'}],
			persona: 'test persona',
			report: {output: './report.md'},
		},
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {ci: 'analyzeWithoutUI'});
});

test('CI mode without config: transitions to done with MissingConfigError', t => {
	const actor = createUxlintActor({
		interactive: false,
		configExists: false,
	});
	actor.start();
	t.is(actor.getSnapshot().value, 'done');

	const {error} = getContext(actor);
	t.truthy(error);
	t.true(error instanceof MissingConfigError);
	t.true(error?.message.includes('Configuration file not found'));
});

test('CI mode error: exitCode should be 1', t => {
	const actor = createUxlintActor({
		interactive: false,
		configExists: false,
	});
	actor.start();
	const snapshot = actor.getSnapshot();
	t.is(snapshot.value, 'done');
	t.is(getContext(actor).exitCode, 1);
});

test('CI mode with config: ANALYSIS_COMPLETE transitions to reportBuilder', t => {
	const actor = createUxlintActor({
		interactive: false,
		configExists: true,
		config: {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'test'}],
			persona: 'test persona',
			report: {output: './report.md'},
		},
	});
	actor.start();
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: createMockReport(),
	});
	t.is(actor.getSnapshot().value, 'reportBuilder');
});

test('CI mode with config: ANALYSIS_ERROR transitions to done', t => {
	const actor = createUxlintActor({
		interactive: false,
		configExists: true,
		config: {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'test'}],
			persona: 'test persona',
			report: {output: './report.md'},
		},
	});
	actor.start();

	const testError = new Error('Analysis failed');
	actor.send({type: 'ANALYSIS_ERROR', error: testError});

	const snapshot = actor.getSnapshot();
	t.is(snapshot.value, 'done');
	const context = getContext(actor);
	t.is(context.exitCode, 1);
	t.is(context.error, testError);
});
