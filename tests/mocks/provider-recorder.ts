/**
 * Records the requests the provider client would have sent.
 *
 * Deliberately assertion-free. One recorder serves the size measurement, the
 * tool-count check, the duplicate-structure check and the reminder-absence
 * check, and it stays reusable only by not deciding what any of them mean.
 */

import {Buffer} from 'node:buffer';

/**
 * One intercepted request, reduced to what the measurements need.
 */
export type RecordedRequest = {
	/** The parsed request body */
	body: Record<string, unknown>;

	/** Serialised size of that body */
	bytes: number;

	/** Tool names carried in the request */
	toolNames: string[];

	/** How many times a given marker appears in the body */
	occurrencesOf: (marker: string) => number;
};

/**
 * Collects intercepted requests and reports on them.
 */
export class ProviderRecorder {
	private readonly requests: RecordedRequest[] = [];

	/**
	 * Capture one request body. Passed as the handler's `onRequest`.
	 *
	 * @param body - The intercepted request body
	 */
	record = (body: unknown): void => {
		const parsed = (body ?? {}) as Record<string, unknown>;
		const serialised = JSON.stringify(parsed);
		const tools = Array.isArray(parsed['tools'])
			? (parsed['tools'] as Array<{name?: string}>)
			: [];

		this.requests.push({
			body: parsed,
			bytes: Buffer.byteLength(serialised),
			toolNames: tools.map(tool => tool.name ?? '<unnamed>'),
			occurrencesOf(marker) {
				return serialised.split(marker).length - 1;
			},
		});
	};

	/**
	 * Every request captured, in order.
	 *
	 * Throws when nothing was captured. A handler pointed at the wrong
	 * endpoint intercepts nothing, and every downstream assertion over an
	 * empty list would then pass while measuring nothing at all -- which is
	 * exactly the failure this harness exists to rule out.
	 */
	all(): RecordedRequest[] {
		if (this.requests.length === 0) {
			throw new Error(
				'No provider requests were intercepted. The handler is probably pointed at the wrong endpoint: this client posts to /v1/responses, not /v1/chat/completions.',
			);
		}

		return [...this.requests];
	}

	/** Number of requests captured, without the empty-capture guard. */
	get count(): number {
		return this.requests.length;
	}

	/** Total bytes across every captured request. */
	totalBytes(): number {
		return this.all().reduce((sum, request) => sum + request.bytes, 0);
	}

	/** Median bytes across captured requests. */
	medianBytes(): number {
		const sizes = this.all()
			.map(request => request.bytes)
			.sort((a, b) => a - b);
		const middle = Math.floor(sizes.length / 2);

		return sizes.length % 2 === 0
			? Math.round(((sizes[middle - 1] ?? 0) + (sizes[middle] ?? 0)) / 2)
			: (sizes[middle] ?? 0);
	}

	/** The largest number of times `marker` appears in any single request. */
	maxOccurrencesOf(marker: string): number {
		return Math.max(
			...this.all().map(request => request.occurrencesOf(marker)),
		);
	}

	/** Forget everything captured so far. */
	reset(): void {
		this.requests.length = 0;
	}
}
