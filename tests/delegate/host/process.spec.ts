import process from 'node:process';
import test from 'ava';
import {
	detectBinary,
	probeAuthenticated,
	runLaunch,
} from '../../../source/delegate/host/process.js';
import type {HostLaunch} from '../../../source/delegate/host/types.js';

/**
 * A launch that runs the current Node binary with the given script.
 *
 * Node stands in for a host agent because it is guaranteed present and its
 * exit code and stdin handling are the two things this module has to get
 * right.
 */
const nodeLaunch = (script: string, stdin?: string): HostLaunch => ({
	command: process.execPath,
	args: ['-e', script],
	env: {},
	...(stdin !== undefined && {stdin}),
});

test('a host agent that exits cleanly reports completion', async t => {
	const outcome = await runLaunch(nodeLaunch('process.exit(0)'));

	t.is(outcome.terminated, 'completed');
	t.is(outcome.exitCode, 0);
	t.is(outcome.stderrSummary, undefined);
});

test('a non-zero exit is a failure, and its stderr explains it', async t => {
	const outcome = await runLaunch(
		nodeLaunch('console.error("codex: not logged in"); process.exit(3)'),
	);

	t.is(outcome.terminated, 'failed');
	t.is(outcome.exitCode, 3);
	t.regex(outcome.stderrSummary!, /not logged in/);
});

// Claude Code cannot take its prompt as an argument, so a launch that says it
// goes on stdin has to actually deliver it there.
test('the prompt reaches the agent on stdin when the launch asks for that', async t => {
	const outcome = await runLaunch(
		nodeLaunch(
			'let input = ""; process.stdin.on("data", d => { input += d; }); process.stdin.on("end", () => process.exit(input.trim() === "judge these pages" ? 0 : 9));',
			'judge these pages',
		),
	);

	t.is(outcome.exitCode, 0, 'the child saw the prompt on stdin');
});

test('an agent given no stdin still sees the stream close rather than hanging', async t => {
	const outcome = await runLaunch(
		nodeLaunch('process.stdin.on("end", () => process.exit(0));'),
	);

	t.is(outcome.terminated, 'completed');
});

// A bound handed to a callee is not a bound if the callee declines to honour
// it, so the process is killed rather than asked to stop.
test('an agent that outlives its bound is killed and reported as timed out', async t => {
	const started = Date.now();
	const outcome = await runLaunch(
		nodeLaunch('setTimeout(() => process.exit(0), 60000)'),
		{timeoutMs: 200},
	);

	t.is(outcome.terminated, 'timed-out');
	t.true(Date.now() - started < 10_000, 'the bound settled it, not the child');
});

// SIGTERM is a request. An agent that handles it and carries on would hold
// the run open indefinitely, so the request is followed by SIGKILL.
test('an agent that ignores SIGTERM is killed outright after a grace period', async t => {
	const started = Date.now();
	const outcome = await runLaunch(
		nodeLaunch('process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);'),
		{timeoutMs: 500, killGraceMs: 200},
	);

	t.is(outcome.terminated, 'timed-out');
	t.true(Date.now() - started < 5000, 'SIGKILL ended it, not the child');
});

test('an aborted signal ends the agent the way its bound would', async t => {
	const controller = new AbortController();
	const pending = runLaunch(nodeLaunch('setInterval(() => {}, 1000);'), {
		signal: controller.signal,
	});

	setTimeout(() => {
		controller.abort();
	}, 200);

	const outcome = await pending;
	t.is(outcome.terminated, 'timed-out');
});

test('a command that does not exist is a failure, not a crash', async t => {
	const outcome = await runLaunch({
		command: 'uxlint-no-such-agent',
		args: [],
		env: {},
	});

	t.is(outcome.terminated, 'failed');
	t.truthy(outcome.stderrSummary);
});

test('a missing binary is reported as not installed, with a way forward', t => {
	const availability = detectBinary('uxlint-no-such-agent', {
		installHint: 'Install it from somewhere.',
		authHint: 'Sign in first.',
	});

	t.is(availability.kind, 'not-installed');
	if (availability.kind === 'not-installed') {
		t.regex(availability.message, /Install it from somewhere/);
	}
});

test('a binary that answers --version is available', t => {
	t.is(
		detectBinary(process.execPath, {
			installHint: 'unused',
			authHint: 'unused',
		}).kind,
		'ready',
	);
});

test('the sign-in probe reports what the probe command reported', t => {
	t.true(probeAuthenticated(process.execPath, ['-e', 'process.exit(0)']));
	t.false(probeAuthenticated(process.execPath, ['-e', 'process.exit(1)']));
	t.false(probeAuthenticated('uxlint-no-such-agent', ['status']));
});
