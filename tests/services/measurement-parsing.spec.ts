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
	parseTraceReply,
	readAuditReport,
} from '../../source/services/measurement.js';
import {
	traceWithNavigationReply,
	traceWithoutNavigationReply,
	traceWithShiftingBlankPage,
} from '../fixtures/trace-reply.js';

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
		violations.value.violations.map(violation => [violation.ruleId, violation]),
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

	for (const violation of violations.value.violations) {
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
		t.false(
			violations.value.violations.some(
				violation => violation.ruleId === ruleId,
			),
		);
	}
});

test('a passing audit is not a violation', t => {
	const violations = readAuditReport(reportFixture);
	t.true(violations.state === 'taken');
	if (violations.state !== 'taken') {
		return;
	}

	t.false(
		violations.value.violations.some(
			violation => violation.ruleId === 'button-name',
		),
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
		violations.value.violations.some(
			violation => violation.ruleId === 'color-contrast',
		),
	);
	t.is(violations.value.violations.length, 3);
});

// --- trace metrics --------------------------------------------------------

test('the trace reports the page, not the blank page before it', t => {
	// A trace started with `reload` visits about:blank first, so the reply
	// carries two insight sets. Reading each metric from the whole reply takes
	// layout shift from the blank page -- structurally 0.00, and a statement
	// about nothing. Both recorded replies happened to report 0.00 everywhere,
	// so the wrong number and the right one were identical; this fixture makes
	// them differ.
	const parsed = parseTraceReply(traceWithShiftingBlankPage);

	t.true(parsed.state === 'taken');
	if (parsed.state !== 'taken') {
		return;
	}

	const {cumulativeLayoutShift: cls, largestContentfulPaint: lcp} =
		parsed.value;

	t.is(cls.state === 'taken' ? cls.value : undefined, 0);
	t.is(lcp.state === 'taken' ? lcp.value : undefined, 65);
});

test('a trace with a navigation reports both metrics', t => {
	const parsed = parseTraceReply(traceWithNavigationReply);

	t.true(parsed.state === 'taken');
	if (parsed.state !== 'taken') {
		return;
	}

	t.is(parsed.value.largestContentfulPaint.state, 'taken');
	t.is(parsed.value.cumulativeLayoutShift.state, 'taken');
});

test('a trace with no navigation has layout shift but no paint', t => {
	// FR-006a: a measurement succeeding is not a guarantee that every metric
	// within it exists.
	const parsed = parseTraceReply(traceWithoutNavigationReply);

	t.true(parsed.state === 'taken');
	if (parsed.state !== 'taken') {
		return;
	}

	t.is(parsed.value.cumulativeLayoutShift.state, 'taken');
	t.is(parsed.value.largestContentfulPaint.state, 'not-taken');
});

test('no First Contentful Paint is ever produced', t => {
	// The only FCP figure the reply carries is a projected saving from a
	// suggested fix. Reporting it as the page's FCP would fabricate exactly
	// the kind of number this feature removes.
	t.true(traceWithNavigationReply.includes('FCP'));

	const parsed = parseTraceReply(traceWithNavigationReply);
	t.true(parsed.state === 'taken');
	if (parsed.state !== 'taken') {
		return;
	}

	t.false(Object.hasOwn(parsed.value, 'firstContentfulPaint'));
	t.false(JSON.stringify(parsed.value).toLowerCase().includes('fcp'));
});

test('`LCP breakdown` is a heading, not a metric', t => {
	// A loose match on the name consumes it and reports no paint at all.
	t.true(traceWithNavigationReply.includes('- LCP breakdown:'));

	const parsed = parseTraceReply(traceWithNavigationReply);
	t.true(parsed.state === 'taken');
	if (parsed.state !== 'taken') {
		return;
	}

	t.is(
		parsed.value.largestContentfulPaint.state === 'taken'
			? parsed.value.largestContentfulPaint.value
			: undefined,
		65,
	);
});

test('a reply with no insight set is unparseable', t => {
	t.is(parseTraceReply('Metrics (lab / observed)').state, 'not-taken');
	t.is(parseTraceReply('nothing like a trace').state, 'not-taken');
	t.notThrows(() => parseTraceReply(''));
});

test('a Windows report path is read, not discarded', t => {
	// Windows is a supported target -- this project stores credentials in its
	// credential manager -- and the server reports `C:\\...` there. Keying the
	// filter on a leading slash rejected those and reported the whole audit as
	// unparseable, on the one platform where nobody here would notice.
	const windows = auditSnapshotReply
		.replace(
			/- \/\S*report\.json/,
			() => String.raw`- C:\Users\dev\AppData\Local\Temp\cdp-1\report.json`,
		)
		.replace(
			/- \/\S*report\.html/,
			() => String.raw`- C:\Users\dev\AppData\Local\Temp\cdp-2\report.html`,
		);

	const parsed = parseAuditReply(windows);

	t.true(parsed.state === 'taken');
	if (parsed.state !== 'taken') {
		return;
	}

	t.true(parsed.value.reportPath.endsWith(String.raw`cdp-1\report.json`));
	t.is(parsed.value.writtenPaths.length, 2);
});

test('the category score lines are not mistaken for paths', t => {
	// Both are bullet lists. Only one of them names files.
	const parsed = parseAuditReply(auditSnapshotReply);

	t.true(parsed.state === 'taken');
	if (parsed.state !== 'taken') {
		return;
	}

	t.is(parsed.value.writtenPaths.length, 2);
	t.false(
		parsed.value.writtenPaths.some(file => file.includes('Accessibility')),
	);
});
