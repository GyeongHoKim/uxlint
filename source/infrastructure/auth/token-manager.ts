import {
	isValidSession,
	type AuthenticationSession,
} from '../../models/auth-session.js';
import type {IKeychainService} from './keychain-service.js';

/** Service name for keychain storage */
const SERVICE_NAME = 'uxlint-cli';

/** Account name for keychain storage */
const ACCOUNT_NAME = 'default';

/**
 * Token manager for storing and retrieving authentication sessions
 * Uses OS-native keychain for secure credential storage
 */
export class TokenManager {
	constructor(private readonly keychain: IKeychainService) {}

	/**
	 * Load the authentication session from keychain
	 * @returns Authentication session or undefined if not found/invalid
	 */
	async loadSession(): Promise<AuthenticationSession | undefined> {
		const sessionJson = await this.keychain.getPassword(
			SERVICE_NAME,
			ACCOUNT_NAME,
		);

		if (!sessionJson) {
			return undefined;
		}

		try {
			const session: unknown = JSON.parse(sessionJson);

			if (!isValidSession(session)) {
				// Corrupted session, delete it
				await this.deleteSession();
				return undefined;
			}

			return session;
		} catch {
			// JSON parse error, delete corrupted session
			await this.deleteSession();
			return undefined;
		}
	}

	/**
	 * Save the authentication session to keychain
	 * @param session - Authentication session to save
	 */
	async saveSession(session: AuthenticationSession): Promise<void> {
		const sessionJson = JSON.stringify(session);
		await this.keychain.setPassword(SERVICE_NAME, ACCOUNT_NAME, sessionJson);
	}

	/**
	 * Delete the authentication session from keychain
	 */
	async deleteSession(): Promise<void> {
		await this.keychain.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
	}

	/**
	 * Check if keychain is available
	 * @returns true if the OS keychain service is available and functional
	 */
	async isKeychainAvailable(): Promise<boolean> {
		return this.keychain.isAvailable();
	}
}
