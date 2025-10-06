/**
 * InputProcessor class for input normalization and sanitization
 * Handles URL normalization and general input processing
 */

import type {Validator} from './validation-engine.js';
import {UrlNormalizationError} from './errors.js';

export type ProcessedInput = {
	originalValue: string;
	processedValue: string;
};

/**
 * Input processor for normalization and sanitization
 */
export const inputProcessor = {
	/**
	 * Normalize URL by adding protocol if missing and cleaning format
	 * Returns URL object for better type safety and API access
	 * @throws {UrlNormalizationError} When URL cannot be normalized
	 */
	normalizeUrl(url: string): URL {
		if (!url || url.trim().length === 0) {
			throw new UrlNormalizationError('URL cannot be empty', url);
		}

		let normalizedUrl = url.trim();

		// Remove any leading/trailing whitespace and quotes
		normalizedUrl = normalizedUrl.replaceAll(/^["']|["']$/g, '');

		// Add https:// if no protocol is specified
		if (
			!normalizedUrl.startsWith('http://') &&
			!normalizedUrl.startsWith('https://')
		) {
			normalizedUrl = `https://${normalizedUrl}`;
		}

		// Clean up common URL issues
		try {
			return new URL(normalizedUrl);
		} catch (error) {
			throw new UrlNormalizationError(
				`Invalid URL format: ${normalizedUrl}`,
				url,
				error instanceof Error ? error : undefined,
			);
		}
	},

	/**
	 * Normalize URL and return as string
	 * @throws {UrlNormalizationError} When URL cannot be normalized
	 */
	normalizeUrlString(url: string): string {
		const urlObject = inputProcessor.normalizeUrl(url);
		return urlObject.toString();
	},

	/**
	 * Sanitize general input by removing dangerous characters and normalizing whitespace
	 * Focuses on the most common problematic characters for CLI input
	 */
	sanitizeInput(input: string): string {
		if (!input) {
			return '';
		}

		return (
			input
				// Remove the most dangerous characters that could cause issues
				.replaceAll('\u0000', '') // Null byte (most critical)
				.replaceAll('\u007F', '') // Delete character
				// Normalize whitespace (collapse multiple spaces/tabs/newlines into single space)
				.replaceAll(/\s+/g, ' ')
				// Trim leading and trailing whitespace
				.trim()
		);
	},

	/**
	 * Process submission with optional validation
	 * @throws {ValidationError} When validation fails
	 * @throws {InputProcessingError} When processing fails
	 */
	processSubmission(value: string, validator?: Validator): ProcessedInput {
		const sanitizedValue = inputProcessor.sanitizeInput(value);

		let processedValue = sanitizedValue;

		// Apply validation if provided
		if (validator) {
			processedValue = validator(sanitizedValue);
		}

		return {
			originalValue: value,
			processedValue,
		};
	},

	/**
	 * Clean text input for safe processing (minimal normalization)
	 * Only removes excessive whitespace while preserving user intent
	 */
	cleanText(text: string): string {
		if (!text) {
			return '';
		}

		return text.trim().replaceAll(/\s+/g, ' ');
	},

	/**
	 * Extract domain from URL for display purposes
	 * @throws {UrlNormalizationError} When URL cannot be normalized
	 */
	extractDomain(url: string): string {
		const normalizedUrl = inputProcessor.normalizeUrl(url);
		return normalizedUrl.hostname;
	},
};
