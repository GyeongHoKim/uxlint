import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {auditReportJson} from '../fixtures/lighthouse-report.js';
import {
	auditSnapshotReply,
	malformedAuditReplies,
} from '../fixtures/lighthouse-reply.js';
import {traceWithNavigationReply} from '../fixtures/trace-reply.js';
import {mcpError, mcpResult} from '../fixtures/mcp-result.js';
import {
	MeasurementService,
	type MeasurementClient,
} from '../../source/services/measurement.js';

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
