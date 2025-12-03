/**
 * Unit tests for LLM response types
 */

import test from 'ava';
import type {
	LLMResponseData,
	LLMToolCall,
} from '../../source/models/llm-response.js';

test('LLMResponseData can be created with text only', t => {
	const response: LLMResponseData = {
		text: 'Analyzing the page...',
		iteration: 1,
		timestamp: Date.now(),
	};

	t.is(response.text, 'Analyzing the page...');
	t.is(response.iteration, 1);
	t.truthy(response.timestamp);
	t.is(response.toolCalls, undefined);
});

test('LLMResponseData can be created with toolCalls only', t => {
	const toolCalls: LLMToolCall[] = [
		{
			toolName: 'browser_snapshot',
			args: {},
		},
	];

	const response: LLMResponseData = {
		toolCalls,
		iteration: 2,
		timestamp: Date.now(),
	};

	t.deepEqual(response.toolCalls, toolCalls);
	t.is(response.iteration, 2);
	t.is(response.text, undefined);
});

test('LLMResponseData can be created with both text and toolCalls', t => {
	const toolCalls: LLMToolCall[] = [
		{
			toolName: 'addFinding',
			args: {severity: 'high'},
		},
	];

	const response: LLMResponseData = {
		text: 'Found accessibility issues',
		toolCalls,
		finishReason: 'tool-calls',
		iteration: 3,
		timestamp: Date.now(),
	};

	t.is(response.text, 'Found accessibility issues');
	t.deepEqual(response.toolCalls, toolCalls);
	t.is(response.finishReason, 'tool-calls');
	t.is(response.iteration, 3);
	t.truthy(response.timestamp);
});

test('LLMResponseData iteration must be positive integer', t => {
	const response: LLMResponseData = {
		text: 'Test',
		iteration: 1,
		timestamp: Date.now(),
	};

	t.true(response.iteration > 0);
	t.is(typeof response.iteration, 'number');
});

test('LLMResponseData timestamp must be valid number', t => {
	const timestamp = Date.now();
	const response: LLMResponseData = {
		text: 'Test',
		iteration: 1,
		timestamp,
	};

	t.truthy(response.timestamp);
	t.is(typeof response.timestamp, 'number');
	t.true(response.timestamp > 0);
});

test('LLMToolCall requires toolName and args', t => {
	const toolCall: LLMToolCall = {
		toolName: 'browser_navigate',
		args: {url: 'https://example.com'},
	};

	t.is(toolCall.toolName, 'browser_navigate');
	t.deepEqual(toolCall.args, {url: 'https://example.com'});
});

test('truncateText function with short text (no truncation)', async t => {
	const {truncateText} = await import('../../source/models/llm-response.js');
	const shortText = 'Short text';
	const result = truncateText(shortText, 200);

	t.is(result, shortText);
	t.false(result.includes('...'));
});

test('truncateText function with long text (200+ chars)', async t => {
	const {truncateText} = await import('../../source/models/llm-response.js');
	const longText = 'A'.repeat(250);
	const result = truncateText(longText, 200);

	t.is(result.length, 203); // 200 + '...'
	t.true(result.endsWith('...'));
	t.is(result.slice(0, 200), 'A'.repeat(200));
});

test('truncation adds "..." indicator', async t => {
	const {truncateText} = await import('../../source/models/llm-response.js');
	const text = 'A'.repeat(100);
	const result = truncateText(text, 50);

	t.true(result.endsWith('...'));
	t.is(result.length, 53); // 50 + '...'
});
