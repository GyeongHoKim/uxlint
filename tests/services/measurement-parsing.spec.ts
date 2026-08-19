import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {auditReportJson} from '../fixtures/lighthouse-report.js';
import {
	auditNavigationReply,
	auditSnapshotReply,
	malformedAuditReplies,
} from '../fixtures/lighthouse-reply.js';
import {
	parseAuditReply,
	readAuditReport,
} from '../../source/services/measurement.js';

const reportFixture = auditReportJson;

/**
 * Put the fixture report where a parsed reply says the report lives, so the
 * read path is exercised end to end rather than handed a pre-loaded object.
 */
function withReportOnDisk(reply: string): {reply: string; cleanup: () => void} {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-audit-test-'));
	const file = path.join(dir, 'report.json');
	fs.writeFileSync(file, reportFixture);
	const rewritten = reply.replace(/- \S*report\.json/, () => `- ${file}`);
	return {
		reply: rewritten,
		cleanup() {
			fs.rmSync(dir, {recursive: true, force: true});
		},
	};
}

test('the audit reply yields every category score', t => {
	const parsed = parseAuditReply(auditSnapshotReply);

	t.true(parsed.state === 'taken');
	if (parsed.state !== 'taken') {
		return;
	}

	// Four categories, keyed by the audit's own ids rather than by its titles.
	t.is(parsed.value.scores['accessibility'], 67);
	t.true(Object.hasOwn(parsed.value.scores, 'seo'));
	t.true(Object.hasOwn(parsed.value.scores, 'best-practices'));
	t.true(Object.hasOwn(parsed.value.scores, 'agentic-browsing'));
});

test('the audit reply yields the JSON report path', t => {
	const parsed = parseAuditReply(auditSnapshotReply);

	t.true(parsed.state === 'taken');
	if (parsed.state !== 'taken') {
		return;
	}

	t.true(parsed.value.reportPath.endsWith('.json'));
	// The HTML report is listed too, and is not what we read.
	t.false(parsed.value.reportPath.endsWith('.html'));
});

test('the URL line is not read', t => {
	// Snapshot mode emits the literal string "undefined" for the URL. A parser
	// that reads it records the word rather than an address.
	t.true(auditSnapshotReply.includes('URL: undefined'));

	const parsed = parseAuditReply(auditSnapshotReply);
	t.true(parsed.state === 'taken');
	if (parsed.state !== 'taken') {
		return;
	}

	t.false(JSON.stringify(parsed.value).includes('undefined'));
});

test('both audit modes agree on accessibility', t => {
	// The evidence behind taking the audit in the mode that does not reload:
	// the accessibility score is identical, so nothing this feature acts on is
	// lost by avoiding a second page load.
	const snapshot = parseAuditReply(auditSnapshotReply);
	const navigation = parseAuditReply(auditNavigationReply);

	t.true(snapshot.state === 'taken' && navigation.state === 'taken');
	if (snapshot.state !== 'taken' || navigation.state !== 'taken') {
		return;
	}

	t.is(
		snapshot.value.scores['accessibility'],
		navigation.value.scores['accessibility'],
	);
});

test('the report yields exactly the violations that failed', t => {
	const violations = readAuditReport(reportFixture);

	t.true(violations.state === 'taken');
	if (violations.state !== 'taken') {
		return;
	}

	const byRule = Object.fromEntries(
		violations.value.map(violation => [violation.ruleId, violation]),
	);

	t.deepEqual(Object.keys(byRule).sort(), [
		'color-contrast',
		'html-has-lang',
		'image-alt',
		'landmark-one-main',
	]);

	// Impacts and element counts as the real audit reported them.
	t.is(byRule['color-contrast']?.impact, 'serious');
	t.is(byRule['color-contrast']?.affectedElements, 3);
	t.is(byRule['image-alt']?.impact, 'critical');
	t.is(byRule['landmark-one-main']?.impact, 'moderate');
});

