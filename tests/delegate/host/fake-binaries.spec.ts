/**
 * The three adapters against executables that behave the way each CLI's
 * documentation says it does.
 *
 * Every other delegate test removes the process boundary. These keep it: the
 * real adapter builds the real command line, `spawn` finds a `claude`, `codex`
 * or `agent` on PATH, and that executable starts the real judgement
 * server as its own child over stdio, exactly as the host agents do. What the
 * fakes prove is that the command line uxlint builds is one the documented
 * CLI would accept and act on; what they cannot prove is that the
 * documentation still matches the binaries, which only a real run can.
 */

import fs, {promises as fsPromises} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import test, {type ExecutionContext} from 'ava';
import {claudeCode} from '../../../source/delegate/host/claude-code.js';
import {codex} from '../../../source/delegate/host/codex.js';
import {cursorAgent} from '../../../source/delegate/host/cursor-agent.js';
import {selectHostAgent} from '../../../source/delegate/host/index.js';
import {DelegationSession} from '../../../source/delegate/session.js';
import {
	judgementToolNames,
	type HostLaunchContext,
} from '../../../source/delegate/host/types.js';
import {runDelegatedAnalysis} from '../../../source/delegate/runner.js';
import {sessionEnvironmentVariable} from '../../../source/models/delegate.js';
import {ReportBuilder} from '../../../source/services/report-builder.js';
import {
	configFor,
	fakeBrowser,
	readyVerdict,
	temporaryDirectory,
} from '../helpers.js';
import {installFakeHosts} from './fake-hosts.js';

/** The same entry point the runner resolves for the judgement server. */
const cliEntryPoint = fileURLToPath(
	new URL('../../../source/cli.js', import.meta.url),
);

/**
 * A launch context for tests that drive an adapter's `run` directly.
 *
 * Backed by a real session, because the fake starts a real server and that
 * server refuses to serve a session that does not exist.
 *
 * @param t - The test, for teardown
 * @returns A context over one page
 */
async function context(t: ExecutionContext): Promise<HostLaunchContext> {
	const session = await DelegationSession.create({
		hostAgent: 'claude-code',
		pages: [
			{
				pageUrl: 'https://example.com/',
				features: 'Landing page',
				persona: 'A first-time visitor on a phone',
				snapshot: 'button "Sign up"',
				measurementDigest: 'No violations measured.',
			},
		],
	});
	t.teardown(async () => session.dispose());

	return {
		sessionDirectory: session.directory,
		prompt: 'Judge these pages.',
		server: {command: process.execPath, args: [cliEntryPoint, 'mcp-serve']},
	};
}

const silent = {
	async runPreflight() {
		return readyVerdict;
	},
	emitVerdict() {
		// Nothing is printed during a test.
	},
};

test.serial(
	'Claude Code: the run reaches the judgement server over stdio, and the report carries what arrived',
	async t => {
		const hosts = installFakeHosts(t, {
			installed: ['claude-code'],
			script: {
				pages: [
					{findings: 2, complete: true},
					{findings: 1, complete: true},
				],
			},
		});
		const output = path.join(temporaryDirectory(t.teardown), 'report.md');

		const exitCode = await runDelegatedAnalysis(configFor(2, output), {
			...silent,
			client: fakeBrowser(),
			builder: new ReportBuilder(fsPromises),
			adapter: claudeCode,
		});

		t.is(exitCode, 0);

		const report = await fsPromises.readFile(output, 'utf8');
		t.regex(report, /Judgement 2 on https:\/\/example\.com\/page-1/);
		t.regex(report, /Judgement 1 on https:\/\/example\.com\/page-2/);

		const trace = hosts.trace();
		t.is(trace.promptSource, 'stdin');
		t.regex(trace.prompt, /There are 2 pages/);
		t.deepEqual([...trace.tools].sort(), [...judgementToolNames].sort());
		t.is(trace.server?.command, process.execPath);
		t.is(trace.server?.args.at(-1), 'mcp-serve');
		t.truthy(trace.server?.env[sessionEnvironmentVariable]);
		t.false(trace.wroteCanary);
		t.deepEqual(trace.protocolErrors, []);
	},
);

// The developer's own allow rules are the configuration FR-012 says must not
// widen the posture. Restricted mode loads only managed settings, so a
// `permissions.allow` granting Edit changes nothing about this launch.
test.serial(
	'Claude Code: the developer settings that pre-approve edits do not make the run writable',
	async t => {
		const hosts = installFakeHosts(t, {
			installed: ['claude-code'],
			claudeSettings: {permissions: {allow: ['Edit', 'Write', 'Bash']}},
		});
		const output = path.join(temporaryDirectory(t.teardown), 'report.md');

		await runDelegatedAnalysis(configFor(1, output), {
			...silent,
			client: fakeBrowser(),
			builder: new ReportBuilder(fsPromises),
			adapter: claudeCode,
		});

		t.false(hosts.trace().wroteCanary);
		t.false(fs.existsSync(hosts.canaryPath));
	},
);

// The same settings without --restricted would apply. This is what makes the
// canary a measurement rather than a constant: the fake does write when the
// launch permits it, so the assertion above is not vacuous.
test.serial(
	'Claude Code: without --restricted, those same settings would have let the agent write',
	async t => {
		const hosts = installFakeHosts(t, {
			installed: ['claude-code'],
			claudeSettings: {permissions: {allow: ['Edit']}},
		});
		const launch = claudeCode.buildLaunch(await context(t));

		const outcome = await claudeCode.run({
			...launch,
			args: launch.args.filter(argument => argument !== '--restricted'),
		});

		t.is(outcome.terminated, 'completed');
		t.true(hosts.trace().wroteCanary);
		t.true(fs.existsSync(hosts.canaryPath));
	},
);

