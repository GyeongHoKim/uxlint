import {AuthenticationError, AuthErrorCode} from '../../models/auth-error.js';
import type {IBrowserService} from './browser-service.js';

export class MockBrowserService implements IBrowserService {
	public openedUrls: string[] = [];
	public shouldFail = false;

	clear(): void {
		this.openedUrls = [];
		this.shouldFail = false;
	}

	async openUrl(url: string): Promise<void> {
		if (this.shouldFail) {
			throw new AuthenticationError(
				AuthErrorCode.BROWSER_FAILED,
				'Browser failed',
			);
		}

		this.openedUrls.push(url);
	}

	async isAvailable(): Promise<boolean> {
		return true;
	}
}
