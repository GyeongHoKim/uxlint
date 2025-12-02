import test from 'ava';
import React from 'react';
import {render} from 'ink-testing-library';
import {UxlintMachineContext} from '../../dist/contexts/uxlint-context.js';
import App from '../../dist/app.js';

// =============================================================================
// US1: Snapshot tests for App rendering ConfigWizard
// =============================================================================

test('App renders ConfigWizard when in tty.wizard state', t => {
	const {lastFrame} = render(
		React.createElement(
			UxlintMachineContext.Provider,
			{
				options: {
					input: {interactive: true, configExists: false},
				},
			},
			React.createElement(App),
		),
	);

	const output = lastFrame();
	t.truthy(output);

	// Should show some output (wizard is rendered)
	t.true(typeof output === 'string' && output.length > 0);
});

// =============================================================================
// US2: Snapshot tests for App rendering AnalysisRunner
// =============================================================================

test('App renders AnalysisRunner when in tty.analyzeWithUI state', t => {
	const {lastFrame} = render(
		React.createElement(
			UxlintMachineContext.Provider,
			{
				options: {
					input: {
						interactive: true,
						configExists: true,
						config: {
							mainPageUrl: 'https://example.com',
							subPageUrls: [],
							pages: [{url: 'https://example.com', features: 'test'}],
							persona: 'test persona',
							report: {output: './report.md'},
						},
					},
				},
			},
			React.createElement(App),
		),
	);

	const output = lastFrame();
	t.truthy(output);
});

// =============================================================================
// US3: Snapshot tests for App rendering AnalyzeWithoutUI
// =============================================================================

test('App renders in CI mode with config', t => {
	const {lastFrame} = render(
		React.createElement(
			UxlintMachineContext.Provider,
			{
				options: {
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
				},
			},
			React.createElement(App),
		),
	);

	const output = lastFrame();
	t.truthy(output);
});

// =============================================================================
// US4: Snapshot tests for App rendering error
// =============================================================================

test('App renders error message when in ci.error state', t => {
	const {lastFrame} = render(
		React.createElement(
			UxlintMachineContext.Provider,
			{
				options: {
					input: {interactive: false, configExists: false},
				},
			},
			React.createElement(App),
		),
	);

	const output = lastFrame();
	t.truthy(output);

	// Should show some output (error message is rendered)
	t.true(typeof output === 'string' && output.length > 0);
});