// The failure the adapter's stdin choice exists downstream of. --allowedTools
// is variadic, so a prompt following its list is read as one more tool name
// and the run ends with no input. Reproduced in the arrangement it was
// observed in: the prompt directly after the tool list.
test.serial(
	'Claude Code: a prompt placed after the --allowedTools list is swallowed, as observed',
	async t => {
		installFakeHosts(t, {installed: ['claude-code']});
		const launch = claudeCode.buildLaunch(await context(t));
		const afterToolList = launch.args.indexOf('--allowedTools') + 2;
		const args = [...launch.args];
		args.splice(afterToolList, 0, 'Judge these pages.');

		const outcome = await claudeCode.run({...launch, args, stdin: undefined});

		t.is(outcome.terminated, 'failed');
		t.regex(outcome.stderrSummary!, /Input must be provided/);
	},
);

test.serial(
	'Codex: the inline TOML override parses, and the server it names carries the session',
	async t => {
		const hosts = installFakeHosts(t, {
			installed: ['codex'],
			script: {pages: [{findings: 1, note: true, complete: true}]},
		});
		const output = path.join(temporaryDirectory(t.teardown), 'report.md');

		const exitCode = await runDelegatedAnalysis(configFor(1, output), {
			...silent,
			client: fakeBrowser(),
			builder: new ReportBuilder(fsPromises),
			adapter: codex,
		});

		t.is(exitCode, 0);
		t.regex(
			await fsPromises.readFile(output, 'utf8'),
			/Judgement 1 on https:\/\/example\.com\/page-1/,
		);

		const trace = hosts.trace();
		t.is(trace.promptSource, 'argument');
		t.is(trace.server?.source, '--config');
		t.is(trace.server?.command, process.execPath);
		t.truthy(trace.server?.env[sessionEnvironmentVariable]);
		t.deepEqual([...trace.tools].sort(), [...judgementToolNames].sort());
		t.deepEqual(
			trace.calls.map(call => call.name),
			[
				'listPages',
				'getPageEvidence',
				'addFinding',
				'noteOnMeasuredIssues',
				'completePageAnalysis',
			],
		);
		t.false(trace.wroteCanary);
		t.deepEqual(trace.protocolErrors, []);
	},
);

// FR-016. Codex is the one host that will say whether it is signed in, and the
// adapter asks before a browser is started.
test.serial(
	'Codex: an installed but signed-out codex is reported as such before anything runs',
	async t => {
		installFakeHosts(t, {installed: ['codex'], codexSignedIn: false});

		const selection = await selectHostAgent('codex');

		t.is(selection.kind, 'unavailable');
		if (selection.kind === 'unavailable') {
			t.regex(selection.message, /codex login/);
		}
	},
);

test.serial(
	'Cursor Agent: the registration documented in the README is enough for a run',
	async t => {
		const hosts = installFakeHosts(t, {
			installed: ['cursor-agent'],
			cursorRegistration: {
				command: process.execPath,
				args: [cliEntryPoint, 'mcp-serve'],
			},
		});
		const output = path.join(temporaryDirectory(t.teardown), 'report.md');

		const exitCode = await runDelegatedAnalysis(configFor(2, output), {
			...silent,
			client: fakeBrowser(),
			builder: new ReportBuilder(fsPromises),
			adapter: cursorAgent,
		});

		t.is(exitCode, 0);
		t.regex(
			await fsPromises.readFile(output, 'utf8'),
			/Judgement 1 on https:\/\/example\.com\/page-2/,
		);

		const trace = hosts.trace();
		t.is(trace.server?.source, 'home .cursor/mcp.json');
		// The registration carries no env. The session reaches the server only
		// because the launch put it in the agent's own environment.
		t.deepEqual(trace.server?.env, {});
		t.is(trace.calls.filter(call => call.name === 'addFinding').length, 2);
		t.false(trace.wroteCanary);
		t.deepEqual(trace.protocolErrors, []);
	},
);

// Cursor cannot be handed a server at launch. Without the one-time
// registration the run still completes, and every page says why it is
// unjudged; the report, not the exit code, is where that shows.
test.serial(
	'Cursor Agent: with no registration the agent judges nothing, and the report says so',
	async t => {
		const hosts = installFakeHosts(t, {installed: ['cursor-agent']});
		const output = path.join(temporaryDirectory(t.teardown), 'report.md');
		const builder = new ReportBuilder(fsPromises);

		await runDelegatedAnalysis(configFor(2, output), {
			...silent,
			client: fakeBrowser(),
			builder,
			adapter: cursorAgent,
		});

		const trace = hosts.trace();
		t.is(trace.server, undefined);
		t.regex(trace.skipped!, /\.cursor\/mcp\.json/);
		t.deepEqual(trace.calls, []);

		const report = builder.generateFinalReport();
		t.is(report.pages.length, 2);
		for (const page of report.pages) {
			t.regex(page.error ?? '', /judgement|session/i);
		}
	},
);

test.serial(
	'selection: the one agent actually on PATH is the one chosen',
	async t => {
		installFakeHosts(t, {installed: ['codex']});

		const selection = await selectHostAgent(undefined);

		t.is(selection.kind, 'selected');
		if (selection.kind === 'selected') {
			t.is(selection.adapter.id, 'codex');
		}
	},
);

test.serial(
	'selection: three agents on PATH and none named stops the run',
	async t => {
		installFakeHosts(t, {installed: ['claude-code', 'codex', 'cursor-agent']});

		const selection = await selectHostAgent(undefined);

		t.is(selection.kind, 'unavailable');
		if (selection.kind === 'unavailable') {
			t.regex(selection.message, /--host-agent/);
		}
	},
);
