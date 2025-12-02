/**
 * Custom error classes for uxlint application
 * Provides specific error types for better error handling and debugging
 */

/**
 * Base class for all uxlint-specific errors
 */
export abstract class UxlintError extends Error {
	abstract readonly code: string;

	constructor(
		message: string,
		public readonly context?: Record<string, unknown>,
	) {
		super(message);
		this.name = this.constructor.name;
	}
}

/**
 * Error thrown when URL normalization fails
 */
export class UrlNormalizationError extends UxlintError {
	get code() {
		return 'URL_NORMALIZATION_ERROR';
	}

	constructor(
		message: string,
		public readonly originalInput: string,
		public readonly cause?: Error,
	) {
		super(message, {originalInput, cause: cause?.message});
		this.name = 'UrlNormalizationError';
	}
}

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends UxlintError {
	get code() {
		return 'VALIDATION_ERROR';
	}

	constructor(
		message: string,
		public readonly field: string,
		public readonly value: unknown,
		public readonly validationType: string,
	) {
		super(message, {field, value, validationType});
		this.name = 'ValidationError';
	}
}

/**
 * Error thrown when URL validation fails
 */
export class UrlValidationError extends ValidationError {
	override get code() {
		return 'URL_VALIDATION_ERROR';
	}

	constructor(
		message: string,
		public readonly originalUrl: string,
		public readonly validationStep:
			| 'format'
			| 'protocol'
			| 'hostname'
			| 'reachability',
	) {
		super(message, 'url', originalUrl, 'url');
		this.name = 'UrlValidationError';
	}
}

/**
 * Error thrown when required field validation fails
 */
export class RequiredFieldError extends ValidationError {
	override get code() {
		return 'REQUIRED_FIELD_ERROR';
	}

	constructor(fieldName = 'field') {
		super(`${fieldName} is required`, fieldName, '', 'required');
		this.name = 'RequiredFieldError';
	}
}

/**
 * Error thrown when length validation fails
 */
export class LengthValidationError extends ValidationError {
	override get code() {
		return 'LENGTH_VALIDATION_ERROR';
	}

	public readonly actualLength: number;
	public readonly expectedLength: number;
	public readonly lengthType: 'min' | 'max';

	constructor(
		message: string,
		options: {
			actualLength: number;
			expectedLength: number;
			lengthType: 'min' | 'max';
			value: string;
			fieldName?: string;
		},
	) {
		super(
			message,
			options.fieldName ?? 'field',
			options.value,
			`${options.lengthType}Length`,
		);
		this.name = 'LengthValidationError';
		this.actualLength = options.actualLength;
		this.expectedLength = options.expectedLength;
		this.lengthType = options.lengthType;
	}
}

/**
 * Error thrown when input processing fails
 */
export class InputProcessingError extends UxlintError {
	get code() {
		return 'INPUT_PROCESSING_ERROR';
	}

	constructor(
		message: string,
		public readonly processingStep: string,
		public readonly originalInput: string,
	) {
		super(message, {processingStep, originalInput});
		this.name = 'InputProcessingError';
	}
}

/**
 * Error thrown when configuration file is not found in CI mode
 */
export class MissingConfigError extends UxlintError {
	get code() {
		return 'MISSING_CONFIG_ERROR';
	}

	constructor() {
		super(
			'Configuration file not found. Use --interactive flag to create one, ' +
				'or create .uxlintrc.yml or .uxlintrc.json in the current directory.',
		);
		this.name = 'MissingConfigError';
	}
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends UxlintError {
	get code() {
		return 'CONFIGURATION_ERROR';
	}

	constructor(
		message: string,
		public readonly configPath?: string,
		public readonly configField?: string,
	) {
		super(message, {configPath, configField});
		this.name = 'ConfigurationError';
	}
}

/**
 * Error thrown when network operations fail
 */
export class NetworkError extends UxlintError {
	get code() {
		return 'NETWORK_ERROR';
	}

	constructor(
		message: string,
		public readonly url: string,
		public readonly statusCode?: number,
		public readonly cause?: Error,
	) {
		super(message, {url, statusCode, cause: cause?.message});
		this.name = 'NetworkError';
	}
}

/**
 * Type guard to check if error is a uxlint-specific error
 */
export function isUxlintError(error: unknown): error is UxlintError {
	return error instanceof UxlintError;
}

/**
 * Type guard to check if error is a specific uxlint error type
 */
export function isErrorOfType<T extends UxlintError>(
	error: unknown,
	ErrorClass: new (...args: any[]) => T,
): error is T {
	return error instanceof ErrorClass;
}

/**
 * Extract error information for logging or display
 */
export function getErrorInfo(error: unknown): {
	message: string;
	code?: string;
	context?: Record<string, unknown>;
	stack?: string;
} {
	if (isUxlintError(error)) {
		return {
			message: error.message,
			code: error.code,
			context: error.context,
			stack: error.stack,
		};
	}

	if (error instanceof Error) {
		return {
			message: error.message,
			stack: error.stack,
		};
	}

	return {
		message: String(error),
	};
}
