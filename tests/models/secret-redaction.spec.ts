/**
 * Unit tests for resolving a run's secrets and keeping them out of its output.
 *
 * A secret enters a run in one place, read from the environment by the name
 * the configuration gives it, and the redactor built from those values is
 * what every reply from the browser passes through. A live run showed that a
 * product can print a secret onto a page (research R1), so "it never reaches a
 * page" is not something the redactor may assume.
 */

import test from 'ava';
import type {SignInDescription} from '../../source/models/sign-in.js';
import {
	createRedactor,
	minimumSecretLength,
	redactedMarker,
	resolveSecrets,
} from '../../source/models/secret-redaction.js';

const description: SignInDescription = {
	url: 'https://app.example.com/login',
	steps: [
		{fill: 'Email', secret: 'QA_EMAIL'},
		{fill: 'Password', secret: 'QA_PASSWORD'},
		{click: 'Sign in'},
	],
	signedIn: {name: 'Sign out'},
};

// --- resolveSecrets ---------------------------------------------------------

test('every named secret is read from the environment', t => {
	const resolved = resolveSecrets(description, {
		QA_EMAIL: 'qa@example.com',
		QA_PASSWORD: 'correct horse battery',
		UNRELATED: 'ignored',
	});

	t.is(resolved.kind, 'resolved');
	if (resolved.kind === 'resolved') {
		t.deepEqual(
			[...resolved.values],
			[
				['QA_EMAIL', 'qa@example.com'],
				['QA_PASSWORD', 'correct horse battery'],
			],
		);
	}
});

test('a description that names no secret resolves to none', t => {
	const resolved = resolveSecrets(
		{...description, steps: [{fill: 'Email', value: 'a'}, {click: 'Go'}]},
		{},
	);

	t.is(resolved.kind, 'resolved');
	if (resolved.kind === 'resolved') {
		t.is(resolved.values.size, 0);
	}
});

test('every unset secret is listed, in the order the steps name them', t => {
	t.deepEqual(resolveSecrets(description, {}), {
		kind: 'missing',
		names: ['QA_EMAIL', 'QA_PASSWORD'],
	});
});

test('a secret named by two steps is listed once', t => {
	t.deepEqual(
		resolveSecrets(
			{
				...description,
				steps: [
					{fill: 'Password', secret: 'QA_PASSWORD'},
					{fill: 'Confirm password', secret: 'QA_PASSWORD'},
				],
			},
			{},
		),
		{kind: 'missing', names: ['QA_PASSWORD']},
	);
});

test('an empty secret is unusable', t => {
	const resolved = resolveSecrets(description, {
		QA_EMAIL: 'qa@example.com',
		QA_PASSWORD: '',
	});

	t.is(resolved.kind, 'unusable');
	if (resolved.kind === 'unusable') {
		t.is(resolved.name, 'QA_PASSWORD');
		t.is(resolved.reason, 'its value is empty');
	}
});

test('a secret too short to redact safely is unusable', t => {
	const resolved = resolveSecrets(description, {
		QA_EMAIL: 'qa@example.com',
		QA_PASSWORD: 'abc',
	});

	t.is(minimumSecretLength, 4);
	t.is(resolved.kind, 'unusable');
	if (resolved.kind === 'unusable') {
		t.is(resolved.name, 'QA_PASSWORD');
		t.is(resolved.reason, 'its value is shorter than 4 characters');
		t.notRegex(resolved.reason, /abc/);
	}
});

test('a secret of exactly the minimum length is usable', t => {
	t.is(
		resolveSecrets(description, {QA_EMAIL: 'a@b.c', QA_PASSWORD: 'abcd'}).kind,
		'resolved',
	);
});

test('a missing secret is reported before an unusable one', t => {
	t.deepEqual(resolveSecrets(description, {QA_EMAIL: ''}), {
		kind: 'missing',
		names: ['QA_PASSWORD'],
	});
});

// --- createRedactor ---------------------------------------------------------

test('a secret is replaced wherever it appears', t => {
	const redact = createRedactor(['correct horse']);

	t.is(redactedMarker, '[redacted]');
	t.is(
		redact('StaticText "Your key: correct horse" and again correct horse'),
		'StaticText "Your key: [redacted]" and again [redacted]',
	);
});

test('a secret is replaced in its URL-encoded form', t => {
	const redact = createRedactor(['p@ss word/1']);

	t.is(
		redact('https://app.example.com/reset?token=p%40ss%20word%2F1&x=1'),
		'https://app.example.com/reset?token=[redacted]&x=1',
	);
});

test('a secret is replaced in its form-encoded form', t => {
	const redact = createRedactor(['p@ss word/1']);

	t.is(redact('password=p%40ss+word%2F1'), 'password=[redacted]');
});

test('the longest secret is replaced first when one contains another', t => {
	const redact = createRedactor(['hunter', 'hunter2-extended']);

	t.is(redact('key hunter2-extended end'), 'key [redacted] end');
});

test('characters with meaning in a pattern are matched literally', t => {
	const redact = createRedactor(['a.b*c(d)[e]$']);

	t.is(redact('x a.b*c(d)[e]$ y aXb'), 'x [redacted] y aXb');
});

test('text without a secret is returned unchanged', t => {
	const redact = createRedactor(['correct horse']);
	const text = 'uid=1_4 textbox "Email " value="qa@example.com"';

	t.is(redact(text), text);
});

test('with no secrets the redactor changes nothing', t => {
	const redact = createRedactor([]);
	const text = 'anything at all, including [redacted]';

	t.is(redact(text), text);
});

test('an empty value is ignored rather than matching everywhere', t => {
	const redact = createRedactor(['', 'real-secret']);

	t.is(redact('a real-secret b'), 'a [redacted] b');
});

test('a secret is replaced as markup spells it', t => {
	// A page's source, and the snippets an audit quotes from it, escape the
	// characters markup gives meaning to.
	const redact = createRedactor(['p&ss"w<o>rd\'s']);

	t.is(
		redact('value="p&amp;ss&quot;w&lt;o&gt;rd&#39;s"'),
		`value="${redactedMarker}"`,
	);
	t.is(redact('p&amp;ss"w&lt;o&gt;rd\'s'), redactedMarker);
});
