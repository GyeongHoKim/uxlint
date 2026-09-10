import test from 'ava';
import {codex} from '../../../source/delegate/host/codex.js';
import {sessionEnvironmentVariable} from '../../../source/models/delegate.js';

const launch = () =>
	codex.buildLaunch({
		sessionDirectory: '/tmp/uxlint-delegate-abc',
		prompt: 'Judge these pages.',
		server: {
			command: '/usr/bin/node',
			args: ['/opt/uxlint/cli.js', 'mcp-serve'],
		},
	});

// Codex has no print flag. `-p` is `--profile`, and passing it expecting print
// mode selects a configuration profile that does not exist. Non-interactive
// execution is the `exec` subcommand.
test('the command runs the exec subcommand and never a print flag', t => {
	const built = launch();

	t.is(built.command, 'codex');
	t.is(built.args[0], 'exec');
	t.false(built.args.includes('-p'), '-p on codex is --profile, not --print');
	t.false(built.args.includes('--print'));
});

test('the sandbox is read-only', t => {
	const built = launch();
	const index = built.args.indexOf('-s');

	t.not(index, -1);
	t.is(built.args[index + 1], 'read-only');
});

test('the judgement server is injected inline, so no config file is written', t => {
	const built = launch();
	const index = built.args.indexOf('-c');

	t.not(index, -1);

	const override = built.args[index + 1]!;

	t.regex(override, /^mcp_servers\.uxlint=/);
	t.regex(override, /command\s*=\s*"\/usr\/bin\/node"/);
	t.regex(override, /"mcp-serve"/);
	t.regex(
		override,
		new RegExp(
			String.raw`${sessionEnvironmentVariable}\s*=\s*"/tmp/uxlint-delegate-abc"`,
		),
	);
});

// Without this the injection is present and useless. `codex exec` runs with
// `approval_policy = never`, under which Codex auto-approves an MCP call only
// when the sandbox has full disk write access -- the one thing `-s read-only`
// exists to refuse. A live run exited 0 having judged nothing, every call
// having failed with "MCP tool call requires approval, but approval policy is
// never". The approval is scoped to this server, and the sandbox is untouched.
test('the server pre-approves its own tools, which read-only mode otherwise blocks', t => {
	const built = launch();
	const override = built.args[built.args.indexOf('-c') + 1]!;

	t.regex(override, /default_tools_approval_mode\s*=\s*"approve"/);
	t.is(built.args[built.args.indexOf('-s') + 1], 'read-only');
});

// Observed live: without this, Codex refuses to start in any directory it does
// not consider trusted, the session ends in about a second having judged
// nothing, and the run still exits 0 with every page unjudged. The check guards
// un-versioned work against edits, and `-s read-only` already denies those.
test('the launch skips the trusted-directory check that would otherwise stop it', t => {
	const built = launch();

	t.true(built.args.includes('--skip-git-repo-check'));
	t.is(built.args[built.args.indexOf('-s') + 1], 'read-only');
});

test('the session directory reaches the server through the environment too', t => {
	t.is(launch().env[sessionEnvironmentVariable], '/tmp/uxlint-delegate-abc');
});

test('the prompt is the trailing argument, which codex accepts', t => {
	const built = launch();

	t.is(built.args.at(-1), 'Judge these pages.');
	t.is(built.stdin, undefined);
});

test('nothing in the launch bypasses the sandbox', t => {
	const {args} = launch();

	t.false(args.includes('--dangerously-bypass-approvals-and-sandbox'));
	t.false(args.includes('--approve-for-me'));
	t.false(args.includes('--dangerously-bypass-hook-trust'));
});
