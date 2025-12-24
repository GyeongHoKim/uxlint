import {
	isValidSession,
	type AuthenticationSession,
} from '../../models/auth-session.js';
import {logger} from '../logger.js';
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
		logger.debug('Loading session from keychain', {
			service: SERVICE_NAME,
			account: ACCOUNT_NAME,
		});

		const sessionJson = await this.keychain.getPassword(
			SERVICE_NAME,
			ACCOUNT_NAME,
		);

		if (!sessionJson) {
			logger.debug('No session found in keychain');
			return undefined;
		}

		try {
			const session: unknown = JSON.parse(sessionJson);

			if (!isValidSession(session)) {
				// Corrupted session, delete it
				logger.warn('Corrupted session found, deleting', {
					error: 'invalid schema',
				});
				await this.deleteSession();
				return undefined;
			}

			logger.info('Session loaded from keychain', {
				hasRefreshToken: Boolean(session.tokens.refreshToken),
				hasIdToken: Boolean(session.tokens.idToken),
			});

			return session;
		} catch {
			// JSON parse error, delete corrupted session
			logger.warn('Corrupted session found, deleting', {
				error: 'JSON parse error',
			});
			await this.deleteSession();
			return undefined;
		}
	}

	/**
	 * Save the authentication session to keychain
	 * @param session - Authentication session to save
	 */
	async saveSession(session: AuthenticationSession): Promise<void> {
		logger.info('Saving session to keychain', {
			service: SERVICE_NAME,
			account: ACCOUNT_NAME,
			hasRefreshToken: Boolean(session.tokens.refreshToken),
		});

		try {
			const sessionJson = JSON.stringify(session);
			await this.keychain.setPassword(SERVICE_NAME, ACCOUNT_NAME, sessionJson);

			logger.info('Session saved successfully');
		} catch (error) {
			logger.error('Failed to save session', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Delete the authentication session from keychain
	 */
	async deleteSession(): Promise<void> {
		logger.info('Deleting session from keychain');

		try {
			await this.keychain.deletePassword(SERVICE_NAME, ACCOUNT_NAME);

			logger.info('Session deleted successfully');
		} catch (error) {
			logger.error('Failed to delete session', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Check if keychain is available
	 * @returns true if the OS keychain service is available and functional
	 */
	async isKeychainAvailable(): Promise<boolean> {
		logger.debug('Checking keychain availability');

		const result = await this.keychain.isAvailable();

		logger.debug('Keychain availability check complete', {available: result});

		return result;
	}
}
