import test from 'ava';
import {hostAdapters} from '../../../source/delegate/host/index.js';
import {
	assertReadOnly,
	readOnlyPosture,
} from '../../../source/delegate/host/types.js';

const context = {
	sessionDirectory: '/tmp/uxlint-delegate-abc',
	prompt: 'Judge these pages.',
	server: {command: '/usr/bin/node', args: ['/opt/uxlint/cli.js', 'mcp-serve']},
};

// FR-012 is a property of every adapter, present and future, not of the one
// that happened to be written first. Iterating the registry is what makes a
// new adapter inherit the obligation instead of quietly opting out of it.
for (const adapter of hostAdapters) {
	test(`${adapter.id} builds a read-only launch`, t => {
		t.notThrows(() => {
			assertReadOnly(adapter.id, adapter.buildLaunch(context));
		});
	});

	test(`${adapter.id} never asks for write access`, t => {
		const {args} = adapter.buildLaunch(context);
		const forbidden = readOnlyPosture[adapter.id].forbidden.filter(flag =>
			args.includes(flag),
		);

		t.deepEqual(forbidden, []);
	});

	test(`${adapter.id} carries the session in its environment`, t => {
		const {env} = adapter.buildLaunch(context);
		t.is(env['UXLINT_DELEGATE_SESSION'], context.sessionDirectory);
	});
}

test('the invariant refuses a launch that dropped its read-only flag', t => {
	const [adapter] = hostAdapters;
	const posture = readOnlyPosture[adapter!.id];
	const built = adapter!.buildLaunch(context);

	const stripped = {
		...built,
		args: built.args.filter(argument => !posture.required.includes(argument)),
	};

	t.throws(() => {
		assertReadOnly(adapter!.id, stripped);
	});
});

test('the invariant refuses a launch that added a write-enabling flag', t => {
	const [adapter] = hostAdapters;
	const posture = readOnlyPosture[adapter!.id];
	const built = adapter!.buildLaunch(context);

	t.true(
		posture.forbidden.length > 0,
		`${adapter!.id} declares no forbidden flag, so there is nothing to add`,
	);

	t.throws(() => {
		assertReadOnly(adapter!.id, {
			...built,
			args: [...built.args, posture.forbidden[0]!],
		});
	});
});

// `--flag value` and `--flag=value` are the same instruction to an argument
// parser, so a posture that only looked for the bare token would wave through a
// launch that had written the forbidden flag the other way.
test('the invariant refuses a write-enabling flag written as --flag=value', t => {
	const [adapter] = hostAdapters;
	const posture = readOnlyPosture[adapter!.id];
	const built = adapter!.buildLaunch(context);

	t.throws(() => {
		assertReadOnly(adapter!.id, {
			...built,
			args: [...built.args, `${posture.forbidden[0]!}=on`],
		});
	});
});

// An argument parser that takes the last value wins is the normal case, so a
// posture satisfied by the first occurrence is satisfied by a launch whose
// effective sandbox is whatever came after it.
test('the invariant refuses a repeated flag whose later value is not the required one', t => {
	const codex = hostAdapters.find(adapter => adapter.id === 'codex');
	const built = codex!.buildLaunch(context);

	t.throws(() => {
		assertReadOnly(codex!.id, {
			...built,
			args: [...built.args, '-s', 'danger-full-access'],
		});
	});

	t.throws(() => {
		assertReadOnly(codex!.id, {
			...built,
			args: [...built.args, '-s=danger-full-access'],
		});
	});
});

test('every supported host agent has a posture declared for it', t => {
	for (const adapter of hostAdapters) {
		t.truthy(
			readOnlyPosture[adapter.id],
			`${adapter.id} has no read-only posture, so nothing constrains it`,
		);
	}
});
