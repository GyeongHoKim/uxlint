import keytar from 'keytar';
import {AuthenticationError, AuthErrorCode} from '../../models/auth-error.js';
import type {IKeychainService} from './keychain-service.js';

type KeytarLike = Pick<
	typeof keytar,
	'getPassword' | 'setPassword' | 'deletePassword'
>;

export class KeytarKeychainService implements IKeychainService {
	constructor(private readonly keytarImpl: KeytarLike = keytar) {}

	async getPassword(
		service: string,
		account: string,
	): Promise<string | undefined> {
		try {
			const password = await this.keytarImpl.getPassword(service, account);
			return password ?? undefined;
		} catch (error) {
			throw new AuthenticationError(
				AuthErrorCode.KEYCHAIN_ERROR,
				'Failed to read from keychain',
				{
					service,
					account,
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}

	async setPassword(
		service: string,
		account: string,
		password: string,
	): Promise<void> {
		try {
			await this.keytarImpl.setPassword(service, account, password);
		} catch (error) {
			throw new AuthenticationError(
				AuthErrorCode.KEYCHAIN_ERROR,
				'Failed to write to keychain',
				{
					service,
					account,
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		try {
			return await this.keytarImpl.deletePassword(service, account);
		} catch (error) {
			throw new AuthenticationError(
				AuthErrorCode.KEYCHAIN_ERROR,
				'Failed to delete from keychain',
				{
					service,
					account,
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}

	async isAvailable(): Promise<boolean> {
		try {
			// A lightweight probe: call into keytar and treat errors as "unavailable".
			await this.keytarImpl.getPassword(
				'uxlint-cli',
				'__uxlint_keytar_probe__',
			);
			return true;
		} catch {
			return false;
		}
	}
}
