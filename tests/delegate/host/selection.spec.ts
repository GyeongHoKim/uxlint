import test from 'ava';
import {selectHostAgent} from '../../../source/delegate/host/index.js';
import type {
	HostAgentAdapter,
	HostAvailability,
} from '../../../source/delegate/host/types.js';
import type {LaunchableHostId} from '../../../source/models/delegate.js';

/**
 * An adapter that reports the availability it was told to.
 */
function stub(
	id: LaunchableHostId,
	availability: HostAvailability,
): HostAgentAdapter {
	return {
		id,
		binary: id,
		async detect() {
			return availability;
		},
		buildLaunch() {
			return {command: id, args: [], env: {}};
		},
		async run() {
			return {terminated: 'completed' as const, exitCode: 0};
		},
	};
}

const ready = (id: LaunchableHostId) => stub(id, {kind: 'ready'});
const missing = (id: LaunchableHostId) =>
	stub(id, {kind: 'not-installed', message: `uxlint: ${id} is not installed.`});

test('the single installed agent is used, and the run says which', async t => {
	const selection = await selectHostAgent(undefined, [
		ready('claude-code'),
		missing('codex'),
	]);

	t.is(selection.kind, 'selected');
	if (selection.kind === 'selected') {
		t.is(selection.adapter.id, 'claude-code');
		t.regex(selection.message, /claude-code/);
	}
});

// FR-015. Which agent judges a review changes the review, so it is not a
// decision to make on the developer's behalf.
test('several installed and none named stops rather than picking one', async t => {
	const selection = await selectHostAgent(undefined, [
		ready('claude-code'),
		ready('codex'),
	]);

	t.is(selection.kind, 'unavailable');
	if (selection.kind === 'unavailable') {
		t.regex(selection.message, /claude-code/);
		t.regex(selection.message, /codex/);
		t.regex(selection.message, /--host-agent/);
	}
});

test('a named agent is used even when others are available', async t => {
	const selection = await selectHostAgent('codex', [
		ready('claude-code'),
		ready('codex'),
	]);

	t.is(selection.kind, 'selected');
	if (selection.kind === 'selected') {
		t.is(selection.adapter.id, 'codex');
	}
});

test('a named agent that is not installed is refused, naming the cause', async t => {
	const selection = await selectHostAgent('codex', [
		ready('claude-code'),
		missing('codex'),
	]);

	t.is(selection.kind, 'unavailable');
	if (selection.kind === 'unavailable') {
		t.regex(selection.message, /codex is not installed/);
	}
});

test('a named agent that is not signed in names authentication, not emptiness', async t => {
	const selection = await selectHostAgent('claude-code', [
		stub('claude-code', {
			kind: 'not-authenticated',
			message: 'uxlint: claude is installed but not signed in. Run `claude`.',
		}),
	]);

	t.is(selection.kind, 'unavailable');
	if (selection.kind === 'unavailable') {
		t.regex(selection.message, /signed in/);
	}
});

test('an unknown agent name is refused, and the refusal lists the supported ones', async t => {
	const selection = await selectHostAgent('aider', [ready('claude-code')]);

	t.is(selection.kind, 'unavailable');
	if (selection.kind === 'unavailable') {
		t.regex(selection.message, /aider/);
		t.regex(selection.message, /claude-code/);
	}
});

test('no supported agent installed names them all and how to get one', async t => {
	const selection = await selectHostAgent(undefined, [
		missing('claude-code'),
		missing('codex'),
	]);

	t.is(selection.kind, 'unavailable');
	if (selection.kind === 'unavailable') {
		t.regex(selection.message, /claude-code/);
		t.regex(selection.message, /codex/);
	}
});

// Cursor Agent has no launcher adapter, and the reason is not that nobody wrote
// one. A live run showed `agent -p` will not start without workspace trust, that
// Cursor gives an MCP server child none of its own environment so a per-run
// session cannot reach it, and that no flag combination both submits findings
// and refuses writes. Keeping an adapter would mean asserting a read-only
// posture the run disproved.
test('cursor-agent stops the run and names the route that does work', async t => {
	const selection = await selectHostAgent('cursor-agent', [
		ready('claude-code'),
		ready('codex'),
	]);

	t.is(selection.kind, 'unavailable');
	if (selection.kind === 'unavailable') {
		// Not "unsupported": the identifier is still accepted, because a developer
		// following the old README should get an explanation rather than a parse
		// error.
		t.notRegex(selection.message, /not a supported host agent/);
		t.regex(selection.message, /skill/i);
		t.regex(selection.message, /cursor-agent/);
	}
});

// It has to stop before a browser is opened, or the explanation costs a full
// navigation and measurement sweep first.
test('cursor-agent is refused by selection, which runs before any capture', async t => {
	let detected = false;

	const selection = await selectHostAgent('cursor-agent', [
		{
			...ready('claude-code'),
			async detect() {
				detected = true;
				return {kind: 'ready' as const};
			},
		},
	]);

	t.is(selection.kind, 'unavailable');
	t.false(detected, 'no adapter is probed for a host that has no adapter');
});
