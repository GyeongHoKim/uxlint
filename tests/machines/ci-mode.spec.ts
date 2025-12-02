import test from 'ava';
import {createActor} from 'xstate';
import {uxlintMachine} from '../../dist/machines/uxlint-machine.js';
import {MissingConfigError} from '../../dist/models/errors.js';

// =============================================================================
// CI Mode Tests (--interactive flag NOT present)
// =============================================================================

test('CI mode with config: transitions to ci.analyzeWithoutUI', t => {
	const actor = createActor(uxlintMachine, {
		input: {
			interactive: false, // No --interactive flag
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

	// Should transition from idle → ci → ci.analyzeWithoutUI
	t.deepEqual(actor.getSnapshot().value, {ci: 'analyzeWithoutUI'});
});

test('CI mode without config: transitions to ci.error with MissingConfigError', t => {
	const actor = createActor(uxlintMachine, {
		input: {
			interactive: false, // No --interactive flag
			configExists: false, // No config file
		},
	});

	actor.start();

	// Should transition from idle → ci → ci.error
	t.deepEqual(actor.getSnapshot().value, {ci: 'error'});

	// Should have MissingConfigError in context
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

	// Send analysis complete event
	actor.send({
		type: 'ANALYSIS_COMPLETE',
		result: {
			pages: [],
			summary: 'Test summary',
			recommendations: [],
		},
	});

	t.is(actor.getSnapshot().value, 'reportBuilder');
});

test('CI mode with config: ANALYSIS_ERROR transitions to done with exitCode 1', t => {
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

	// Send analysis error event
	const testError = new Error('Analysis failed');
	actor.send({type: 'ANALYSIS_ERROR', error: testError});

	t.is(actor.getSnapshot().value, 'done');
	t.is(actor.getSnapshot().context.exitCode, 1);
	t.is(actor.getSnapshot().context.error, testError);
});
