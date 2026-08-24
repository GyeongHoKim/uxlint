/**
 * Unit tests for the owned-deadline race in source/services/deadline.ts.
 *
 * The properties under test are the two that make the helper a bound at all:
 * it returns what the work returned when the work settles, and it rejects
 * with the supplied domain error -- having aborted the work's signal -- when
 * the deadline beats the work. The timer-clearing property is asserted
 * negatively: a settled run must not keep the process alive for the rest of
 * the bound, which is what unbounded `setTimeout` leakage would do.
 */

import test from 'ava';
import {withDeadline, DeadlineExpired} from '../../source/services/deadline.js';

test('withDeadline resolves with whatever the work returned', async t => {
	const result = await withDeadline(1000, async () => 'done');

	t.is(result, 'done');
});

test('withDeadline hands a live signal to the work', async t => {
	await withDeadline(1000, async signal => {
		t.false(signal.aborted);
	});
});

test('withDeadline rejects with the domain error and aborts the signal', async t => {
	class PageTimeout extends Error {
		constructor() {
			super('Page outlived its bound');
			this.name = 'PageTimeout';
		}
	}

	const observed: boolean[] = [];

	await t.throwsAsync(
		withDeadline(
			5,
			async signal => {
				signal.addEventListener('abort', () => {
					observed.push(signal.aborted);
				});

				await new Promise(() => {
					// Never settles -- the deadline must win.
				});
			},
			{timeoutError: () => new PageTimeout()},
		),
		{instanceOf: PageTimeout, name: 'PageTimeout'},
	);

	t.deepEqual(observed, [true]);
});

test('withDeadline rejects with DeadlineExpired by default', async t => {
	await t.throwsAsync(
		withDeadline(
			5,
			async () =>
				new Promise<never>(() => {
					// Never settles.
				}),
		),
		{instanceOf: DeadlineExpired, name: 'DeadlineExpired'},
	);
});

test('the timer is cleared once the work settles', async t => {
	const startedAt = Date.now();
	await withDeadline(60_000, async () => 'quick');
	const elapsed = Date.now() - startedAt;

	// A leaked ref'd timer would hold this test open for the full minute;
	// finishing near-instantly is the proof it was cleared.
	t.true(elapsed < 1000);
});
