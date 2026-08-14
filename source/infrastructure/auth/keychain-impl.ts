// Type-only, so it is erased at compile time and pulls in no runtime module.
// The value form of this import is what used to crash the CLI.
import type * as KeytarModule from 'keytar';
import {AuthErrorCode, AuthenticationError} from '../../models/auth-error.js';
import {logger} from '../logger.js';
import type {IKeychainService} from './keychain-service.js';

type Keytar = typeof KeytarModule;

let keytarModule: Promise<Keytar> | undefined;

/**
 * Load keytar on first use rather than at import time.
 *
 * keytar is a native addon that dlopens libsecret on Linux. A static import
 * therefore ran on every invocation, including `uxlint` in CI mode where no
 * credential is ever touched, and killed the process before argument parsing
 * on any host without libsecret installed -- which describes most slim CI
 * containers. Deferring the load means only the auth commands can hit it.
 *
 * The promise is cached, so concurrent callers share one load and a failure
 * is not retried on every call.
 */
async function loadKeytar(): Promise<Keytar> {
	keytarModule ??= import('keytar');
	return keytarModule;
}

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
			const keytar = await loadKeytar();
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
			const keytar = await loadKeytar();
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
			const keytar = await loadKeytar();
			const wasDeleted = await keytar.deletePassword(service, account);

			logger.info('Password deleted from keychain', {
				service,
				account,
				deleted: wasDeleted,
			});

			return wasDeleted;
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
		// This catch used to be unreachable: keytar was imported statically, so
		// a machine without libsecret died at module load and never got here.
		// With the load deferred, "keychain unavailable" is now something this
		// method can actually report instead of a crash.
		try {
			const keytar = await loadKeytar();
			const isAvailable = typeof keytar.getPassword === 'function';

			logger.debug('Checking keychain availability', {available: isAvailable});

			return isAvailable;
		} catch (error) {
			logger.debug('Keychain not available', {
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}
}
