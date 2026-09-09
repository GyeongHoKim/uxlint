import {promises as fsPromises} from 'node:fs';
import path from 'node:path';
import {MockLanguageModelV4} from 'ai/test';
import test from 'ava';
import {runDelegatedAnalysis} from '../../source/delegate/runner.js';
import {AIService} from '../../source/services/ai-service.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import type {UxFinding, UxReport} from '../../source/models/analysis.js';
import {browserServerIdentity} from '../../source/services/mcp-client.js';
import {
	configFor,
	fakeBrowser,
	readyVerdict,
	scriptedHost,
	temporaryDirectory,
} from './helpers.js';

/**
 * The usage shape the mock model must return, spelled once.
 */
const usage = {
	inputTokens: {
		total: 10,
		noCache: 10,
		cacheRead: undefined,
		cacheWrite: undefined,
	},
	outputTokens: {total: 20, text: 20, reasoning: undefined},
};

/**
 * A model that navigates, captures and completes, and judges nothing.
 *
 * Judging nothing is deliberate: this test compares the measured half of two
 * reports, and a model inventing findings would only add noise to the half
 * that is allowed to differ.
 *
 * @returns The scripted model
 */
function capturingModel(): MockLanguageModelV4 {
	const script = [
		{
			toolName: 'navigate_page',
			input: JSON.stringify({url: 'https://example.com/page-1'}),
		},
		{toolName: 'take_snapshot', input: '{}'},
		{toolName: 'completePageAnalysis', input: '{}'},
	];

	let step = 0;

	return new MockLanguageModelV4({
		async doGenerate() {
			const call = script[Math.min(step, script.length - 1)]!;
			step++;

			return {
				finishReason: {unified: 'tool-calls' as const, raw: undefined},
				usage,
				content: [
					{
						type: 'tool-call' as const,
						toolCallId: `call-${step}`,
						toolName: call.toolName,
						input: call.input,
					},
				],
				warnings: [],
			};
		},
	});
}

/** The measured half of a report, in a form two runs can be compared on. */
function measuredPortion(report: UxReport) {
	return report.prioritizedFindings
		.filter(finding => finding.origin === 'audit')
		.map((finding: UxFinding) => ({
			severity: finding.severity,
			category: finding.category,
			description: finding.description,
			pageUrl: finding.pageUrl,
			ruleId: finding.ruleId,
			affectedElements: finding.affectedElements,
			personaRelevance: finding.personaRelevance,
			recommendation: finding.recommendation,
		}))
		.sort((a, b) => (a.ruleId ?? '').localeCompare(b.ruleId ?? ''));
}

/**
 * Run the same page through the built-in path.
 */
async function builtInReport(t: {
	teardown: (fn: () => void) => void;
}): Promise<UxReport> {
	const directory = temporaryDirectory(t.teardown);
	const config = configFor(1, path.join(directory, 'report.md'));
	const builder = new ReportBuilder(fsPromises);
	const service = new AIService(capturingModel(), fakeBrowser(), builder);
	const server = browserServerIdentity();

	builder.setProvenance({
		browserServer: server.name,
		browserServerVersion: server.version,
		browserVersion: 'Google Chrome 151.0.7922.137',
		externalDataAllowed: false,
	});

	await service.analyzePage(config, config.pages[0]!);

	return builder.generateFinalReport();
}

/**
 * Run the same page through the delegated path.
 */
async function delegatedReport(t: {
	teardown: (fn: () => void) => void;
}): Promise<UxReport> {
	const directory = temporaryDirectory(t.teardown);
	const builder = new ReportBuilder(fsPromises);

	await runDelegatedAnalysis(configFor(1, path.join(directory, 'report.md')), {
		client: fakeBrowser(),
		builder,
		async runPreflight() {
			return readyVerdict;
		},
		emitVerdict() {
			// Nothing is printed during a test.
		},
		adapter: scriptedHost([{findings: 2, complete: true}]),
	});

	return builder.generateFinalReport();
}

// SC-002. This is the property that makes delegating judgement safe: whoever
// judged the page, the facts the report calls measured came from the audit and
// are the same facts. Without it, "delegate mode" would mean a different
// product rather than a different way of obtaining an opinion.
test('the measured findings are identical whoever did the judging', async t => {
	const [builtIn, delegated] = await Promise.all([
		builtInReport(t),
		delegatedReport(t),
	]);

	t.deepEqual(measuredPortion(delegated), measuredPortion(builtIn));
	t.true(
		measuredPortion(builtIn).length > 0,
		'the fixture must actually measure something, or this test proves nothing',
	);
});

test('the browser provenance is identical whoever did the judging', async t => {
	const [builtIn, delegated] = await Promise.all([
		builtInReport(t),
		delegatedReport(t),
	]);

	t.is(
		delegated.metadata.tooling.browserServer,
		builtIn.metadata.tooling.browserServer,
	);
	t.is(
		delegated.metadata.tooling.browserServerVersion,
		builtIn.metadata.tooling.browserServerVersion,
	);
	t.is(
		delegated.metadata.tooling.auditEngineVersion,
		builtIn.metadata.tooling.auditEngineVersion,
	);
});

test('only the judged half differs, and it differs because the judge did', async t => {
	const [builtIn, delegated] = await Promise.all([
		builtInReport(t),
		delegatedReport(t),
	]);

	t.is(
		builtIn.prioritizedFindings.filter(
			finding => finding.origin === 'judgement',
		).length,
		0,
	);
	t.is(
		delegated.prioritizedFindings.filter(
			finding => finding.origin === 'judgement',
		).length,
		2,
	);
});

test('the captured page structure is the browser own output on both paths', async t => {
	const [builtIn, delegated] = await Promise.all([
		builtInReport(t),
		delegatedReport(t),
	]);

	t.is(delegated.pages[0]!.snapshot, builtIn.pages[0]!.snapshot);
	t.true(delegated.pages[0]!.snapshot.length > 0);
});
