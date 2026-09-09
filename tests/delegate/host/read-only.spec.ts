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

	t.throws(() => {
		assertReadOnly(adapter!.id, {
			...built,
			args: [...built.args, posture.forbidden[0]!],
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
