import test from 'ava';
import type {FindingSeverity} from '../../source/models/analysis.js';
import {
	impactToSeverity,
	isAxeImpact,
	noMeasurement,
	notTaken,
	taken,
	type AxeImpact,
} from '../../source/models/measurement.js';

// The impacts on the left are the ones a real audit produced against the
// planted fixture, so this table is checked against observed output rather
// than against itself.
const observed: Array<[AxeImpact, FindingSeverity, string]> = [
	['critical', 'critical', 'image-alt'],
	['serious', 'high', 'color-contrast'],
	['moderate', 'medium', 'landmark-one-main'],
	['minor', 'low', 'a rule none of the fixtures triggered'],
];

for (const [impact, severity, rule] of observed) {
	test(`an impact of ${impact} becomes ${severity} (${rule})`, t => {
		t.is(impactToSeverity[impact], severity);
	});
}

test('every impact the audit can report has a severity', t => {
	// The table is a total Record, so this asserts what the compiler already
	// enforces. It is here because the compiler stops enforcing it the moment
	// someone widens the key type to `string`.
	const impacts: AxeImpact[] = ['critical', 'serious', 'moderate', 'minor'];
	for (const impact of impacts) {
		t.truthy(impactToSeverity[impact]);
	}
});

test('an unknown impact is not accepted', t => {
	// A rule arriving without a recognised impact has no basis for a severity.
	// Defaulting it would put a guessed number inside a finding the report
	// labels as measured.
	t.false(isAxeImpact('catastrophic'));
	t.false(isAxeImpact(undefined));
	t.false(isAxeImpact(null));
	t.false(isAxeImpact(3));
	t.true(isAxeImpact('serious'));
});

test('a measured value and a missing one are distinguishable', t => {
	const present = taken(42);
	const absent = notTaken<number>('timed-out');

	t.is(present.state, 'taken');
	t.is(absent.state, 'not-taken');

	// The distinction this type exists for: a reader of the report must be
	// able to tell "measured, and it was zero" from "never measured".
	const zero = taken(0);
	t.is(zero.state, 'taken');
	t.not(zero.state, absent.state);
});

test('a missing measurement says why', t => {
	const absent = notTaken<number>('page-not-loaded');
	t.is(
		absent.state === 'not-taken' ? absent.reason : undefined,
		'page-not-loaded',
	);
});

test('a page that never loaded has neither measurement', t => {
	const measurement = noMeasurement('page-not-loaded');

	t.is(measurement.audit.state, 'not-taken');
	t.is(measurement.trace.state, 'not-taken');
	t.is(
		measurement.audit.state === 'not-taken' ? measurement.audit.reason : '',
		'page-not-loaded',
	);
});
