/**
 * Sole-pending-work proof for the owned page bound (008 T011 · FR-008 · US2-4).
 *
 * Run with plain node against the built output:
 *
 *     node scripts/page-bound-solo-check.mjs
 *
 * It starts the owned-deadline race around a promise that NEVER settles, and
 * nothing else keeps the event loop alive. This is the exact configuration
 * where an `AbortSignal.timeout` -- whose internal timer is unref'd -- has
 * been observed to silently never fire: the process just exits. The owned
 * timer is ref'd, so the deadline MUST fire and the rejection MUST surface.
 *
 * Exit code IS the assertion: 0 only when the bound fired, 1 when it did not
 * (or when anything else went wrong), so the script can be run as a CI step
 * as it stands.
 *
 * Expected output on success ends with exactly one line:
 *     BOUND FIRED as the sole pending handle: PageBoundExceeded
 */

import {withDeadline} from '../dist/source/services/deadline.js';

class PageBoundExceeded extends Error {
	constructor() {
		super('Page analysis exceeded its time bound');
		this.name = 'PageBoundExceeded';
	}
}

try {
	await withDeadline(
		50,
		async () =>
			new Promise(() => {
				// The bounded work never settles. No handles, no I/O.
			}),
		{
			timeoutError: () => new PageBoundExceeded(),
		},
	);

	console.log('UNREACHABLE: the race resolved without the bound firing');
	process.exitCode = 1;
} catch (error) {
	if (error instanceof Error && error.name === 'PageBoundExceeded') {
		console.log('BOUND FIRED as the sole pending handle:', error.name);
		process.exitCode = 0;
	} else {
		console.log('WRONG REJECTION:', error);
		process.exitCode = 1;
	}
}
