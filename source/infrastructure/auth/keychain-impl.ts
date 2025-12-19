import * as keytar from 'keytar';
import {AuthErrorCode, AuthenticationError} from '../../models/auth-error.js';
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
		try {
			const result = await keytar.getPassword(service, account);
			return result ?? undefined;
		} catch (error) {
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
		try {
			await keytar.setPassword(service, account, password);
		} catch (error) {
			throw new AuthenticationError(
				AuthErrorCode.KEYCHAIN_ERROR,
				'Failed to store password in keychain',
				error as Error,
			);
		}
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		try {
			return await keytar.deletePassword(service, account);
		} catch (error) {
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
			return typeof keytar.getPassword === 'function';
		} catch {
			return false;
		}
	}
}