test('a violation carries the audit its own wording', t => {
	const violations = readAuditReport(reportFixture);
	t.true(violations.state === 'taken');
	if (violations.state !== 'taken') {
		return;
	}

	const report = JSON.parse(reportFixture) as {
		audits: Record<string, {title: string}>;
	};

	for (const violation of violations.value) {
		t.is(violation.title, report.audits[violation.ruleId]?.title ?? '');
	}
});

test('a not-applicable audit is not a failure', t => {
	// Lighthouse scores an audit `null` when it does not apply to the page.
	// Reading that as a failure would invent violations the page does not have.
	const report = JSON.parse(reportFixture) as {
		audits: Record<string, {score: unknown}>;
	};
	const notApplicable = Object.entries(report.audits).filter(
		([, audit]) => audit.score === null,
	);
	t.true(notApplicable.length > 0, 'fixture must contain a null-scored audit');

	const violations = readAuditReport(reportFixture);
	t.true(violations.state === 'taken');
	if (violations.state !== 'taken') {
		return;
	}

	for (const [ruleId] of notApplicable) {
		t.false(violations.value.some(violation => violation.ruleId === ruleId));
	}
});

test('a passing audit is not a violation', t => {
	const violations = readAuditReport(reportFixture);
	t.true(violations.state === 'taken');
	if (violations.state !== 'taken') {
		return;
	}

	t.false(
		violations.value.some(violation => violation.ruleId === 'button-name'),
	);
});

test('the report path from a parsed reply can be read', t => {
	const {reply, cleanup} = withReportOnDisk(auditSnapshotReply);
	try {
		const parsed = parseAuditReply(reply);
		t.true(parsed.state === 'taken');
		if (parsed.state !== 'taken') {
			return;
		}

		const violations = readAuditReport(
			fs.readFileSync(parsed.value.reportPath, 'utf8'),
		);
		t.true(violations.state === 'taken');
	} finally {
		cleanup();
	}
});

// --- malformed input: degrade, never raise -------------------------------

test('a reply with no reports section is unparseable', t => {
	const parsed = parseAuditReply(malformedAuditReplies.noReportSection);

	t.is(parsed.state, 'not-taken');
	t.is(parsed.state === 'not-taken' ? parsed.reason : '', 'unparseable');
});

test('a reply that is not an audit at all is unparseable', t => {
	const parsed = parseAuditReply(malformedAuditReplies.unrelated);

	t.is(parsed.state, 'not-taken');
	t.is(parsed.state === 'not-taken' ? parsed.reason : '', 'unparseable');
});

test('an empty reply is unparseable', t => {
	const parsed = parseAuditReply('');

	t.is(parsed.state, 'not-taken');
});

test('a truncated report is unparseable', t => {
	const parsed = readAuditReport(reportFixture.slice(0, 400));

	t.is(parsed.state, 'not-taken');
	t.is(parsed.state === 'not-taken' ? parsed.reason : '', 'unparseable');
});

test('a report with no accessibility category is unparseable', t => {
	const parsed = readAuditReport(JSON.stringify({categories: {}, audits: {}}));

	t.is(parsed.state, 'not-taken');
});

test('parsing never throws, whatever it is given', t => {
	// The point of the not-taken state. A future server version that rewords
	// its reply must cost the report a number, not cost the run its analysis.
	for (const input of Object.values(malformedAuditReplies)) {
		t.notThrows(() => parseAuditReply(input));
	}

	t.notThrows(() => parseAuditReply(''));
	t.notThrows(() => readAuditReport('not json at all'));
	t.notThrows(() => readAuditReport('null'));
});

test('an audit with no impact rating is skipped, not defaulted', t => {
	// There is no basis for a severity without an impact, and defaulting one
	// would put a guessed number inside a finding labelled as measured.
	const report = JSON.parse(reportFixture) as {
		audits: Record<string, {details?: {debugData?: unknown}}>;
	};
	const contrast = report.audits['color-contrast'];
	if (contrast?.details) {
		contrast.details.debugData = undefined;
	}

	const violations = readAuditReport(JSON.stringify(report));
	t.true(violations.state === 'taken');
	if (violations.state !== 'taken') {
		return;
	}

	t.false(
		violations.value.some(violation => violation.ruleId === 'color-contrast'),
	);
	t.is(violations.value.length, 3);
});
