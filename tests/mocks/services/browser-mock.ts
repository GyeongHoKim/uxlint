import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';
import type {IBrowserService} from '../../../source/infrastructure/auth/browser-service.js';

/**
 * Mock browser service for testing
 * Tracks opened URLs without actually launching a browser
 */
export class MockBrowserService implements IBrowserService {
	/** List of URLs that were opened (for test assertions) */
	public openedUrls: string[] = [];

	/** Set to true to simulate browser launch failure */
	public shouldFail = false;

	async openUrl(url: string): Promise<void> {
		if (this.shouldFail) {
			throw new AuthenticationError(
				AuthErrorCode.BROWSER_FAILED,
				'Mock browser failure',
			);
		}

		this.openedUrls.push(url);
	}

	async isAvailable(): Promise<boolean> {
		return !this.shouldFail;
	}

	/**
	 * Clear opened URLs (for test cleanup)
	 */
	clear(): void {
		this.openedUrls = [];
		this.shouldFail = false;
	}

	/**
	 * Get the last opened URL (convenience method for tests)
	 */
	getLastUrl(): string | undefined {
		// eslint-disable-next-line unicorn/prefer-at
		return this.openedUrls[this.openedUrls.length - 1];
	}
}
