/**
 * `delegate submit` — judgement in, report out.
 *
 * Every run below is made by `capture` with an injected browser, so these
 * exercise the real handoff between two commands rather than a hand-built run
 * that could quietly disagree with what `capture` writes.
 */

import {promises as fsPromises} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {captureForAgent} from '../../../source/delegate/driven/capture.js';
import {serveEvidence} from '../../../source/delegate/driven/evidence.js';
import {submitJudgement} from '../../../source/delegate/driven/submit.js';
import type {UxLintConfig} from '../../../source/models/config.js';
import {configFor, fakeBrowser, readyVerdict} from '../helpers.js';

/**
 * A captured run with its evidence already read, ready to be judged.
 *
 * @param teardown - Ava's teardown registrar
 * @param pageCount - How many pages the run covers
 * @returns The run identity, its parent directory and the configuration
 */
async function capturedRun(
	teardown: (fn: () => Promise<void>) => void,
	pageCount: number,
): Promise<{run: string; parent: string; config: UxLintConfig}> {
	const parent = await fsPromises.mkdtemp(
		path.join(os.tmpdir(), 'uxlint-submit-test-'),
	);
	teardown(async () => {
		await fsPromises.rm(parent, {recursive: true, force: true});
	});

	const config = configFor(pageCount, path.join(parent, 'report.md'));
	let run = '';

	await captureForAgent(config, {
		client: fakeBrowser(),
		parentDirectory: parent,
		async runPreflight() {
			return readyVerdict;
		},
		emitMessage() {
			// Nothing is printed during a test.
		},
		emitPayload(payload: unknown) {
			run = (payload as {run: string}).run;
		},
	});

	// An agent reads before it judges, and so must a test: a finding for a page
	// whose evidence was never requested is refused by design.
	await serveEvidence({
		run,
		parentDirectory: parent,
		emitPayload() {
			// Discarded.
		},
	});

	return {run, parent, config};
}

const finding = (pageUrl: string, description: string) => ({
	severity: 'high' as const,
	category: 'navigation',
	description,
	personaRelevance: ['A first-time visitor on a phone'],
	recommendation: 'Make it clearer.',
	pageUrl,
});

test('an accepted judgement reaches the report, carrying the origin uxlint assigned', async t => {
	const {run, parent, config} = await capturedRun(t.teardown, 1);
	const url = 'https://example.com/page-1';

	const exitCode = await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [
				{
					pageUrl: url,
					findings: [finding(url, 'The purpose of the page is unexplained.')],
					measurementNote: 'What the measured issues mean here.',
					finished: true,
				},
			],
		},
		emitMessage() {
			// Discarded.
		},
	});

	t.is(exitCode, 0);

	const report = await fsPromises.readFile(config.report.output, 'utf8');
	t.regex(report, /The purpose of the page is unexplained\./);
	// Measured findings come from the capture and judgement findings from the
	// agent, and the report has to keep them apart.
	t.regex(report, /_AI judgement_/);
	t.regex(report, /_measured_/);
});

test('a submitted finding cannot declare itself measured', async t => {
	const {run, parent, config} = await capturedRun(t.teardown, 1);
	const url = 'https://example.com/page-1';
	const messages: string[] = [];

	await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [
				{
					pageUrl: url,
					findings: [
						{
							...finding(url, 'Forged.'),
							origin: 'audit',
							ruleId: 'color-contrast',
						},
					],
				},
			],
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	t.regex(messages.join('\n'), /origin|ruleId/);

	const report = await fsPromises.readFile(config.report.output, 'utf8');
	t.notRegex(report, /Forged\./);
});

