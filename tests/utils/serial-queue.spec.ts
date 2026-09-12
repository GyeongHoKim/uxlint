/**
 * The queue that keeps request handlers from interleaving.
 */

import test from 'ava';
import {createSerialQueue} from '../../source/utils/serial-queue.js';

test('queued work never overlaps, whatever order it was asked for', async t => {
	const exclusive = createSerialQueue();
	const order: number[] = [];

	const step = async (id: number, delayMs: number) =>
		exclusive(async () => {
			order.push(id);
			await new Promise(resolve => {
				setTimeout(resolve, delayMs);
			});
			order.push(-id);
			return id;
		});

	// The first is the slowest, so an unqueued second would finish inside it.
	const results = await Promise.all([step(1, 30), step(2, 1), step(3, 1)]);

	t.deepEqual(results, [1, 2, 3]);
	t.deepEqual(order, [1, -1, 2, -2, 3, -3]);
});

// One caller's refusal is not the next caller's. A queue that stopped at the
// first rejection would turn one refused submission into every later one being
// lost.
test('a failure does not stop what was queued behind it', async t => {
	const exclusive = createSerialQueue();

	const failing = exclusive(async () => {
		throw new Error('refused');
	});

	const following = exclusive(async () => 'recorded');

	await t.throwsAsync(failing, {message: 'refused'});
	t.is(await following, 'recorded');
});
