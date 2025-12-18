export type IKeychainService = {
	getPassword(service: string, account: string): Promise<string | undefined>;
	setPassword(
		service: string,
		account: string,
		password: string,
	): Promise<void>;
	deletePassword(service: string, account: string): Promise<boolean>;
	isAvailable(): Promise<boolean>;
};
