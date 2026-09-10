/**
 * Two reviews at once.
 *
 * The run identity is the only thing keeping them apart, because both live under
 * the same temporary directory and neither command holds a process open. A
 * command that fell back to "the current run" would put one review's judgement
 * into the other's report, which is the failure this guards.
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
 * One captured run, with its evidence read.
 *
 * @param parent - Where run directories live
 * @param output - Where its report goes
 * @param pageCount - How many pages it covers
 * @returns The run identity and its configuration
 */
async function capture(
	parent: string,
	output: string,
	pageCount: number,
): Promise<{run: string; config: UxLintConfig}> {
	const config = configFor(pageCount, output);
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

	await serveEvidence({
		run,
		parentDirectory: parent,
		emitPayload() {
			// Discarded.
		},
	});

	return {run, config};
}

test('two runs captured at once stay separate', async t => {
	const parent = await fsPromises.mkdtemp(
		path.join(os.tmpdir(), 'uxlint-concurrency-test-'),
	);
	t.teardown(async () => {
		await fsPromises.rm(parent, {recursive: true, force: true});
	});

	const [one, two] = await Promise.all([
		capture(parent, path.join(parent, 'one.md'), 1),
		capture(parent, path.join(parent, 'two.md'), 2),
	]);

	t.not(one.run, two.run, 'two runs never share an identity');

	const url = 'https://example.com/page-1';
	const submit = async (
		target: {run: string; config: UxLintConfig},
		description: string,
	) =>
		submitJudgement(target.config, {
			run: target.run,
			parentDirectory: parent,
			document: {
				run: target.run,
				pages: [
					{
						pageUrl: url,
						findings: [
							{
								severity: 'high' as const,
								category: 'navigation',
								description,
								personaRelevance: ['Someone'],
								recommendation: 'Fix it.',
							},
						],
						finished: true,
					},
				],
			},
			emitMessage() {
				// Discarded.
			},
		});

	await submit(one, 'Belongs to the first review.');
	await submit(two, 'Belongs to the second review.');

	const first = await fsPromises.readFile(one.config.report.output, 'utf8');
	const second = await fsPromises.readFile(two.config.report.output, 'utf8');

	t.regex(first, /Belongs to the first review\./);
	t.notRegex(first, /Belongs to the second review\./);
	t.regex(second, /Belongs to the second review\./);
	t.notRegex(second, /Belongs to the first review\./);
});

test('judgement submitted against the wrong run is refused, not misfiled', async t => {
	const parent = await fsPromises.mkdtemp(
		path.join(os.tmpdir(), 'uxlint-concurrency-test-'),
	);
	t.teardown(async () => {
		await fsPromises.rm(parent, {recursive: true, force: true});
	});

	// A one-page run and a two-page one, so the second has a page the first
	// does not.
	const one = await capture(parent, path.join(parent, 'one.md'), 1);
	const two = await capture(parent, path.join(parent, 'two.md'), 2);

	const messages: string[] = [];

	await submitJudgement(two.config, {
		run: two.run,
		parentDirectory: parent,
		document: {
			run: two.run,
			pages: [
				{
					pageUrl: 'https://example.com/page-2',
					findings: [
						{
							severity: 'high' as const,
							category: 'navigation',
							description: 'Meant for the two-page run.',
							personaRelevance: ['Someone'],
							recommendation: 'Fix it.',
						},
					],
				},
			],
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	// It belongs to the run it named, and the other review is untouched: nothing
	// was submitted to it, so it has no report at all.
	t.false(
		await fsPromises
			.stat(one.config.report.output)
			.then(() => true)
			.catch(() => false),
		'submitting to one run must not write the other run’s report',
	);

	const second = await fsPromises.readFile(two.config.report.output, 'utf8');
	t.regex(second, /Meant for the two-page run\./);
	// Nothing was refused -- the only messages are the recorded count and, once
	// the report is on disk, where it went -- and the summary names the run it
	// wrote for.
	t.deepEqual(
		messages.filter(
			message =>
				!message.includes('recorded') && !message.includes('report written'),
		),
		[],
	);
	t.regex(messages.join('\n'), /two\.md/);
});

test('a page belonging to another run is refused, naming this run’s pages', async t => {
	const parent = await fsPromises.mkdtemp(
		path.join(os.tmpdir(), 'uxlint-concurrency-test-'),
	);
	t.teardown(async () => {
		await fsPromises.rm(parent, {recursive: true, force: true});
	});

	const one = await capture(parent, path.join(parent, 'one.md'), 1);
	await capture(parent, path.join(parent, 'two.md'), 2);

	const messages: string[] = [];

	// The URL page-2 exists, but not in this run.
	await submitJudgement(one.config, {
		run: one.run,
		parentDirectory: parent,
		document: {
			run: one.run,
			pages: [
				{
					pageUrl: 'https://example.com/page-2',
					findings: [
						{
							severity: 'high' as const,
							category: 'navigation',
							description: 'Wrong run.',
							personaRelevance: ['Someone'],
							recommendation: 'Fix it.',
						},
					],
				},
			],
		},
		emitMessage(message: string) {
			messages.push(message);
		},
	});

	t.regex(messages.join('\n'), /page-1/);

	const report = await fsPromises.readFile(one.config.report.output, 'utf8');
	t.notRegex(report, /Wrong run\./);
});
