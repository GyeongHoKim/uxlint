/**
 * Run async work one piece at a time, whoever asks.
 *
 * For work that is correct only when no second piece of it is half-finished:
 * a state transition followed by the write that records it, where another
 * caller arriving in between would write its own record first and leave the
 * log disagreeing with the state it was produced from.
 *
 * Different from `runSequentially`, which walks a list the caller already has.
 * A queue takes work from callers that do not know about each other, which is
 * what a request handler is.
 *
 * @returns A function that runs its work once everything queued before it has
 * settled
 */
export function createSerialQueue(): <Result>(
	work: () => Promise<Result>,
) => Promise<Result> {
	let tail: Promise<unknown> = Promise.resolve();

	return async <Result>(work: () => Promise<Result>): Promise<Result> => {
		// Queued on the previous piece settling either way: one caller's failure
		// is not the next caller's, and a rejected tail that stopped the queue
		// would turn one refused submission into every later one being lost.
		const result = tail.then(work, work);
		tail = result.then(
			() => undefined,
			() => undefined,
		);

		return result;
	};
}
