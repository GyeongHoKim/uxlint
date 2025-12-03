/**
 * Visual regression tests for AnalysisProgress component
 */

import test from 'ava';
import {render} from 'ink-testing-library';
import {AnalysisProgress} from '../../source/components/analysis-progress.js';
import {defaultTheme} from '../../source/models/theme.js';
import type {LLMResponseData} from '../../source/models/llm-response.js';

test('renders lastLLMResponse when provided', t => {
	const llmResponse: LLMResponseData = {
		text: 'Analyzing navigation menu...',
		iteration: 1,
		timestamp: Date.now(),
	};

	const {lastFrame, unmount} = render(
		<AnalysisProgress
			theme={defaultTheme}
			stage="analyzing"
			currentPage={1}
			totalPages={3}
			lastLLMResponse={llmResponse}
		/>,
	);

	const output = lastFrame();
	unmount();
	t.truthy(output);
	t.true(output?.includes('Analyzing navigation menu'));
	t.true(output?.includes('Iteration 1'));
	t.true(output?.includes('Page 1/3'));
});

test('renders LLMResponseDisplay component integration', t => {
	const llmResponse: LLMResponseData = {
		text: 'Test response',
		toolCalls: [
			{
				toolName: 'browser_snapshot',
				args: {},
			},
		],
		iteration: 2,
		timestamp: Date.now(),
	};

	const {lastFrame, unmount} = render(
		<AnalysisProgress
			theme={defaultTheme}
			stage="analyzing"
			currentPage={1}
			totalPages={1}
			lastLLMResponse={llmResponse}
		/>,
	);

	const output = lastFrame();
	unmount();
	t.truthy(output);
	t.true(output?.includes('Test response'));
	t.true(output?.includes('browser_snapshot'));
});

test('renders nothing for non-analyzing stages without error', t => {
	const {lastFrame, unmount} = render(
		<AnalysisProgress
			theme={defaultTheme}
			stage="navigating"
			currentPage={1}
			totalPages={3}
			pageUrl="https://example.com"
		/>,
	);

	const output = lastFrame();
	unmount();
	// Component renders nothing (empty string) when stage is not analyzing and no error
	t.is(output, '');
	// Should not show stage indicator, page progress, or URL (removed features)
	t.false(output?.includes('Navigating to page'));
	t.false(output?.includes('Page 1/3'));
	t.false(output?.includes('https://example.com'));
});

test('does not render LLMResponseDisplay when stage is not analyzing', t => {
	const llmResponse: LLMResponseData = {
		text: 'Should not appear',
		iteration: 1,
		timestamp: Date.now(),
	};

	const {lastFrame, unmount} = render(
		<AnalysisProgress
			theme={defaultTheme}
			stage="complete"
			currentPage={1}
			totalPages={1}
			lastLLMResponse={llmResponse}
		/>,
	);

	const output = lastFrame();
	unmount();
	// Component renders nothing (empty string) when stage is not analyzing
	t.is(output, '');
	t.false(output?.includes('Should not appear'));
	// Stage indicator is no longer displayed
	t.false(output?.includes('Analysis complete'));
});

test('waiting message displays with spinner when isWaitingForLLM is true', t => {
	const {lastFrame, unmount} = render(
		<AnalysisProgress
			isWaitingForLLM
			theme={defaultTheme}
			stage="analyzing"
			currentPage={1}
			totalPages={3}
			waitingMessage="🤔 AI is pondering the mysteries of your UI..."
		/>,
	);

	const output = lastFrame();
	unmount();
	t.truthy(output);
	// Should show waiting message
	t.true(output?.includes('AI is pondering'));
	// Should show spinner (dots animation starts with braille char)
	t.regex(output ?? '', /⠋|⠙|⠚|⠞|⠖|⠦|⠴|⠲|⠳|⠓/u);
});

