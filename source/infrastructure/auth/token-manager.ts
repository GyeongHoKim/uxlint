import {
	isSessionExpired,
	isValidSession,
	type AuthenticationSession,
} from '../../models/auth-session.js';
import {AuthenticationError, AuthErrorCode} from '../../models/auth-error.js';
import type {IKeychainService} from './keychain-service.js';

const SERVICE_NAME = 'uxlint-cli';
const ACCOUNT_NAME = 'default';

export class TokenManager {
	constructor(private readonly keychain: IKeychainService) {}

	async loadSession(): Promise<AuthenticationSession | undefined> {
		const raw = await this.keychain.getPassword(SERVICE_NAME, ACCOUNT_NAME);
		if (raw === undefined) {
			return undefined;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			// Corrupted session - best effort cleanup.
			await this.keychain.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
			return undefined;
		}

		if (!isValidSession(parsed)) {
			await this.keychain.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
			return undefined;
		}

		return parsed;
	}

	async saveSession(session: AuthenticationSession): Promise<void> {
		await this.keychain.setPassword(
			SERVICE_NAME,
			ACCOUNT_NAME,
			JSON.stringify(session),
		);
	}

	async deleteSession(): Promise<void> {
		await this.keychain.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
	}

	async requireValidSession(bufferMs = 0): Promise<AuthenticationSession> {
		const session = await this.loadSession();
		if (session === undefined) {
			throw new AuthenticationError(
				AuthErrorCode.NOT_AUTHENTICATED,
				'No active session',
			);
		}

		if (isSessionExpired(session, bufferMs)) {
			throw new AuthenticationError(
				AuthErrorCode.NOT_AUTHENTICATED,
				'Session expired',
			);
		}

		return session;
	}
}
