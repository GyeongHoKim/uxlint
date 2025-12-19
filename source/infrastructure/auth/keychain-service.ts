/**
 * Abstract interface for OS-native keychain/credential storage
 * Allows dependency injection for testing with mock implementations
 */
export type IKeychainService = {
	/**
	 * Retrieve a password from the keychain
	 * @param service - Service name (e.g., 'uxlint-cli')
	 * @param account - Account name (e.g., 'default')
	 * @returns Password string or undefined if not found
	 */
	getPassword(service: string, account: string): Promise<string | undefined>;

	/**
	 * Store a password in the keychain
	 * @param service - Service name (e.g., 'uxlint-cli')
	 * @param account - Account name (e.g., 'default')
	 * @param password - Password/token to store
	 */
	setPassword(
		service: string,
		account: string,
		password: string,
	): Promise<void>;

	/**
	 * Delete a password from the keychain
	 * @param service - Service name (e.g., 'uxlint-cli')
	 * @param account - Account name (e.g., 'default')
	 * @returns true if password was deleted, false if not found
	 */
	deletePassword(service: string, account: string): Promise<boolean>;

	/**
	 * Check if keychain is available on this platform
	 * @returns true if keychain is available
	 */
	isAvailable(): Promise<boolean>;
};
