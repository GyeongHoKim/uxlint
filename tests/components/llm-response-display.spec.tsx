/**
 * Visual regression tests for LLMResponseDisplay component
 */

import test from 'ava';
import {render} from 'ink-testing-library';
import {LLMResponseDisplay} from '../../source/components/llm-response-display.js';
import type {LLMResponseData} from '../../source/models/llm-response.js';

test('renders LLM text response correctly', t => {
	const response: LLMResponseData = {
		text: 'Analyzing the page for accessibility issues...',
		iteration: 1,
		timestamp: Date.now(),
	};

	const {lastFrame} = render(<LLMResponseDisplay response={response} />);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Analyzing the page'));
	t.true(output?.includes('Iteration 1'));
});

test('renders tool calls list correctly', t => {
	const response: LLMResponseData = {
		toolCalls: [
			{
				toolName: 'browser_snapshot',
				args: {},
			},
			{
				toolName: 'addFinding',
				args: {severity: 'high'},
			},
		],
		iteration: 2,
		timestamp: Date.now(),
	};

	const {lastFrame} = render(<LLMResponseDisplay response={response} />);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('browser_snapshot'));
	t.true(output?.includes('addFinding'));
});

test('renders iteration number', t => {
	const response: LLMResponseData = {
		text: 'Test',
		iteration: 5,
		timestamp: Date.now(),
	};

	const {lastFrame} = render(<LLMResponseDisplay response={response} />);

	const output = lastFrame();
	t.truthy(output);
	t.true(output?.includes('Iteration 5'));
});

test('renders empty state when no response data', t => {
	const response: LLMResponseData = {
		iteration: 1,
		timestamp: Date.now(),
	};

	const {lastFrame} = render(<LLMResponseDisplay response={response} />);

	const output = lastFrame();
	t.truthy(output);
	// Should still show iteration header
	t.true(output?.includes('Iteration'));
});

test('text response has distinct styling with cyan color and emoji prefix', t => {
	const response: LLMResponseData = {
		text: 'Analyzing navigation structure...',
		iteration: 1,
		timestamp: Date.now(),
	};

	const {lastFrame} = render(<LLMResponseDisplay response={response} />);

	const output = lastFrame();
	t.truthy(output);
	// Should have emoji prefix for text
	t.true(output?.includes('📝'));
	// Should include iteration header with cyan styling
	t.true(output?.includes('LLM Response'));
});

test('tool calls have distinct styling with yellow color and bullet points', t => {
	const response: LLMResponseData = {
		toolCalls: [
			{
				toolName: 'browser_snapshot',
				args: {},
			},
			{
				toolName: 'addFinding',
				args: {severity: 'high'},
			},
		],
		iteration: 2,
		timestamp: Date.now(),
	};

	const {lastFrame} = render(<LLMResponseDisplay response={response} />);

	const output = lastFrame();
	t.truthy(output);
	// Should have emoji prefix for tool calls
	t.true(output?.includes('🔧'));
	// Should have bullet points for tool call items
	t.true(output?.includes('•'));
	t.true(output?.includes('browser_snapshot'));
	t.true(output?.includes('addFinding'));
});

test('finishReason is indicated visually when present', t => {
	const response: LLMResponseData = {
		text: 'Analysis complete',
		finishReason: 'stop',
		iteration: 3,
		timestamp: Date.now(),
	};

	const {lastFrame} = render(<LLMResponseDisplay response={response} />);

	const output = lastFrame();
	t.truthy(output);
	// Should display the response text
	t.true(output?.includes('Analysis complete'));
});

test('long text is truncated with "..." indicator', t => {
	const longText = 'A'.repeat(250);
	const response: LLMResponseData = {
		text: longText,
		iteration: 1,
		timestamp: Date.now(),
	};

	const {lastFrame} = render(
		<LLMResponseDisplay response={response} maxTextLength={200} />,
	);

	const output = lastFrame();
	t.truthy(output);
	// Should be truncated
	t.true(output?.includes('...'));
	// Should not contain the full text
	t.false(output?.includes('A'.repeat(250)));
});

test('many tool calls (6+) shows "+N more..." indicator', t => {
	const response: LLMResponseData = {
		toolCalls: Array.from({length: 8}, (_, i) => ({
			toolName: `tool_${i}`,
			args: {},
		})),
		iteration: 1,
		timestamp: Date.now(),
	};

	const {lastFrame} = render(
		<LLMResponseDisplay response={response} maxToolCalls={5} />,
	);

	const output = lastFrame();
	t.truthy(output);
	// Should show first 5 tool calls
	t.true(output?.includes('tool_0'));
	t.true(output?.includes('tool_4'));
	// Should show "+N more..." indicator
	t.true(output?.includes('more'));
});

test('display adapts to content without breaking layout', t => {
	const response: LLMResponseData = {
		text: 'Short text',
		toolCalls: [
			{
				toolName: 'tool1',
				args: {},
			},
		],
		iteration: 1,
		timestamp: Date.now(),
	};

	const {lastFrame} = render(<LLMResponseDisplay response={response} />);

	const output = lastFrame();
	t.truthy(output);
	// Should render without errors
	t.truthy(output);
	t.true(output?.includes('Short text'));
	t.true(output?.includes('tool1'));
});
