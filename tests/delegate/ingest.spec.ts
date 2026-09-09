import test from 'ava';
import {
	collect,
	SubmissionRejected,
	toUxFinding,
	validateFinding,
} from '../../source/delegate/ingest.js';
import type {RecordedSubmission} from '../../source/models/delegate.js';

const first = 'https://example.com/';
const second = 'https://example.com/pricing';
const pages = [first, second];

const validFinding = {
	severity: 'high',
	category: 'Navigation',
	description: 'The primary action is below the fold on a phone.',
	personaRelevance: ['first-time visitor'],
	recommendation: 'Move the call to action above the fold.',
	pageUrl: first,
};

test('a conforming submission is accepted', t => {
	const accepted = validateFinding(validFinding, pages);
	t.is(accepted.severity, 'high');
	t.is(accepted.pageUrl, first);
});

test('an unknown severity is refused, and the rejection names the field', t => {
	const error = t.throws(
		() => validateFinding({...validFinding, severity: 'catastrophic'}, pages),
		{instanceOf: SubmissionRejected},
	);

	t.regex(error.message, /severity/);
});

for (const field of ['category', 'description', 'recommendation'] as const) {
	test(`an empty ${field} is refused, and the rejection names the field`, t => {
		const error = t.throws(
			() => validateFinding({...validFinding, [field]: ''}, pages),
			{
				instanceOf: SubmissionRejected,
			},
		);

		t.regex(error.message, new RegExp(field));
	});
}

test('a submission naming a page outside the run is refused, and the rejection lists the pages', t => {
	const error = t.throws(
		() =>
			validateFinding(
				{...validFinding, pageUrl: 'https://elsewhere.test/'},
				pages,
			),
		{instanceOf: SubmissionRejected},
	);

	t.regex(error.message, /example\.com/);
});

// The whole point of the origin field is that a reader can tell a measured
// fact from a judgement. A submitter able to set it would make the
// distinction worthless, so the contract refuses the key outright rather
// than quietly dropping it -- silently ignoring it would let an agent
// believe it had claimed something it had not.
for (const key of ['origin', 'ruleId', 'affectedElements'] as const) {
	test(`a submission carrying ${key} is refused`, t => {
		const error = t.throws(
			() => validateFinding({...validFinding, [key]: 'audit'}, pages),
			{instanceOf: SubmissionRejected},
		);

		t.regex(error.message, new RegExp(key));
	});
}

test('uxlint assigns the origin; a stored finding is always a judgement', t => {
	const finding = toUxFinding(validateFinding(validFinding, pages));
	t.is(finding.origin, 'judgement');
	t.is(finding.ruleId, undefined);
	t.is(finding.affectedElements, undefined);
});

test('collect groups findings and notes by the page they were submitted against', t => {
	const submissions: RecordedSubmission[] = [
		{
			kind: 'finding',
			pageUrl: first,
			finding: validateFinding(validFinding, pages),
		},
		{
			kind: 'finding',
			pageUrl: second,
			finding: validateFinding({...validFinding, pageUrl: second}, pages),
		},
		{
			kind: 'note',
			pageUrl: second,
			note: 'Contrast failures hit this persona hardest.',
		},
		{kind: 'complete', pageUrl: second},
	];

	const result = collect(submissions);

	t.is(result.findingsByPage.get(first)?.length, 1);
	t.is(result.findingsByPage.get(second)?.length, 1);
	t.is(
		result.noteByPage.get(second),
		'Contrast failures hit this persona hardest.',
	);
	t.true(result.finished.has(second));
	t.false(result.finished.has(first));
});

test('every finding collect returns carries the judgement origin', t => {
	const submissions: RecordedSubmission[] = [
		{
			kind: 'finding',
			pageUrl: first,
			finding: validateFinding(validFinding, pages),
		},
	];

	const [finding] = collect(submissions).findingsByPage.get(first)!;
	t.is(finding!.origin, 'judgement');
});
