/**
 * The judgement document `delegate submit` accepts.
 *
 * One document instead of a series of tool calls, because that is what an agent
 * driving a CLI can compose in one step.
 *
 * Validation happens in two stages, and the split is deliberate. This schema
 * checks the envelope; each finding is checked one at a time by the same
 * `validateFinding` the judgement server uses. Validating findings as part of
 * the document would make one malformed finding reject the whole document and
 * cost an agent a page's work, and partial acceptance is the normal case here.
 *
 * So the tests below come in two halves: the envelope against the schema, and
 * the finding rules against the real intake — which is also the honest way to
 * assert them, because it proves it is the *same* intake refusing them.
 */

import test from 'ava';
import {
	SubmissionRejected,
	validateFinding,
} from '../../../source/delegate/ingest.js';
import {judgementDocumentSchema} from '../../../source/models/delegate.js';

const runPages = ['https://example.com/page-1'];

const validFinding = {
	severity: 'high' as const,
	category: 'navigation',
	description: 'The primary action is below the fold on a phone.',
	personaRelevance: ['A first-time visitor scanning quickly'],
	recommendation: 'Move it above the fold.',
	pageUrl: 'https://example.com/page-1',
};

const validDocument = {
	run: 'a-run-identity',
	pages: [
		{
			pageUrl: 'https://example.com/page-1',
			findings: [validFinding],
			measurementNote: 'What the contrast failures mean for this persona.',
			finished: true,
		},
	],
};

test('the documented shape is accepted', t => {
	const parsed = judgementDocumentSchema.safeParse(validDocument);
	t.true(parsed.success, JSON.stringify(parsed.error?.issues));
});

test('a page may carry findings without a note, or a note without findings', t => {
	t.true(
		judgementDocumentSchema.safeParse({
			run: 'r',
			pages: [
				{pageUrl: 'https://example.com/page-1', findings: [validFinding]},
			],
		}).success,
	);

	t.true(
		judgementDocumentSchema.safeParse({
			run: 'r',
			pages: [
				{pageUrl: 'https://example.com/page-1', measurementNote: 'A note.'},
			],
		}).success,
	);
});

// The rule the whole report rests on. uxlint assigns every finding's origin, so
// a submitter claiming its own is refused rather than quietly stripped: silently
// dropping the field would leave the agent believing it had claimed something.
// Asserted through the intake, because the intake is what refuses it on both
// routes and a copy of the rule here would be a second place for it to drift.
test('a finding declaring its own origin is refused, naming the field', t => {
	const error = t.throws<SubmissionRejected>(
		() => {
			validateFinding({...validFinding, origin: 'audit'}, runPages);
		},
		{instanceOf: SubmissionRejected},
	);

	t.regex(error.message, /origin/);
});

test('a finding carrying a rule identifier is refused', t => {
	const error = t.throws<SubmissionRejected>(
		() => {
			validateFinding({...validFinding, ruleId: 'color-contrast'}, runPages);
		},
		{instanceOf: SubmissionRejected},
	);

	t.regex(error.message, /ruleId/);
});

test('a finding carrying affected elements is refused', t => {
	const error = t.throws<SubmissionRejected>(
		() => {
			validateFinding({...validFinding, affectedElements: 12}, runPages);
		},
		{instanceOf: SubmissionRejected},
	);

	t.regex(error.message, /affectedElements/);
});

test('a severity outside the scale is refused by the intake', t => {
	t.throws(
		() => {
			validateFinding({...validFinding, severity: 'catastrophic'}, runPages);
		},
		{instanceOf: SubmissionRejected},
	);
});

// The envelope is strict even though findings are not checked here, so a
// misspelled key at the document or page level is still a rejection.
test('an unrecognised key in the envelope is refused rather than dropped', t => {
	t.false(
		judgementDocumentSchema.safeParse({...validDocument, confidence: 'high'})
			.success,
	);

	t.false(
		judgementDocumentSchema.safeParse({
			run: 'r',
			pages: [
				{
					pageUrl: 'https://example.com/page-1',
					findings: [validFinding],
					verdict: 'pass',
				},
			],
		}).success,
	);
});

test('a document naming no run is refused', t => {
	t.false(
		judgementDocumentSchema.safeParse({pages: validDocument.pages}).success,
	);
});

test('a document with no pages is refused', t => {
	t.false(judgementDocumentSchema.safeParse({run: 'r', pages: []}).success);
});
