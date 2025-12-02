import test from 'ava';
import {createActor} from 'xstate';
import {MissingConfigError} from '../../source/models/errors.js';
import {uxlintMachine} from '../../source/models/uxlint-machine.js';

test('CI mode with config: transitions to ci.analyzeWithoutUI', t => {
	const actor = createActor(uxlintMachine, {
		input: {
			interactive: false,
			configExists: true,
			config: {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [{url: 'https://example.com', features: 'test'}],
				persona: 'test persona',
				report: {output: './report.md'},
			},
		},
	});
	actor.start();
	t.deepEqual(actor.getSnapshot().value, {ci: 'analyzeWithoutUI'});
});

test('CI mode without config: transitions to done with MissingConfigError', t => {
	const actor = createActor(uxlintMachine, {
		input: {
			interactive: false,
			configExists: false,
		},
	});
	actor.start();
	t.is(actor.getSnapshot().value, 'done');

	const {error} = actor.getSnapshot().context;
	t.truthy(error);
	t.true(error instanceof MissingConfigError);
	t.true(error?.message.includes('Configuration file not found'));
});

test('CI mode error: exitCode should be 1', t => {
	const actor = createActor(uxlintMachine, {
		input: {
			interactive: false,
			configExists: false,
		},
	});
	actor.start();
	t.is(actor.getSnapshot().value, 'done');
	t.is(actor.getSnapshot().context.exitCode, 1);
});

test('CI mode with config: ANALYSIS_COMPLETE transitions to reportBuilder', t => {
	const actor = createActor(uxlintMachine, {
		input: {
			interactive: false,
			configExists: true,
			config: {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [{url: 'https://example.com', features: 'test'}],
				persona: 'test persona',
				report: {output: './report.md'},
			},
		},
	});
	actor.start();
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: {pages: [], summary: 'Test summary', recommendations: []},
	});
	t.is(actor.getSnapshot().value, 'reportBuilder');
});

test('CI mode with config: ANALYSIS_ERROR transitions to done', t => {
	const actor = createActor(uxlintMachine, {
		input: {
			interactive: false,
			configExists: true,
			config: {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [{url: 'https://example.com', features: 'test'}],
				persona: 'test persona',
				report: {output: './report.md'},
			},
		},
	});
	actor.start();

	const testError = new Error('Analysis failed');
	actor.send({type: 'ANALYSIS_ERROR', error: testError});

	t.is(actor.getSnapshot().value, 'done');
	t.is(actor.getSnapshot().context.exitCode, 1);
	t.is(actor.getSnapshot().context.error, testError);
});
