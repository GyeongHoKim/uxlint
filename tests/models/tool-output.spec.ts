import test from 'ava';
import {readToolOutcome} from '../../source/models/tool-output.js';

test('a plain string is read as successful text', t => {
	t.deepEqual(readToolOutcome('button "Sign up"'), {
		text: 'button "Sign up"',
		failed: false,
	});
});

test('the adapter result shape is unwrapped to its text', t => {
	// This is what an MCP-adapted tool actually returns: the server's
	// CallToolResult, passed through unchanged rather than reduced to a string.
	t.deepEqual(
		readToolOutcome({
			content: [{type: 'text', text: 'link "Home"'}],
			isError: false,
		}),
		{text: 'link "Home"', failed: false},
	);
});

test('multiple content parts are joined', t => {
	t.is(
		readToolOutcome({
			content: [
				{type: 'text', text: 'first'},
				{type: 'text', text: ' second'},
			],
		}).text,
		'first second',
	);
});

test('a result carrying isError is a failure even though it returned', t => {
	// The browser server reports a missing browser this way rather than by
	// throwing, so a returned result is not evidence of success.
	const outcome = readToolOutcome({
		content: [{type: 'text', text: 'Could not find Google Chrome'}],
		isError: true,
	});

	t.true(outcome.failed);
	t.is(outcome.text, 'Could not find Google Chrome');
});

test('an error reported by the SDK is a failure whatever the output says', t => {
	t.true(readToolOutcome('looks fine', true).failed);
});

test('a non-text content part contributes nothing rather than breaking', t => {
	t.is(
		readToolOutcome({
			content: [
				{type: 'image', data: 'x'},
				{type: 'text', text: 'kept'},
			],
		}).text,
		'kept',
	);
});

test('an unreadable output is treated as a failure', t => {
	t.true(readToolOutcome(undefined).failed);
	t.true(readToolOutcome(42).failed);
});
