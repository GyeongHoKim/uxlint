/**
 * MCP Page Capture Service
 * Wraps Playwright MCP client for page analysis
 *
 * @packageDocumentation
 */

/**
 * Page capture result from Playwright MCP
 */
export type PageCaptureResult = {
	url: string;
	snapshot: string;
	timestamp: number;
	title?: string;
	status?: number;
};

/**
 * Navigation error
 */
export class NavigationError extends Error {
	constructor(
		message: string,
		public readonly url: string,
		public readonly cause?: Error,
	) {
		super(message);
		this.name = 'NavigationError';
	}
}

/**
 * Snapshot capture error
 */
export class SnapshotError extends Error {
	constructor(
		message: string,
		public readonly url: string,
		public readonly cause?: Error,
	) {
		super(message);
		this.name = 'SnapshotError';
	}
}

/**
 * MCP Page Capture client
 * TODO: Implement in T031-T033
 */
export class McpPageCapture {
	/**
	 * Navigate to page and capture accessibility snapshot
	 */
	async capturePage(
		_url: string,
		_timeout?: number,
	): Promise<PageCaptureResult> {
		throw new Error('Not implemented');
	}

	/**
	 * Cleanup resources
	 */
	async close(): Promise<void> {
		throw new Error('Not implemented');
	}
}
