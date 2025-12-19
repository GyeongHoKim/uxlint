import open from 'open';
import {AuthErrorCode, AuthenticationError} from '../../models/auth-error.js';
import type {IBrowserService} from './browser-service.js';

/**
 * Production browser service using 'open' package
 * Cross-platform browser launching (macOS, Windows, Linux, WSL)
 */
export class OpenBrowserService implements IBrowserService {
	async openUrl(url: string): Promise<void> {
		try {
			await open(url);
		} catch (error) {
			throw new AuthenticationError(
				AuthErrorCode.BROWSER_FAILED,
				'Failed to open browser. Please open the authorization URL manually.',
				error as Error,
			);
		}
	}

	async isAvailable(): Promise<boolean> {
		// The 'open' package handles platform detection automatically
		// It will work on all supported platforms (macOS, Windows, Linux)
		return true;
	}
}
