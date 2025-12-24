/**
 * Logging utility functions
 * Provides helpers for safe and consistent logging across the application
 */

/**
 * Sanitize URL by removing sensitive query parameters
 * Removes parameters that may contain tokens, codes, or other sensitive data
 *
 * @param url - URL to sanitize
 * @returns Sanitized URL with sensitive parameters removed
 *
 * @example
 * sanitizeUrl('https://example.com/callback?code=secret&state=xyz')
 * // Returns: 'https://example.com/callback?state=xyz'
 */
export function sanitizeUrl(url: string): string {
	try {
		const urlObject = new URL(url);

		// List of sensitive query parameter names to remove
		const sensitiveParameters = [
			'code',
			'access_token',
			'refresh_token',
			'token',
			'api_key',
			'apikey',
			'key',
			'secret',
			'password',
			'code_verifier',
			'code_challenge',
		];

		// Remove sensitive parameters
		for (const parameter of sensitiveParameters) {
			if (urlObject.searchParams.has(parameter)) {
				urlObject.searchParams.delete(parameter);
			}
		}

		return urlObject.toString();
	} catch {
		// If URL parsing fails, return the original URL
		// (may not be a valid URL, or relative path)
		return url;
	}
}

/**
 * Redact token by showing only the first few characters
 * NOTE: Current policy is to completely exclude tokens from logs
 * This function is provided for potential future use if policy changes
 *
 * @param token - Token to redact
 * @param visibleChars - Number of characters to show (default: 4)
 * @returns Redacted token
 *
 * @example
 * redactToken('abc123def456')
 * // Returns: 'abc1****'
 */
export function redactToken(token: string, visibleChars = 4): string {
	if (token.length <= visibleChars) {
		return '****';
	}

	return token.slice(0, visibleChars) + '****';
}

/**
 * Check if a value is a non-empty string
 * Useful for logging metadata about optional fields
 *
 * @param value - Value to check
 * @returns true if value is a non-empty string
 */
export function hasValue(value: unknown): boolean {
	return typeof value === 'string' && value.length > 0;
}

/**
 * Format bytes to human-readable string
 *
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "1.5 KB")
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	const kb = bytes / 1024;
	if (kb < 1024) {
		return `${kb.toFixed(1)} KB`;
	}

	const mb = kb / 1024;
	return `${mb.toFixed(1)} MB`;
}

/**
 * Create a duration string from milliseconds
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration (e.g., "1.5s", "250ms")
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}

	const seconds = ms / 1000;
	return `${seconds.toFixed(2)}s`;
}
