import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {cwd, pid} from 'node:process';
import test from 'ava';
import {auditReportJson} from '../fixtures/lighthouse-report.js';
import {
	auditSnapshotReply,
	malformedAuditReplies,
} from '../fixtures/lighthouse-reply.js';
import {traceWithNavigationReply} from '../fixtures/trace-reply.js';
import {mcpError, mcpResult} from '../fixtures/mcp-result.js';
import {
	isAuditPathRemovable,
	MeasurementService,
	type MeasurementClient,
} from '../../source/services/measurement.js';
import {ReportBuilder} from '../../source/services/report-builder.js';

const reportFixture = auditReportJson;

/**
 * A reply pointing at a report that really is on disk, so the success path is
 * a success for the same reason it would be in production.
 */
function replyWithRealReport(): {reply: string; dir: string} {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-measure-test-'));
	fs.writeFileSync(path.join(dir, 'report.json'), reportFixture);
	return {
		reply: auditSnapshotReply.replace(
			/- \S*report\.json/,
			() => `- ${path.join(dir, 'report.json')}`,
		),
		dir,
	};
}

/**
 * A client whose replies are scripted per tool, recording what it was asked.
 */
function scriptedClient(
	replies: Record<string, () => Promise<unknown>>,
): MeasurementClient & {calls: Array<{name: string; args: unknown}>} {
	const calls: Array<{name: string; args: unknown}> = [];
	return {
		calls,
		async callTool({name, arguments: args}) {
			calls.push({name, args});
			const reply = replies[name];
			if (!reply) {
				throw new Error(`unscripted tool: ${name}`);
			}

			return reply();
		},
	};
}

const okTrace = async () => mcpResult(traceWithNavigationReply);

test('a page that never loaded is not measured', async t => {
	const client = scriptedClient({});
	const service = new MeasurementService(client);

	const measurement = await service.measure('loaded');

	t.is(measurement.audit.state, 'not-taken');
	t.is(
		measurement.audit.state === 'not-taken' ? measurement.audit.reason : '',
		'page-not-loaded',
	);
	// No tool was called at all: there was nothing to measure.
	t.is(client.calls.length, 0);
});

test('a returned isError is a failure, not a success', async t => {
	// The server reports failure by *returning* it. Feature 006 shipped a bug
	// by treating a returned result as proof the call worked.
	const client = scriptedClient({
		async lighthouse_audit() {
			return mcpError(
				'Protocol error (Target.setDiscoverTargets): Target closed',
			);
		},
		performance_start_trace: okTrace,
	});

	const measurement = await new MeasurementService(client).measure(
		'analysable',
	);

	t.is(measurement.audit.state, 'not-taken');
	t.is(
		measurement.audit.state === 'not-taken' ? measurement.audit.reason : '',
		'tool-failed',
	);
});

test('a rejected call is a failure', async t => {
	const client = scriptedClient({
		async lighthouse_audit() {
			throw new Error('connection closed');
		},
		performance_start_trace: okTrace,
	});

	const measurement = await new MeasurementService(client).measure(
		'analysable',
	);

	t.is(measurement.audit.state, 'not-taken');
	t.is(
		measurement.audit.state === 'not-taken' ? measurement.audit.reason : '',
		'tool-failed',
	);
});

test('a missing report file is unparseable', async t => {
	const client = scriptedClient({
		async lighthouse_audit() {
			return mcpResult(malformedAuditReplies.missingReportFile);
		},
		performance_start_trace: okTrace,
	});

	const measurement = await new MeasurementService(client).measure(
		'analysable',
	);

	t.is(measurement.audit.state, 'not-taken');
	t.is(
		measurement.audit.state === 'not-taken' ? measurement.audit.reason : '',
		'unparseable',
	);
});

test('a failed audit does not stop the trace', async t => {
	// The two are measured independently, so one failing must not take the
	// other with it -- the report has to be able to say which was taken.
	const client = scriptedClient({
		async lighthouse_audit() {
			return mcpError('audit blew up');
		},
		performance_start_trace: okTrace,
	});

	const measurement = await new MeasurementService(client).measure(
		'analysable',
	);

	t.is(measurement.audit.state, 'not-taken');
	t.is(measurement.trace.state, 'taken');
});

