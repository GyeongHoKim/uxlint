import * as keytar from 'keytar';
import {AuthErrorCode, AuthenticationError} from '../../models/auth-error.js';
import {logger} from '../logger.js';
import type {IKeychainService} from './keychain-service.js';

/**
 * Production keychain service using OS-native credential storage via keytar
 * - macOS: Keychain Access
 * - Windows: Credential Vault
 * - Linux: Secret Service API / libsecret
 */
export class KeytarKeychainService implements IKeychainService {
	async getPassword(
		service: string,
		account: string,
	): Promise<string | undefined> {
		logger.debug('Getting password from keychain', {service, account});

		try {
			const result = await keytar.getPassword(service, account);

			logger.debug('Password retrieved', {
				service,
				account,
				found: result !== null,
			});

			return result ?? undefined;
		} catch (error) {
			logger.error('Keychain getPassword failed', {
				service,
				account,
				error: (error as Error).message,
			});
			throw new AuthenticationError(
				AuthErrorCode.KEYCHAIN_ERROR,
				'Failed to retrieve password from keychain',
				error as Error,
			);
		}
	}

	async setPassword(
		service: string,
		account: string,
		password: string,
	): Promise<void> {
		logger.debug('Setting password in keychain', {service, account});

		try {
			await keytar.setPassword(service, account, password);

			logger.info('Password stored in keychain', {service, account});
		} catch (error) {
			logger.error('Keychain setPassword failed', {
				service,
				account,
				error: (error as Error).message,
			});
			throw new AuthenticationError(
				AuthErrorCode.KEYCHAIN_ERROR,
				'Failed to store password in keychain',
				error as Error,
			);
		}
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		logger.debug('Deleting password from keychain', {service, account});

		try {
			const result = await keytar.deletePassword(service, account);

			logger.info('Password deleted from keychain', {
				service,
				account,
				deleted: result,
			});

			return result;
		} catch (error) {
			logger.error('Keychain deletePassword failed', {
				service,
				account,
				error: (error as Error).message,
			});
			throw new AuthenticationError(
				AuthErrorCode.KEYCHAIN_ERROR,
				'Failed to delete password from keychain',
				error as Error,
			);
		}
	}

	async isAvailable(): Promise<boolean> {
		try {
			// Test keychain availability by attempting a safe operation
			// Just check if keytar module loaded successfully
			const available = typeof keytar.getPassword === 'function';

			logger.debug('Checking keychain availability', {available});

			return available;
		} catch {
			logger.debug('Keychain not available', {
				error: 'keytar module not loaded',
			});
			return false;
		}
	}
}
