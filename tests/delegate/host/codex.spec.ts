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
