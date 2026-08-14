/**
 * Unit tests for threshold configuration validation
 *
 * These rules run before any page is analysed, so a misconfigured pipeline
 * costs no model usage (SC-005). A key that is merely ignored would leave the
 * user believing they had a gate when they had none, which is the failure the
 * unknown-key check exists to prevent.
 */

import test from 'ava';
import {
	defaultFailOnFailedPage,
	defaultFailOnPartialPage,
	severityThresholdKeys,
	validateThresholds,
} from '../../source/models/thresholds.js';

test('an absent thresholds block is valid', t => {
	t.is(validateThresholds(undefined), undefined);
});

test('an empty thresholds block is valid', t => {
	t.is(validateThresholds({}), undefined);
});

test('a fully populated thresholds block is valid', t => {
	t.is(
		validateThresholds({
			maxCritical: 0,
			maxHigh: 3,
			maxMedium: 10,
			maxLow: 20,
			failOnPartialPage: true,
			failOnFailedPage: false,
		}),
		undefined,
	);
});

test('zero is a valid limit and is not the same as absent', t => {
	// `0` means "none permitted"; absent means "not gated". Conflating them
	// would silently turn one into the other.
	t.is(validateThresholds({maxCritical: 0}), undefined);
});

for (const [label, value] of [
	['a string', '0'],
	['a negative number', -1],
	['a fraction', 1.5],
	['null', null],
	['NaN', NaN],
	['Infinity', Infinity],
	['a boolean', true],
] as const) {
	test(`maxCritical rejects ${label}`, t => {
		const issue = validateThresholds({maxCritical: value});
		t.truthy(issue, `${label} must be rejected`);
		t.is(issue?.key, 'thresholds.maxCritical');
		t.is(issue?.received, value);
	});
}

test('every severity key is validated, not just the first', t => {
	const issue = validateThresholds({maxCritical: 0, maxLow: -4});
	t.is(issue?.key, 'thresholds.maxLow');
});

for (const [label, value] of [
	['a string', 'yes'],
	['a number', 1],
	['null', null],
] as const) {
	test(`failOnPartialPage rejects ${label}`, t => {
		const issue = validateThresholds({failOnPartialPage: value});
		t.is(issue?.key, 'thresholds.failOnPartialPage');
		t.is(issue?.received, value);
	});
}

test('an unrecognised key is rejected by name', t => {
	// A typo that was merely ignored is indistinguishable from no gate.
	const issue = validateThresholds({maxCritcal: 0});
	t.is(issue?.key, 'thresholds.maxCritcal');
});

for (const [label, value] of [
	['an array', []],
	['null', null],
	['a string', 'strict'],
	['a number', 3],
] as const) {
	test(`the thresholds block itself rejects ${label}`, t => {
		const issue = validateThresholds(value);
		t.is(issue?.key, 'thresholds');
		t.is(issue?.received, value);
	});
}

test('an issue carries a message naming the key and the value', t => {
	const issue = validateThresholds({maxHigh: -1});
	t.truthy(issue);
	t.regex(issue!.message, /maxHigh/);
	t.regex(issue!.message, /-1/);
});

test('severity keys map one-to-one onto FindingSeverity', t => {
	t.deepEqual(severityThresholdKeys, {
		critical: 'maxCritical',
		high: 'maxHigh',
		medium: 'maxMedium',
		low: 'maxLow',
	});
});

test('coverage flags default to failing the run', t => {
	// Asymmetric with the severity limits by design: a severity budget is a
	// policy choice, but a run built on pages that never finished is not
	// evidence of anything.
	t.true(defaultFailOnPartialPage);
	t.true(defaultFailOnFailedPage);
});
