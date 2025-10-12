/**
 * Validation utilities for MCP operations
 * @packageDocumentation
 */

/**
 * Validates a URL string according to WHATWG URL Standard
 *
 * @param url - URL to validate
 * @returns True if valid, false otherwise
 */
export function isValidUrl(url: string): boolean {
	if (!url || typeof url !== 'string') {
		return false;
	}

	try {
		const urlObject = new URL(url);
		// Only allow http and https protocols
		return urlObject.protocol === 'http:' || urlObject.protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * Validates a CSS selector
 *
 * @param selector - CSS selector to validate
 * @returns True if valid, false otherwise
 */
export function isValidSelector(selector: string): boolean {
	if (
		!selector ||
		typeof selector !== 'string' ||
		selector.trim().length === 0
	) {
		return false;
	}

	try {
		// Try to parse selector using browser's querySelector (if available)
		// In Node.js environment, we do basic validation
		// Check for obviously invalid patterns
		if (selector.includes('//') || selector.includes('::')) {
			// XPath indicators - not supported
			return false;
		}

		// Basic CSS selector validation
		// Allow common CSS selector patterns
		const cssPattern = /^[#.[\w*:\-\s\]=>+(),"]+$/i;
		return cssPattern.test(selector);
	} catch {
		return false;
	}
}

/**
 * Validates JavaScript code for basic safety
 *
 * @param script - JavaScript code to validate
 * @returns True if safe, false otherwise
 */
export function isScriptSafe(script: string): boolean {
	if (!script || typeof script !== 'string') {
		return false;
	}

	// Check script length (max 10,000 characters)
	if (script.length > 10_000) {
		return false;
	}

	// Check for dangerous patterns
	const dangerousPatterns = [
		/\brequire\s*\(/i,
		/\bimport\s+/i,
		/\beval\s*\(/i,
		/\bfunction\s*\(/i,
		/\bnew\s+function/i,
	];

	for (const pattern of dangerousPatterns) {
		if (pattern.test(script)) {
			return false;
		}
	}

	return true;
}

/**
 * Validates a timeout value
 *
 * @param timeout - Timeout in milliseconds
 * @returns True if valid, false otherwise
 */
export function isValidTimeout(timeout: number): boolean {
	if (typeof timeout !== 'number' || Number.isNaN(timeout)) {
		return false;
	}

	// Timeout must be between 1 second and 5 minutes
	const minTimeout = 1000; // 1 second
	const maxTimeout = 300_000; // 5 minutes

	return timeout >= minTimeout && timeout <= maxTimeout;
}

/**
 * Get validation error message for URL
 *
 * @param url - URL to validate
 * @returns Error message if invalid, empty string if valid
 *
 * @example
 * ```typescript
 * const error = getUrlValidationError('not-a-url');
 * // Returns: 'Invalid URL format'
 *
 * const valid = getUrlValidationError('https://example.com');
 * // Returns: ''
 * ```
 */
export function getUrlValidationError(url: string): string {
	if (!url || typeof url !== 'string') {
		return 'URL must be a non-empty string';
	}

	try {
		const urlObject = new URL(url);
		if (urlObject.protocol !== 'http:' && urlObject.protocol !== 'https:') {
			return 'URL must use http or https protocol';
		}
	} catch {
		return 'Invalid URL format';
	}

	return '';
}

/**
 * Get validation error message for selector
 *
 * @param selector - CSS selector to validate
 * @returns Error message if invalid, empty string if valid
 *
 * @example
 * ```typescript
 * const error = getSelectorValidationError('//xpath');
 * // Returns: 'XPath selectors are not supported. Use CSS selectors instead.'
 *
 * const valid = getSelectorValidationError('.my-class');
 * // Returns: ''
 * ```
 */
export function getSelectorValidationError(selector: string): string {
	if (!selector || typeof selector !== 'string') {
		return 'Selector must be a non-empty string';
	}

	if (selector.trim().length === 0) {
		return 'Selector cannot be empty or whitespace only';
	}

	if (selector.includes('//')) {
		return 'XPath selectors are not supported. Use CSS selectors instead.';
	}

	if (selector.includes('::') && !/::[\w-]+/.test(selector)) {
		return 'Invalid pseudo-element syntax';
	}

	return '';
}

/**
 * Get validation error message for script
 *
 * @param script - JavaScript code to validate
 * @returns Error message if unsafe, empty string if safe
 *
 * @example
 * ```typescript
 * const error = getScriptValidationError("require('fs')");
 * // Returns: 'Script cannot use require()'
 *
 * const valid = getScriptValidationError('document.title');
 * // Returns: ''
 * ```
 */
export function getScriptValidationError(script: string): string {
	if (!script || typeof script !== 'string') {
		return 'Script must be a non-empty string';
	}

	if (script.length > 10_000) {
		return 'Script exceeds maximum length of 10,000 characters';
	}

	if (/\brequire\s*\(/i.test(script)) {
		return 'Script cannot use require()';
	}

	if (/\bimport\s+/i.test(script)) {
		return 'Script cannot use import statements';
	}

	if (/\beval\s*\(/i.test(script)) {
		return 'Script cannot use eval()';
	}

	if (/\bfunction\s*\(|new\s+function/i.test(script)) {
		return 'Script cannot use Function constructor';
	}

	return '';
}

/**
 * Get validation error message for timeout
 *
 * @param timeout - Timeout value in milliseconds
 * @returns Error message if invalid, empty string if valid
 *
 * @example
 * ```typescript
 * const error = getTimeoutValidationError(500);
 * // Returns: 'Timeout must be at least 1000ms (1 second)'
 *
 * const valid = getTimeoutValidationError(30000);
 * // Returns: ''
 * ```
 */
export function getTimeoutValidationError(timeout: number): string {
	if (typeof timeout !== 'number' || Number.isNaN(timeout)) {
		return 'Timeout must be a valid number';
	}

	if (timeout < 1000) {
		return 'Timeout must be at least 1000ms (1 second)';
	}

	if (timeout > 300_000) {
		return 'Timeout cannot exceed 300000ms (5 minutes)';
	}

	return '';
}