// One malformed finding must not cost an agent a page's work, and the refusal
// has to name what was wrong: its only chance to act on it is the next call.
test('a document mixing a refused finding with good ones keeps the good ones', async t => {
	const {run, parent, config} = await capturedRun(t.teardown, 1);
	const url = 'https://example.com/page-1';
	const messages: string[] = [];

	const exitCode = await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [
				{
					pageUrl: url,
					findings: [
						finding(url, 'First good finding.'),
						{...finding(url, 'Refused finding.'), origin: 'audit'},
						finding(url, 'Second good finding.'),
					],
					finished: true,
				},
			],
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	t.is(exitCode, 0, 'refused findings are reported, not fatal');
	t.regex(messages.join('\n'), /origin/);

	const report = await fsPromises.readFile(config.report.output, 'utf8');
	t.regex(report, /First good finding\./);
	t.regex(report, /Second good finding\./);
	t.notRegex(report, /Refused finding\./);
});

test('a finding for a page outside the run is refused, naming the run’s pages', async t => {
	const {run, parent, config} = await capturedRun(t.teardown, 1);
	const messages: string[] = [];

	await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [
				{
					pageUrl: 'https://elsewhere.test/',
					findings: [finding('https://elsewhere.test/', 'Elsewhere.')],
				},
			],
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	t.regex(messages.join('\n'), /page-1/);
});

test('a submission naming a run that does not exist is refused', async t => {
	const {parent, config} = await capturedRun(t.teardown, 1);
	const messages: string[] = [];

	const exitCode = await submitJudgement(config, {
		run: '00000000-0000-4000-8000-000000000000',
		parentDirectory: parent,
		document: {
			run: '00000000-0000-4000-8000-000000000000',
			pages: [
				{
					pageUrl: 'https://example.com/page-1',
					findings: [finding('https://example.com/page-1', 'Anything.')],
				},
			],
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	t.is(exitCode, 1);
	t.regex(messages.join('\n'), /00000000-0000-4000-8000-000000000000/);
});

// The report is written on every call, not only a final one, so a review
// abandoned after any submission has already produced its honest partial.
test('the report is rewritten on each call, from everything that has arrived', async t => {
	const {run, parent, config} = await capturedRun(t.teardown, 2);
	const first = 'https://example.com/page-1';
	const second = 'https://example.com/page-2';

	await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [
				{
					pageUrl: first,
					findings: [finding(first, 'On the first page.')],
					finished: true,
				},
			],
		},
		emitMessage() {
			// Discarded.
		},
	});

	const afterFirst = await fsPromises.readFile(config.report.output, 'utf8');
	t.regex(afterFirst, /On the first page\./);
	t.notRegex(afterFirst, /On the second page\./);

	await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [
				{
					pageUrl: second,
					findings: [finding(second, 'On the second page.')],
					finished: true,
				},
			],
		},
		emitMessage() {
			// Discarded.
		},
	});

	const afterSecond = await fsPromises.readFile(config.report.output, 'utf8');
	t.regex(afterSecond, /On the first page\./);
	t.regex(afterSecond, /On the second page\./);
});

test('a submission against a page already finished is refused as late', async t => {
	const {run, parent, config} = await capturedRun(t.teardown, 1);
	const url = 'https://example.com/page-1';
	const messages: string[] = [];

	await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [
				{pageUrl: url, findings: [finding(url, 'In time.')], finished: true},
			],
		},
		emitMessage() {
			// Discarded.
		},
	});

	await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [{pageUrl: url, findings: [finding(url, 'Too late.')]}],
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	t.regex(messages.join('\n'), /already finished|too late/i);

	const report = await fsPromises.readFile(config.report.output, 'utf8');
	t.regex(report, /In time\./);
	t.notRegex(report, /Too late\./);
});

// Found by a live run, not by a unit test: the envelope already names the page,
// so the document an agent naturally writes omits `pageUrl` from each finding —
// and every finding was refused for a field the document had already supplied
// one level up. The tests above passed only because their helper filled it in.
test('a finding need not repeat the page the envelope already names', async t => {
	const {run, parent, config} = await capturedRun(t.teardown, 1);
	const messages: string[] = [];

	const exitCode = await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [
				{
					pageUrl: 'https://example.com/page-1',
					findings: [
						{
							severity: 'high',
							category: 'orientation',
							description: 'Written the way an agent would write it.',
							personaRelevance: ['A first-time visitor'],
							recommendation: 'Explain the page.',
						},
					],
					finished: true,
				},
			],
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	t.is(exitCode, 0);
	t.deepEqual(
		messages.filter(message => message.includes('pageUrl')),
		[],
	);

	const report = await fsPromises.readFile(config.report.output, 'utf8');
	t.regex(report, /Written the way an agent would write it\./);
});