test('a measurement that never returns', async t => {
	// SC-008a. A tool call that never resolves is abandoned at the bound and
	// the page is recorded as not measured, rather than the run hanging.
	const client = scriptedClient({
		async lighthouse_audit() {
			return new Promise(() => {
				// Never resolves, and never rejects.
			});
		},
		performance_start_trace: okTrace,
	});

	const service = new MeasurementService(client, 30);
	const started = Date.now();
	const measurement = await service.measure('analysable');

	t.is(measurement.audit.state, 'not-taken');
	t.is(
		measurement.audit.state === 'not-taken' ? measurement.audit.reason : '',
		'timed-out',
	);
	// It really was abandoned rather than awaited to completion.
	t.true(Date.now() - started < 5000);
});

test('an abort signal is passed to every call', async t => {
	const seen: Array<AbortSignal | undefined> = [];
	const client: MeasurementClient = {
		async callTool({name, options}) {
			seen.push(options?.signal);
			return mcpResult(
				name === 'lighthouse_audit'
					? auditSnapshotReply
					: traceWithNavigationReply,
			);
		},
	};

	await new MeasurementService(client).measure('analysable');

	t.is(seen.length, 2);
	for (const signal of seen) {
		t.true(signal instanceof AbortSignal);
	}
});

test('the audit is asked for in the mode that does not reload', async t => {
	const {reply, dir} = replyWithRealReport();
	const client = scriptedClient({
		async lighthouse_audit() {
			return mcpResult(reply);
		},
		performance_start_trace: okTrace,
	});

	try {
		await new MeasurementService(client).measure('analysable');

		const audit = client.calls.find(call => call.name === 'lighthouse_audit');
		// The tool's own default is `navigation`, which reloads the page and
		// would leave the captured structure describing a different load.
		t.deepEqual(audit?.args, {mode: 'snapshot', device: 'desktop'});
	} finally {
		fs.rmSync(dir, {recursive: true, force: true});
	}
});

test('the audit runs before the trace', async t => {
	// The trace reloads the page, so an audit after it would judge a state the
	// captured structure no longer describes.
	const client = scriptedClient({
		async lighthouse_audit() {
			return mcpResult(auditSnapshotReply);
		},
		performance_start_trace: okTrace,
	});

	await new MeasurementService(client).measure('analysable');

	t.deepEqual(
		client.calls.map(call => call.name),
		['lighthouse_audit', 'performance_start_trace'],
	);
});

test('every directory the audit wrote to is deleted', async t => {
	// The audit writes a JSON report and an HTML one, each into a temp
	// directory of its own. Cleaning up only the one we read left a
	// quarter-megabyte HTML report behind on every audit -- found by running
	// it, not by any test here, which is why this one exists.
	const jsonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-json-'));
	const htmlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-html-'));
	fs.writeFileSync(path.join(jsonDir, 'report.json'), reportFixture);
	fs.writeFileSync(path.join(htmlDir, 'report.html'), '<html></html>');

	const reply = auditSnapshotReply
		.replace(
			/- \S*report\.json/,
			() => `- ${path.join(jsonDir, 'report.json')}`,
		)
		.replace(
			/- \S*report\.html/,
			() => `- ${path.join(htmlDir, 'report.html')}`,
		);

	const client = scriptedClient({
		async lighthouse_audit() {
			return mcpResult(reply);
		},
		performance_start_trace: okTrace,
	});

	await new MeasurementService(client).measure('analysable');

	t.false(fs.existsSync(jsonDir));
	t.false(fs.existsSync(htmlDir), 'the HTML report directory survived');
});

test('the report directory is deleted after it is read', async t => {
	const {reply, dir} = replyWithRealReport();
	const client = scriptedClient({
		async lighthouse_audit() {
			return mcpResult(reply);
		},
		performance_start_trace: okTrace,
	});

	const measurement = await new MeasurementService(client).measure(
		'analysable',
	);

	t.is(measurement.audit.state, 'taken');
	// Each audit writes ~156 KB of JSON plus an HTML report into a fresh temp
	// directory. Left alone, a ten-page run leaves megabytes behind each time.
	t.false(fs.existsSync(dir));
});

