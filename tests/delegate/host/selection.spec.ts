import test from 'ava';
import {selectHostAgent} from '../../../source/delegate/host/index.js';
import type {
	HostAgentAdapter,
	HostAvailability,
} from '../../../source/delegate/host/types.js';
import type {DelegateHostId} from '../../../source/models/delegate.js';

/**
 * An adapter that reports the availability it was told to.
 */
function stub(
	id: DelegateHostId,
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

const ready = (id: DelegateHostId) => stub(id, {kind: 'ready'});
const missing = (id: DelegateHostId) =>
	stub(id, {kind: 'not-installed', message: `uxlint: ${id} is not installed.`});

test('the single installed agent is used, and the run says which', async t => {
	const selection = await selectHostAgent(undefined, [
		ready('claude-code'),
		missing('codex'),
		missing('cursor-agent'),
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
		missing('cursor-agent'),
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
		missing('cursor-agent'),
	]);

	t.is(selection.kind, 'unavailable');
	if (selection.kind === 'unavailable') {
		t.regex(selection.message, /claude-code/);
		t.regex(selection.message, /codex/);
		t.regex(selection.message, /cursor-agent/);
	}
});
