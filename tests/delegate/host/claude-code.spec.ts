import test from 'ava';
import {claudeCode} from '../../../source/delegate/host/claude-code.js';
import {judgementToolNames} from '../../../source/delegate/host/types.js';
import {sessionEnvironmentVariable} from '../../../source/models/delegate.js';

const launch = () =>
	claudeCode.buildLaunch({
		sessionDirectory: '/tmp/uxlint-delegate-abc',
		prompt: 'Judge these pages.',
		server: {
			command: '/usr/bin/node',
			args: ['/opt/uxlint/cli.js', 'mcp-serve'],
		},
	});

test('the command runs Claude Code in print mode with a machine-readable result', t => {
	const built = launch();

	t.is(built.command, 'claude');
	t.true(built.args.includes('-p'));
	t.true(built.args.includes('--output-format'));
	t.is(built.args[built.args.indexOf('--output-format') + 1], 'json');
});

// --allowedTools is declared variadic, so it consumes every following
// positional argument. A prompt placed after it is parsed as another tool name
// and Claude Code then exits saying no input was provided. This is not a
// stylistic preference; it is the failure this adapter exists downstream of.
test('the prompt travels on stdin rather than as a trailing argument', t => {
	const built = launch();

	t.is(built.stdin, 'Judge these pages.');
	t.false(
		built.args.includes('Judge these pages.'),
		'a trailing prompt would be swallowed by --allowedTools',
	);
});

test('the judgement server is injected as an argument, carrying the session', t => {
	const built = launch();
	const index = built.args.indexOf('--mcp-config');

	t.not(index, -1);

	const config = JSON.parse(built.args[index + 1]!) as {
		mcpServers: Record<
			string,
			{command: string; args: string[]; env: Record<string, string>}
		>;
	};

	t.is(config.mcpServers['uxlint']?.command, '/usr/bin/node');
	t.deepEqual(config.mcpServers['uxlint']?.args, [
		'/opt/uxlint/cli.js',
		'mcp-serve',
	]);
	t.is(
		config.mcpServers['uxlint']?.env[sessionEnvironmentVariable],
		'/tmp/uxlint-delegate-abc',
	);
});

test('the session sees only uxlint, not the developer other servers', t => {
	t.true(launch().args.includes('--strict-mcp-config'));
});

test('exactly the five judgement tools are pre-approved', t => {
	const built = launch();
	const index = built.args.indexOf('--allowedTools');

	t.not(index, -1);

	t.deepEqual(
		built.args[index + 1]!.split(',').sort(),
		judgementToolNames.map(name => `mcp__uxlint__${name}`).sort(),
	);
});

// FR-012: the posture must not be weakened by the developer's own settings.
// --restricted is what makes that true rather than hoped for: it removes the
// command-running tools, confines file access to the working directory,
// refuses bypassPermissions, and ignores user, project and local settings.
test('the session is read-only, and the developer settings cannot widen it', t => {
	const built = launch();

	t.true(built.args.includes('--restricted'));
	t.false(built.args.includes('--dangerously-skip-permissions'));
	t.false(built.args.includes('--permission-mode'));
});

test('the session directory reaches the server through the environment too', t => {
	t.is(launch().env[sessionEnvironmentVariable], '/tmp/uxlint-delegate-abc');
});
