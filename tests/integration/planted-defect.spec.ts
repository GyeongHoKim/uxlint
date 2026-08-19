import {Buffer} from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {generateMarkdownReport} from '../../source/infrastructure/reports/report-generator.js';
import type {UxReport} from '../../source/models/analysis.js';
import {impactToSeverity} from '../../source/models/measurement.js';
import {
	describeMeasurement,
	MeasurementService,
	type MeasurementClient,
} from '../../source/services/measurement.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import {auditReportJson} from '../fixtures/lighthouse-report.js';
import {auditSnapshotReply} from '../fixtures/lighthouse-reply.js';
import {mcpResult} from '../fixtures/mcp-result.js';
import {traceWithNavigationReply} from '../fixtures/trace-reply.js';

/**
 * A client answering with the replies the real server gave for the fixture
 * page in `specs/007-deterministic-audit/probe/fixture.html`, whose contrast
 * defect was planted deliberately.
 */
function plantedDefectClient(): {client: MeasurementClient; dir: string} {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-planted-'));
	fs.writeFileSync(path.join(dir, 'report.json'), auditReportJson);
	const reply = auditSnapshotReply.replace(
		/- \S*report\.json/,
		() => `- ${path.join(dir, 'report.json')}`,
	);

	return {
		dir,
		client: {
			async callTool({name}) {
				return mcpResult(
					name === 'lighthouse_audit' ? reply : traceWithNavigationReply,
				);
			},
		},
	};
}

/** Run one page through measurement and render the report a user would read. */
async function renderPageReport(url = 'https://example.com/checkout'): Promise<{
	markdown: string;
	report: UxReport;
}> {
	const {client, dir} = plantedDefectClient();
	const builder = new ReportBuilder();

	try {
		builder.initializePageAnalysis(url, 'Checkout');
		const measurement = await new MeasurementService(client).measure(
			'analysable',
		);
		builder.setPageMeasurement(measurement);

		if (measurement.audit.state === 'taken') {
			for (const violation of measurement.audit.value.violations) {
				builder.addFinding({
					severity: impactToSeverity[violation.impact],
					category: 'Accessibility',
					description: violation.title,
					personaRelevance: [],
					recommendation: '',
					pageUrl: url,
					origin: 'audit',
					ruleId: violation.ruleId,
					affectedElements: violation.affectedElements,
				});
			}
		}

		builder.setPersona('A shopper in a hurry');
		builder.completePageAnalysis('complete');
		const report = builder.generateFinalReport();

		return {markdown: generateMarkdownReport(report), report};
	} finally {
		fs.rmSync(dir, {recursive: true, force: true});
	}
}

test('planted defect', async t => {
	// SC-001. The fixture page was written with a contrast failure in it, so
	// the expected finding was known before the run that produced this
	// fixture. Asserted against the rendered markdown a user opens, not
	// against the object behind it.
	const {markdown} = await renderPageReport();

	t.true(markdown.includes('color-contrast'));
	t.true(
		markdown.includes(
			'Background and foreground colors do not have a sufficient contrast ratio.',
		),
	);
	t.true(markdown.includes('https://example.com/checkout'));
});

test('a planted defect keeps the severity its impact maps to', async t => {
	const {report} = await renderPageReport();
	const contrast = report.prioritizedFindings.find(
		finding => finding.ruleId === 'color-contrast',
	);

	// Serious maps to high, by the published table rather than by opinion.
	t.is(contrast?.severity, 'high');
	t.is(contrast?.origin, 'audit');
	t.is(contrast?.affectedElements, 3);
});

test('violation set is reproducible', async t => {
	// SC-003. Two runs over the same unchanged page produce the same rules,
	// the same count and the same severities. Vitals are timings and may move;
	// the violation set may not.
	const first = await renderPageReport();
	const second = await renderPageReport();

	const shape = (report: UxReport) =>
		report.prioritizedFindings
			.filter(finding => finding.origin === 'audit')
			.map(
				finding =>
					`${finding.ruleId}:${finding.severity}:${finding.affectedElements}`,
			)
			.sort();

	t.deepEqual(shape(first.report), shape(second.report));
	t.is(shape(first.report).length, 4);
});

test('measured findings carry the audit wording, never ours', async t => {
	// SC-011. Every measured description must be a string the audit produced.
	const {report} = await renderPageReport();
	const {audits} = JSON.parse(auditReportJson) as {
		audits: Record<string, {title?: string}>;
	};

	for (const finding of report.prioritizedFindings) {
		if (finding.origin !== 'audit') {
			continue;
		}

		t.is(finding.description, audits[finding.ruleId ?? '']?.title ?? '');
	}
});

test('the model is told what was measured', async t => {
	// The digest is what stops the model reporting the same defect a second
	// time as a guess. Without it the MVP would ship duplicate findings.
	const {client, dir} = plantedDefectClient();

	try {
		const measurement = await new MeasurementService(client).measure(
			'analysable',
		);
		const digest = describeMeasurement(measurement);

		t.true(digest.includes('color-contrast'));
		t.true(digest.includes('do not report them again'));
		// Small enough to be affordable on every page.
		t.true(Buffer.byteLength(digest) < 2000);
	} finally {
		fs.rmSync(dir, {recursive: true, force: true});
	}
});