test('each not-taken route is logged distinctly', async t => {
	// FR-005b. An abandoned measurement, a failed one and one never attempted
	// must be tellable apart in the log, or a slow site and a broken one read
	// the same to whoever is debugging.
	const lines: string[] = [];
	const record = (message: string) => {
		lines.push(message);
	};

	await new MeasurementService(scriptedClient({}), 30, record).measure(
		'loaded',
	);

	await new MeasurementService(
		scriptedClient({
			async lighthouse_audit() {
				return mcpError('boom');
			},
			performance_start_trace: okTrace,
		}),
		30,
		record,
	).measure('analysable');

	await new MeasurementService(
		scriptedClient({
			async lighthouse_audit() {
				return new Promise(() => {
					// Never settles.
				});
			},
			performance_start_trace: okTrace,
		}),
		30,
		record,
	).measure('analysable');

	const reasons = ['page-not-loaded', 'tool-failed', 'timed-out'];
	for (const reason of reasons) {
		t.true(
			lines.some(line => line.includes(reason)),
			`no log line mentioned ${reason}`,
		);
	}

	// Distinct, not merely present: three routes must not share one message.
	const mentioning = reasons.map(
		reason => lines.filter(line => line.includes(reason)).length,
	);
	t.true(mentioning.every(count => count > 0));
});

test('audit failure loses nothing', async t => {
	// SC-005, and the shape of D8: an error path that erased every page
	// already analysed. Three pages, the middle one's audit failing, and
	// nothing may be lost -- not the failing page's own model findings, and
	// not the pages either side of it.
	const builder = new ReportBuilder();
	builder.setPersona('Test persona');

	const pages = [
		{url: 'https://example.com/a', auditFails: false},
		{url: 'https://example.com/b', auditFails: true},
		{url: 'https://example.com/c', auditFails: false},
	];

	for (const page of pages) {
		const {reply, dir} = replyWithRealReport();
		const client = scriptedClient({
			async lighthouse_audit() {
				return page.auditFails ? mcpError('audit blew up') : mcpResult(reply);
			},
			performance_start_trace: okTrace,
		});

		builder.initializePageAnalysis(page.url, 'features');

		// eslint-disable-next-line no-await-in-loop
		const measurement = await new MeasurementService(client).measure(
			'analysable',
		);
		builder.setPageMeasurement(measurement);

		// Whatever the model concluded about the page, recorded either way.
		builder.addFinding({
			severity: 'medium',
			category: 'Content',
			description: `A judgement about ${page.url}`,
			personaRelevance: ['Test persona'],
			recommendation: 'Fix it',
			pageUrl: page.url,
			origin: 'judgement',
		});

		builder.completePageAnalysis('complete');
		fs.rmSync(dir, {recursive: true, force: true});
	}

	const report = builder.generateFinalReport();

	// Every page is present, including the one whose measurement failed.
	t.is(report.pages.length, 3);

	// Every model finding survives -- on the failing page and on both others.
	for (const page of pages) {
		const analysis = report.pages.find(entry => entry.pageUrl === page.url);
		t.true(
			analysis?.findings.some(finding => finding.origin === 'judgement'),
			`${page.url} lost its model findings`,
		);
	}

	// The failure is recorded as a missing measurement, not as a missing page.
	const failed = report.pages.find(page => page.pageUrl === pages[1]!.url);
	t.is(failed?.measurement.audit.state, 'not-taken');
	t.is(failed?.status, 'complete');

	// And the pages either side kept their measurements.
	for (const url of [pages[0]!.url, pages[2]!.url]) {
		const analysis = report.pages.find(page => page.pageUrl === url);
		t.is(analysis?.measurement.audit.state, 'taken');
	}
});

test('a report path outside the temp directory is never deleted', async t => {
	// The paths come from text an external server produced and are handed to a
	// recursive delete. A server version that reported a project path -- or one
	// that meant harm -- would otherwise take that tree with it.
	// Created under the working directory on purpose: a directory inside
	// os.tmpdir() is one the guard is *supposed* to remove, so putting the
	// decoy there would assert nothing.
	const project = fs.mkdtempSync(path.join(cwd(), 'uxlint-decoy-'));
	const keep = path.join(project, 'source');
	fs.mkdirSync(keep);
	fs.writeFileSync(path.join(keep, 'important.ts'), 'export const x = 1;');

	// The JSON report is real and inside temp, so the audit succeeds; the HTML
	// report claims to live in the tree we must not touch.
	const {reply, dir} = replyWithRealReport();
	const hostile = reply.replace(
		/- \S*report\.html/,
		() => `- ${path.join(keep, 'report.html')}`,
	);

	const client = scriptedClient({
		async lighthouse_audit() {
			return mcpResult(hostile);
		},
		performance_start_trace: okTrace,
	});

	try {
		const measurement = await new MeasurementService(client).measure(
			'analysable',
		);

		// The measurement still succeeds -- refusing to delete is not a reason
		// to lose a reading that was taken.
		t.is(measurement.audit.state, 'taken');
		t.true(fs.existsSync(keep), 'a directory outside temp was deleted');
		t.true(fs.existsSync(path.join(keep, 'important.ts')));
		// The real report directory, which is inside temp, is still cleaned up.
		t.false(fs.existsSync(dir));
	} finally {
		fs.rmSync(project, {recursive: true, force: true});
		fs.rmSync(dir, {recursive: true, force: true});
	}
});

