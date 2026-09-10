/**
 * Run an async step over each item, one at a time, in order.
 *
 * For work whose order is the point: one browser serving one page at a time, or
 * submissions that must land in a log in the order they were made. Each step
 * starts only once the previous one has settled, and the first rejection stops
 * the rest, exactly as an `await` inside a `for` loop would.
 *
 * @param items - What to work through, in order
 * @param step - The work for one item
 * @returns Each step's result, in the order of `items`
 */
export async function runSequentially<Item, Result>(
	items: Iterable<Item>,
	step: (item: Item) => Promise<Result>,
): Promise<Result[]> {
	const iterator = items[Symbol.iterator]();
	const results: Result[] = [];

	const next = async (): Promise<Result[]> => {
		const current = iterator.next();

		if (current.done) {
			return results;
		}

		results.push(await step(current.value));
		return next();
	};

	return next();
}
