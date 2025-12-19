import type {IKeychainService} from '../../../source/infrastructure/auth/keychain-service.js';

/**
 * Mock keychain service for testing
 * Uses in-memory Map to simulate keychain storage
 */
export class MockKeychainService implements IKeychainService {
	private readonly storage = new Map<string, string>();

	async getPassword(
		service: string,
		account: string,
	): Promise<string | undefined> {
		const key = this.makeKey(service, account);
		return this.storage.get(key);
	}

	async setPassword(
		service: string,
		account: string,
		password: string,
	): Promise<void> {
		const key = this.makeKey(service, account);
		this.storage.set(key, password);
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		const key = this.makeKey(service, account);
		return this.storage.delete(key);
	}

	async isAvailable(): Promise<boolean> {
		return true; // Mock is always available
	}

	/**
	 * Clear all stored passwords (for test cleanup)
	 */
	clear(): void {
		this.storage.clear();
	}

	/**
	 * Get all stored keys (for debugging tests)
	 */
	getKeys(): string[] {
		return [...this.storage.keys()];
	}

	/**
	 * Generate storage key from service and account
	 */
	private makeKey(service: string, account: string): string {
		return `${service}:${account}`;
	}
}