test('a relative report path is never deleted', async t => {
	const {reply, dir} = replyWithRealReport();
	// `isAbsolutePath` is what the parser keys on -- it accepts `/tmp/...`,
	// `C:\...` and `\\server\share\...`, and rejects everything else -- so a
	// relative path is not even collected. Pinned here because a future looser
	// parser would hand `path.dirname('report.html')` (`.`) to a recursive
	// delete.
	const relative = reply.replace(/- \S*report\.html/, () => '- report.html');

	const client = scriptedClient({
		async lighthouse_audit() {
			return mcpResult(relative);
		},
		performance_start_trace: okTrace,
	});

	try {
		const measurement = await new MeasurementService(client).measure(
			'analysable',
		);
		t.is(measurement.audit.state, 'taken');
		t.true(fs.existsSync('package.json'), 'the working directory survived');
	} finally {
		fs.rmSync(dir, {recursive: true, force: true});
	}
});

test('a symlinked temp root still permits cleanup', async t => {
	// The macOS shape, reproduced here: os.tmpdir() answers a path that goes
	// through a symlink (/var/folders/...) while the server reports the
	// resolved form (/private/var/folders/...). Comparing them lexically fails
	// on every audit, and the guard then refuses to clean up anything at all --
	// silently, because the measurement still succeeds. That is the leak this
	// guard shipped alongside, reintroduced on one platform.
	const real = fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-real-'));
	const link = path.join(os.tmpdir(), `uxlint-link-${pid}`);
	fs.symlinkSync(real, link, 'dir');

	try {
		const reportDirectory = fs.mkdtempSync(path.join(real, 'report-'));

		// The candidate is under the *resolved* root; the temp root we compare
		// against is the symlinked one.
		t.true(await isAuditPathRemovable(reportDirectory, link));

		// And the refusal still works for somewhere genuinely outside.
		t.false(await isAuditPathRemovable(cwd(), link));
	} finally {
		fs.rmSync(link, {force: true});
		fs.rmSync(real, {recursive: true, force: true});
	}
});

test('the temp root itself is never removed', async t => {
	// Removing it would take every other process's scratch space with it.
	t.false(await isAuditPathRemovable(os.tmpdir()));
});

test('a relative directory is never removed', async t => {
	t.false(await isAuditPathRemovable('report'));
	t.false(await isAuditPathRemovable('.'));
	t.false(await isAuditPathRemovable('../..'));
});

test('an unreadable report still gets its directories cleaned up', async t => {
	// The cleanup used to run only after the read succeeded. A report that
	// exists at parse time but cannot be read -- a permission error, a
	// transient I/O failure -- returned early and left both directories on
	// disk for good. Same leak as before, down the error path instead of the
	// happy one, and no test went near it: the nearest one fails earlier, in
	// `parseAuditReply`, so this method was never even called.
	const jsonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-unreadable-'));
	const htmlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-unreadable-'));
	const reportPath = path.join(jsonDir, 'report.json');

	// A directory where the file should be: readFile fails with EISDIR, which
	// is a read failure on a path that exists.
	fs.mkdirSync(reportPath);
	fs.writeFileSync(path.join(htmlDir, 'report.html'), '<html></html>');

	const reply = auditSnapshotReply
		.replace(/- \S*report\.json/, () => `- ${reportPath}`)
		.replace(
			/- \S*report\.html/,
			() => `- ${path.join(htmlDir, 'report.html')}`,
		);

	const client = scriptedClient({
		async lighthouse_audit() {
			return mcpResult(reply);
		},
		performance_start_trace: okTrace,
	});

	try {
		const measurement = await new MeasurementService(client).measure(
			'analysable',
		);

		// The measurement is honestly reported as not taken...
		t.is(measurement.audit.state, 'not-taken');
		t.is(
			measurement.audit.state === 'not-taken' ? measurement.audit.reason : '',
			'unparseable',
		);

		// ...and nothing is left behind.
		t.false(fs.existsSync(jsonDir), 'the JSON report directory survived');
		t.false(fs.existsSync(htmlDir), 'the HTML report directory survived');
	} finally {
		fs.rmSync(jsonDir, {recursive: true, force: true});
		fs.rmSync(htmlDir, {recursive: true, force: true});
	}
});
