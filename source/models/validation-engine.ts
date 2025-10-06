/**
 * ValidationEngine for input validation
 * Provides URL, required field validation and composition methods
 * All validators throw specific errors on validation failure for consistent error handling
 */

import {
	ValidationError,
	UrlValidationError,
	RequiredFieldError,
	LengthValidationError,
} from './errors.js';

export type Validator = (value: string) => string; // Returns normalized value or throws

/**
 * Validation engine with common validators and composition utilities
 * All validators throw specific errors on validation failure for consistent error handling
 */
export const validationEngine = {
	/**
	 * Validate URL format and structure
	 * @throws {UrlValidationError} When URL validation fails
	 * @throws {RequiredFieldError} When URL is empty
	 * @returns {string} Normalized URL string
	 */
	url(value: string): string {
		if (!value || value.trim().length === 0) {
			throw new RequiredFieldError('URL');
		}

		const trimmedValue = value.trim();

		// Check if it's a valid URL format
		try {
			// Add protocol if missing
			const urlToTest =
				trimmedValue.startsWith('http://') ||
				trimmedValue.startsWith('https://')
					? trimmedValue
					: `https://${trimmedValue}`;

			const url = new URL(urlToTest);

			// Ensure it has a valid protocol
			if (!['http:', 'https:'].includes(url.protocol)) {
				throw new UrlValidationError(
					'URL must use HTTP or HTTPS protocol',
					trimmedValue,
					'protocol',
				);
			}

			// Ensure it has a valid hostname
			if (!url.hostname || url.hostname.length === 0) {
				throw new UrlValidationError(
					'URL must have a valid hostname',
					trimmedValue,
					'hostname',
				);
			}

			return url.toString();
		} catch (error) {
			if (error instanceof UrlValidationError) {
				throw error;
			}

			throw new UrlValidationError(
				'Please enter a valid URL',
				trimmedValue,
				'format',
			);
		}
	},

	/**
	 * Validate required field
	 * @throws {RequiredFieldError} When field is empty
	 * @returns {string} Trimmed value
	 */
	required(value: string, fieldName = 'field'): string {
		if (!value || value.trim().length === 0) {
			throw new RequiredFieldError(fieldName);
		}

		return value.trim();
	},

	/**
	 * Create minimum length validator
	 * @throws {LengthValidationError} When value is too short
	 * @returns {Validator} Validator function
	 */
	minLength(min: number, fieldName = 'field'): Validator {
		return (value: string): string => {
			if (!value || value.trim().length < min) {
				throw new LengthValidationError(
					`Must be at least ${min} characters long`,
					{
						actualLength: value?.trim().length ?? 0,
						expectedLength: min,
						lengthType: 'min',
						value,
						fieldName,
					},
				);
			}

			return value.trim();
		};
	},

	/**
	 * Create maximum length validator
	 * @throws {LengthValidationError} When value is too long
	 * @returns {Validator} Validator function
	 */
	maxLength(max: number, fieldName = 'field'): Validator {
		return (value: string): string => {
			if (value && value.trim().length > max) {
				throw new LengthValidationError(
					`Must be no more than ${max} characters long`,
					{
						actualLength: value.trim().length,
						expectedLength: max,
						lengthType: 'max',
						value,
						fieldName,
					},
				);
			}

			return value?.trim() || '';
		};
	},

	/**
	 * Create custom validator with error message
	 * @throws {ValidationError} When validation fails
	 * @returns {Validator} Validator function
	 */
	custom(
		validationFunction: (value: string) => boolean,
		errorMessage: string,
		fieldName = 'field',
	): Validator {
		return (value: string): string => {
			if (!validationFunction(value)) {
				throw new ValidationError(errorMessage, fieldName, value, 'custom');
			}

			return value?.trim() || '';
		};
	},

	/**
	 * Compose multiple validators into a single validator
	 * Runs validators in sequence and throws on first error
	 * @throws {ValidationError} When any validator fails
	 * @returns {Validator} Composed validator function
	 */
	compose(...validators: Validator[]): Validator {
		return (value: string): string => {
			let processedValue = value;

			for (const validator of validators) {
				processedValue = validator(processedValue);
			}

			return processedValue;
		};
	},
};
