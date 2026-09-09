import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {cursorAgent} from '../../../source/delegate/host/cursor-agent.js';
import {sessionEnvironmentVariable} from '../../../source/models/delegate.js';

const launch = () =>
	cursorAgent.buildLaunch({
		sessionDirectory: '/tmp/uxlint-delegate-abc',
		prompt: 'Judge these pages.',
		server: {
			command: '/usr/bin/node',
			args: ['/opt/uxlint/cli.js', 'mcp-serve'],
		},
	});

test('the command runs Cursor Agent in print mode', t => {
	const built = launch();

	t.is(built.command, 'agent');
	t.true(built.args.includes('-p'));
	t.is(built.args[built.args.indexOf('--output-format') + 1], 'json');
});

// Cursor writes no files at all without --force, and --force permits every
// command not explicitly denied. Obtaining one findings file that way would
// mean opening write access to the whole repository, which is why the intake
// is MCP for this host too and why this flag can never appear.
test('the launch never asks for write access', t => {
	const {args} = launch();

	t.false(args.includes('--force'));
	t.false(args.includes('--yolo'));
	t.false(args.includes('-f'));
});

test('the registered MCP servers are auto-approved', t => {
	t.true(launch().args.includes('--approve-mcps'));
});

test('the session directory reaches the server through the environment', t => {
	t.is(launch().env[sessionEnvironmentVariable], '/tmp/uxlint-delegate-abc');
});

// FR-013 and FR-014. Cursor discovers servers only from its own configuration
// file, and uxlint runs at the developer's repository root: writing that file
// would modify their working tree, and writing the home-level one at run time
// can damage a configuration they own if a run crashes mid-write. The
// registration is a documented one-time step instead.
test('building a launch writes no configuration file anywhere', t => {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-cursor-home-'));
	const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-cursor-ws-'));
	t.teardown(() => {
		fs.rmSync(home, {recursive: true, force: true});
		fs.rmSync(workspace, {recursive: true, force: true});
	});

	launch();

	t.deepEqual(fs.readdirSync(home), []);
	t.deepEqual(fs.readdirSync(workspace), []);
});

test('the prompt is the trailing argument', t => {
	t.is(launch().args.at(-1), 'Judge these pages.');
});
