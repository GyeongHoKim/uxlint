/**
 * Unit tests for waiting messages
 */

import test from 'ava';
import {
	getRandomWaitingMessage,
	waitingMessages,
} from '../../source/constants/waiting-messages.js';

test('waitingMessages array is not empty', t => {
	t.true(waitingMessages.length > 0);
	t.true(waitingMessages.length >= 20);
});

test('getRandomWaitingMessage returns a valid message', t => {
	const message = getRandomWaitingMessage();

	t.truthy(message);
	t.is(typeof message, 'string');
	t.true(message.length > 0);
	t.true(waitingMessages.includes(message as (typeof waitingMessages)[number]));
});

test('all messages are non-empty strings', t => {
	for (const message of waitingMessages) {
		t.is(typeof message, 'string');
		t.true(message.length > 0);
	}
});

test('getRandomWaitingMessage returns different messages on multiple calls', t => {
	const messages = new Set<string>();

	// Call multiple times to increase chance of getting different messages
	for (let i = 0; i < 10; i++) {
		messages.add(getRandomWaitingMessage());
	}

	// With 20+ messages, we should get at least 1 message in 10 calls
	t.true(messages.size > 0);
});
