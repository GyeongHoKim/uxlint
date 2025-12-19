/**
 * Abstract interface for browser launching
 * Allows dependency injection for testing with mock implementations
 */
export type IBrowserService = {
	/**
	 * Open a URL in the default browser
	 * @param url - URL to open
	 * @throws AuthenticationError with BROWSER_FAILED code on failure
	 */
	openUrl(url: string): Promise<void>;

	/**
	 * Check if browser launching is available on this platform
	 * @returns true if browser can be launched
	 */
	isAvailable(): Promise<boolean>;
};
