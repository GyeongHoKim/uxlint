/**
 * A time bound this process actually owns.
 *
 * @packageDocumentation
 */

/**
 * Raised when a deadline passes before the work it bounded settled, and no
 * caller supplied a domain-specific error.
 */
export class DeadlineExpired extends Error {
	constructor() {
		super('Deadline exceeded');
		this.name = 'DeadlineExpired';
	}
}

/**
 * Run something under a deadline this process actually owns.
 *
 * `AbortSignal.timeout` is not usable here: its internal timer is unref'd, so
 * a call that never settles leaves nothing keeping the event loop alive and
 * the abort never fires -- the run simply stops. The bound has to be a timer
 * this code holds and clears.
 *
 * The controller is still handed to the callee so it can abandon its own
 * work; the race is what guarantees *we* stop waiting, whether or not it
 * does. A bound that depends on the callee honouring it is not a bound.
 *
 * @param timeoutMs - How long to wait
 * @param run - Given a signal, does the work
 * @param options - Optional error customization
 * @param options.timeoutError - Produces the rejection when the deadline fires; supply a domain error so callers can classify the expiry without string matching
 * @returns Whatever the work returned
 * @throws The timeout error when the deadline passes first
 */
export async function withDeadline<T>(
	timeoutMs: number,
	run: (signal: AbortSignal) => Promise<T>,
	options: {timeoutError?: () => Error} = {},
): Promise<T> {
	const controller = new AbortController();
	let expire: NodeJS.Timeout | undefined;

	const deadline = new Promise<never>((_resolve, reject) => {
		expire = setTimeout(() => {
			controller.abort();
			reject(options.timeoutError?.() ?? new DeadlineExpired());
		}, timeoutMs);
	});

	try {
		return await Promise.race([run(controller.signal), deadline]);
	} finally {
		// Without this a finished measurement would hold the process open for
		// the rest of the bound -- a minute per page, on every page.
		clearTimeout(expire);
	}
}