test('a finding naming a different page than its envelope is refused', async t => {
	const {run, parent, config} = await capturedRun(t.teardown, 2);
	const messages: string[] = [];

	await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [
				{
					pageUrl: 'https://example.com/page-1',
					findings: [
						{
							severity: 'high',
							category: 'orientation',
							description: 'Contradictory.',
							personaRelevance: ['Someone'],
							recommendation: 'Pick one page.',
							pageUrl: 'https://elsewhere.test/',
						},
					],
				},
			],
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	// There is no silent picking of a side: the intake refuses the contradiction.
	t.regex(messages.join('\n'), /elsewhere\.test/);

	const report = await fsPromises.readFile(config.report.output, 'utf8');
	t.notRegex(report, /Contradictory\./);
});

// US3. Page status is decided by what arrived, never by the agent's account of
// how the review went — and on this route that matters more than on the
// launcher one, because here there is no exit code even to be tempted by.
test('pages nobody judged are recorded as partial with a reason', async t => {
	const {run, parent, config} = await capturedRun(t.teardown, 2);
	const first = 'https://example.com/page-1';

	await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [
				{
					pageUrl: first,
					findings: [finding(first, 'Judged, and said so.')],
					finished: true,
				},
			],
		},
		emitMessage() {
			// Discarded.
		},
	});

	const report = await fsPromises.readFile(config.report.output, 'utf8');

	t.regex(report, /Judged, and said so\./);
	t.regex(report, /Partial/, 'the unjudged page is not presented as clean');
	t.regex(report, /page-2/);
});

test('a page marked finished with nothing submitted is judged-and-empty, not clean', async t => {
	const {run, parent, config} = await capturedRun(t.teardown, 1);

	await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [{pageUrl: 'https://example.com/page-1', finished: true}],
		},
		emitMessage() {
			// Discarded.
		},
	});

	const report = await fsPromises.readFile(config.report.output, 'utf8');

	// It carries its measured findings and no judgement ones. What it must not
	// do is claim a judgement that never arrived.
	t.regex(report, /_measured_/);
	t.notRegex(report, /_AI judgement_/);
});

// Reported by Claude Code while following the skill: `submit` printed nothing at
// all on success. The contract promises a summary of what was accepted and
// refused, and an agent that gets silence cannot tell success from a no-op.
test('a successful submission says what it accepted and where the report went', async t => {
	const {run, parent, config} = await capturedRun(t.teardown, 1);
	const url = 'https://example.com/page-1';
	const messages: string[] = [];

	const exitCode = await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [
				{
					pageUrl: url,
					findings: [finding(url, 'One.'), finding(url, 'Two.')],
					measurementNote: 'A note.',
					finished: true,
				},
			],
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	t.is(exitCode, 0);

	const said = messages.join('\n');
	t.regex(said, /2 findings/, 'it says how many findings were accepted');
	t.regex(said, /report\.md/, 'it says where the report went');
});

test('the summary reports refusals alongside what was accepted', async t => {
	const {run, parent, config} = await capturedRun(t.teardown, 1);
	const url = 'https://example.com/page-1';
	const messages: string[] = [];

	await submitJudgement(config, {
		run,
		parentDirectory: parent,
		document: {
			run,
			pages: [
				{
					pageUrl: url,
					findings: [
						finding(url, 'Accepted.'),
						{...finding(url, 'Refused.'), origin: 'audit'},
					],
					finished: true,
				},
			],
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	const said = messages.join('\n');
	t.regex(said, /1 finding\b/, 'one was accepted');
	t.regex(said, /1 refused/, 'and one was not');
});
