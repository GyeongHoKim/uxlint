/**
 * Unit tests for the analysis configuration block (008 T004).
 *
 * The validator's contract mirrors its siblings (`thresholds`, `browser`):
 * absent means defaults apply, an unrecognised key is an error rather than
 * something silently dropped, and every rejection names the offending key so
 * the user can fix it instead of discovering it at run time.
 */

import test from 'ava';
import {
	defaultPageTimeLimitMs,
	validateAnalysisConfig,
} from '../../source/models/config.js';

test('the provisional page bound default is 600000 ms', t => {
	t.is(defaultPageTimeLimitMs, 600_000);
});

test('an absent analysis block needs no validation', t => {
	t.is(validateAnalysisConfig(undefined), undefined);
});

for (const [label, value] of [
	['a string', 'fast'],
	['a number', 42],
	['a boolean', true],
	['an array', []],
	['null', null],
] as const) {
	test(`validateAnalysisConfig rejects ${label} as the block`, t => {
		const issue = validateAnalysisConfig(value);

		t.is(issue?.key, 'analysis');
	});
}

test('validateAnalysisConfig rejects an unrecognised key', t => {
	const issue = validateAnalysisConfig({pageTimeLimtMs: 1000});

	t.is(issue?.key, 'analysis.pageTimeLimtMs');
	t.true(
		issue?.message.includes('pageTimeLimitMs'),
		'the message must name what IS recognised',
	);
});

test('validateAnalysisConfig accepts an empty block', t => {
	t.is(validateAnalysisConfig({}), undefined);
});

test('validateAnalysisConfig accepts a positive integer bound', t => {
	t.is(validateAnalysisConfig({pageTimeLimitMs: 120_000}), undefined);
});

for (const [label, value] of [
	['zero', 0],
	['a negative number', -1],
	['a float', 1.5],
	['a string', '60000'],
	['NaN', NaN],
] as const) {
	test(`validateAnalysisConfig rejects ${label} as pageTimeLimitMs`, t => {
		const issue = validateAnalysisConfig({pageTimeLimitMs: value});

		t.is(issue?.key, 'analysis.pageTimeLimitMs');
	});
}
