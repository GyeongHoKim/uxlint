import type {IKeychainService} from './keychain-service.js';

export class MockKeychainService implements IKeychainService {
	public readonly storage = new Map<string, string>();

	clear(): void {
		this.storage.clear();
	}

	async getPassword(
		service: string,
		account: string,
	): Promise<string | undefined> {
		return this.storage.get(`${service}:${account}`);
	}

	async setPassword(
		service: string,
		account: string,
		password: string,
	): Promise<void> {
		this.storage.set(`${service}:${account}`, password);
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		return this.storage.delete(`${service}:${account}`);
	}

	async isAvailable(): Promise<boolean> {
		return true;
	}
}