test('waiting message has distinct styling from LLM response', t => {
	const llmResponse: LLMResponseData = {
		text: 'Previous response',
		iteration: 1,
		timestamp: Date.now(),
	};

	const {lastFrame, unmount} = render(
		<AnalysisProgress
			isWaitingForLLM
			theme={defaultTheme}
			stage="analyzing"
			currentPage={1}
			totalPages={1}
			lastLLMResponse={llmResponse}
			waitingMessage="🔍 Examining every pixel with care..."
		/>,
	);

	const output = lastFrame();
	unmount();
	t.truthy(output);
	// Should show both waiting message and last LLM response
	t.true(output?.includes('Previous response'));
	t.true(output?.includes('Examining every pixel'));
});

test('iteration number increases within same page but resets when page changes', t => {
	// This test verifies that AnalysisProgress component correctly displays
	// iteration numbers that increase within the same page and reset when page changes.
	// If there's a bug where iteration doesn't update, this test would fail.

	// First page, first iteration
	const firstIteration: LLMResponseData = {
		text: 'First iteration response',
		iteration: 1,
		timestamp: Date.now(),
	};

	const {
		lastFrame: firstFrame,
		rerender,
		unmount,
	} = render(
		<AnalysisProgress
			theme={defaultTheme}
			stage="analyzing"
			currentPage={1}
			totalPages={2}
			pageUrl="https://example.com/page1"
			lastLLMResponse={firstIteration}
		/>,
	);

	let output = firstFrame();
	t.truthy(output);
	// Page info is now shown in LLMResponseDisplay header
	t.true(output?.includes('Page 1/2'));
	t.true(output?.includes('Iteration 1'));
	t.true(output?.includes('https://example.com/page1'));

	// First page, second iteration (iteration should increase)
	const secondIteration: LLMResponseData = {
		text: 'Second iteration response',
		iteration: 2,
		timestamp: Date.now(),
	};

	rerender(
		<AnalysisProgress
			theme={defaultTheme}
			stage="analyzing"
			currentPage={1}
			totalPages={2}
			pageUrl="https://example.com/page1"
			lastLLMResponse={secondIteration}
		/>,
	);

	output = firstFrame();
	t.truthy(output);
	// Page should still be 1/2 (shown in LLMResponseDisplay header)
	t.true(output?.includes('Page 1/2'));
	// Iteration should increase to 2
	t.true(
		output?.includes('Iteration 2'),
		'Iteration should increase to 2 within the same page',
	);

	// Second page, first iteration (iteration should reset to 1)
	const thirdIteration: LLMResponseData = {
		text: 'Third iteration response',
		iteration: 1,
		timestamp: Date.now(),
	};

	rerender(
		<AnalysisProgress
			theme={defaultTheme}
			stage="analyzing"
			currentPage={2}
			totalPages={2}
			pageUrl="https://example.com/page2"
			lastLLMResponse={thirdIteration}
		/>,
	);

	output = firstFrame();
	t.truthy(output);
	// Page should increase to 2/2 (shown in LLMResponseDisplay header)
	t.true(output?.includes('Page 2/2'));
	// URL should change to page2
	t.true(output?.includes('https://example.com/page2'));
	// Iteration should reset to 1 for new page
	t.true(
		output?.includes('Iteration 1'),
		'Iteration should reset to 1 when moving to a new page',
	);

	unmount();
});

test('renders error message when stage is error', t => {
	const {lastFrame, unmount} = render(
		<AnalysisProgress
			theme={defaultTheme}
			stage="error"
			currentPage={1}
			totalPages={1}
			error="Failed to load page"
		/>,
	);

	const output = lastFrame();
	unmount();
	t.truthy(output);
	t.true(output?.includes('Failed to load page'));
});

test('does not render error message when error prop is not provided', t => {
	const {lastFrame, unmount} = render(
		<AnalysisProgress
			theme={defaultTheme}
			stage="error"
			currentPage={1}
			totalPages={1}
		/>,
	);

	const output = lastFrame();
	unmount();
	// Component renders nothing (empty string) when error prop is missing
	t.is(output, '');
	// Should not show error message when error prop is missing
	t.false(output?.includes('Error occurred'));
});
