import open from 'open';
import {AuthenticationError, AuthErrorCode} from '../../models/auth-error.js';
import type {IBrowserService} from './browser-service.js';

type OpenLike = (
	target: string,
	options?: Parameters<typeof open>[1],
) => ReturnType<typeof open>;

export class OpenBrowserService implements IBrowserService {
	constructor(private readonly openImpl: OpenLike = open) {}

	async openUrl(url: string): Promise<void> {
		try {
			await this.openImpl(url, {wait: false});
		} catch (error) {
			throw new AuthenticationError(
				AuthErrorCode.BROWSER_FAILED,
				'Failed to open browser',
				{
					url,
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}

	async isAvailable(): Promise<boolean> {
		return true;
	}
}
