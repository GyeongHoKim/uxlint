// Using Jest globals
import {UxlintError} from '../../source/models/errors.js';
import {
	ConfigurationError,
	InputProcessingError,
	LengthValidationError,
	NetworkError,
	RequiredFieldError,
	UrlNormalizationError,
	UrlValidationError,
	ValidationError,
	getErrorInfo,
	isErrorOfType,
	isUxlintError,
} from '../../source/models/index.js';

// ValidationError Tests
test('ValidationError creates proper error instance', () => {
	const error = new ValidationError(
		'Invalid input',
		'username',
		'test',
		'custom',
	);

	expect(error.code).toBe('VALIDATION_ERROR');
	expect(error.message).toBe('Invalid input');
	expect(error.field).toBe('username');
	expect(error.value).toBe('test');
	expect(error.validationType).toBe('custom');
	expect(error.name).toBe('ValidationError');
	expect(error instanceof ValidationError).toBeTruthy();
	expect(error instanceof UxlintError).toBeTruthy();
});

// UrlValidationError Tests
test('UrlValidationError extends ValidationError', () => {
	const error = new UrlValidationError(
		'Invalid URL format',
		'not-a-url',
		'format',
	);

	expect(error.code).toBe('URL_VALIDATION_ERROR');
	expect(error.message).toBe('Invalid URL format');
	expect(error.originalUrl).toBe('not-a-url');
	expect(error.validationStep).toBe('format');
	expect(error.field).toBe('url');
	expect(error.validationType).toBe('url');
	expect(error.name).toBe('UrlValidationError');
	expect(error instanceof UrlValidationError).toBeTruthy();
	expect(error instanceof ValidationError).toBeTruthy();
	expect(error instanceof UxlintError).toBeTruthy();
});

test('UrlValidationError handles different validation steps', () => {
	const formatError = new UrlValidationError(
		'Format error',
		'invalid',
		'format',
	);
	expect(formatError.validationStep).toBe('format');

	const protocolError = new UrlValidationError(
		'Protocol error',
		'ftp://test',
		'protocol',
	);
	expect(protocolError.validationStep).toBe('protocol');

	const hostnameError = new UrlValidationError(
		'Hostname error',
		'https://',
		'hostname',
	);
	expect(hostnameError.validationStep).toBe('hostname');

	const reachabilityError = new UrlValidationError(
		'Unreachable',
		'https://nonexistent.test',
		'reachability',
	);
	expect(reachabilityError.validationStep).toBe('reachability');
});

// RequiredFieldError Tests
test('RequiredFieldError creates proper error instance', () => {
	const error = new RequiredFieldError('username');

	expect(error.code).toBe('REQUIRED_FIELD_ERROR');
	expect(error.message).toBe('username is required');
	expect(error.field).toBe('username');
	expect(error.value).toBe('');
	expect(error.validationType).toBe('required');
	expect(error.name).toBe('RequiredFieldError');
	expect(error instanceof RequiredFieldError).toBeTruthy();
	expect(error instanceof ValidationError).toBeTruthy();
	expect(error instanceof UxlintError).toBeTruthy();
});

test('RequiredFieldError uses default field name', () => {
	const error = new RequiredFieldError();

	expect(error.message).toBe('field is required');
	expect(error.field).toBe('field');
});

// LengthValidationError Tests
test('LengthValidationError creates proper error instance', () => {
	const error = new LengthValidationError('Too short', {
		actualLength: 2,
		expectedLength: 5,
		lengthType: 'min',
		value: 'hi',
		fieldName: 'password',
	});

	expect(error.code).toBe('LENGTH_VALIDATION_ERROR');
	expect(error.message).toBe('Too short');
	expect(error.field).toBe('password');
	expect(error.value).toBe('hi');
	expect(error.validationType).toBe('minLength');
	expect(error.actualLength).toBe(2);
	expect(error.expectedLength).toBe(5);
	expect(error.lengthType).toBe('min');
	expect(error.name).toBe('LengthValidationError');
	expect(error instanceof LengthValidationError).toBeTruthy();
	expect(error instanceof ValidationError).toBeTruthy();
	expect(error instanceof UxlintError).toBeTruthy();
});

test('LengthValidationError creates proper error instance for maxLength', () => {
	const error = new LengthValidationError('Too long', {
		actualLength: 10,
		expectedLength: 5,
		lengthType: 'max',
		value: 'toolongtext',
	});

	expect(error.validationType).toBe('maxLength');
	expect(error.lengthType).toBe('max');
	expect(error.field).toBe('field');
});

// UrlNormalizationError Tests
test('UrlNormalizationError creates proper error instance', () => {
	const originalError = new Error('Invalid URL');
	const error = new UrlNormalizationError(
		'Cannot normalize URL',
		'invalid-input',
		originalError,
	);

	expect(error.code).toBe('URL_NORMALIZATION_ERROR');
	expect(error.message).toBe('Cannot normalize URL');
	expect(error.originalInput).toBe('invalid-input');
	expect(error.cause).toBe(originalError);
	expect(error.name).toBe('UrlNormalizationError');
	expect(error instanceof UrlNormalizationError).toBeTruthy();
	expect(error instanceof UxlintError).toBeTruthy();
});

test('UrlNormalizationError works without cause', () => {
	const error = new UrlNormalizationError(
		'Cannot normalize URL',
		'invalid-input',
	);

	expect(error.originalInput).toBe('invalid-input');
	expect(error.cause).toBeUndefined();
});

// InputProcessingError Tests
test('InputProcessingError creates proper error instance', () => {
	const error = new InputProcessingError(
		'Processing failed',
		'sanitization',
		'dirty input',
	);

	expect(error.code).toBe('INPUT_PROCESSING_ERROR');
	expect(error.message).toBe('Processing failed');
	expect(error.processingStep).toBe('sanitization');
	expect(error.originalInput).toBe('dirty input');
	expect(error.name).toBe('InputProcessingError');
	expect(error instanceof InputProcessingError).toBeTruthy();
	expect(error instanceof UxlintError).toBeTruthy();
});

// ConfigurationError Tests
test('ConfigurationError creates proper error instance', () => {
	const error = new ConfigurationError(
		'Invalid config',
		'/path/to/config.json',
		'apiKey',
	);

	expect(error.code).toBe('CONFIGURATION_ERROR');
	expect(error.message).toBe('Invalid config');
	expect(error.configPath).toBe('/path/to/config.json');
	expect(error.configField).toBe('apiKey');
	expect(error.name).toBe('ConfigurationError');
	expect(error instanceof ConfigurationError).toBeTruthy();
	expect(error instanceof UxlintError).toBeTruthy();
});

test('ConfigurationError works with minimal parameters', () => {
	const error = new ConfigurationError('Invalid config');

	expect(error.message).toBe('Invalid config');
	expect(error.configPath).toBeUndefined();
	expect(error.configField).toBeUndefined();
});

// NetworkError Tests
test('NetworkError creates proper error instance', () => {
	const originalError = new Error('Connection timeout');
	const error = new NetworkError(
		'Network request failed',
		'https://example.com',
		404,
		originalError,
	);

	expect(error.code).toBe('NETWORK_ERROR');
	expect(error.message).toBe('Network request failed');
	expect(error.url).toBe('https://example.com');
	expect(error.statusCode).toBe(404);
	expect(error.cause).toBe(originalError);
	expect(error.name).toBe('NetworkError');
	expect(error instanceof NetworkError).toBeTruthy();
	expect(error instanceof UxlintError).toBeTruthy();
});

test('NetworkError works without status code and cause', () => {
	const error = new NetworkError(
		'Network request failed',
		'https://example.com',
	);

	expect(error.url).toBe('https://example.com');
	expect(error.statusCode).toBeUndefined();
	expect(error.cause).toBeUndefined();
});

// Type Guard Tests
test('isUxlintError identifies uxlint errors correctly', () => {
	const uxlintError = new ValidationError('test', 'field', 'value', 'type');
	const regularError = new Error('regular error');
	const notAnError = 'not an error';

	expect(isUxlintError(uxlintError)).toBeTruthy();
	expect(isUxlintError(regularError)).toBeFalsy();
	expect(isUxlintError(notAnError as unknown as Error)).toBeFalsy();
	expect(isUxlintError(null as unknown as Error)).toBeFalsy();
	expect(isUxlintError(undefined as unknown as Error)).toBeFalsy();
});

test('isErrorOfType identifies specific error types correctly', () => {
	const validationError = new ValidationError('test', 'field', 'value', 'type');
	const urlError = new UrlValidationError('test', 'url', 'format');
	const requiredError = new RequiredFieldError('field');
	const regularError = new Error('regular error');

	expect(isErrorOfType(validationError, ValidationError)).toBeTruthy();
	expect(isErrorOfType(urlError, ValidationError)).toBeTruthy();
	expect(isErrorOfType(requiredError, ValidationError)).toBeTruthy();
	expect(isErrorOfType(regularError, ValidationError)).toBeFalsy();

	expect(isErrorOfType(validationError, UrlValidationError)).toBeFalsy();
	expect(isErrorOfType(urlError, UrlValidationError)).toBeTruthy();
	expect(isErrorOfType(requiredError, UrlValidationError)).toBeFalsy();

	expect(isErrorOfType(validationError, RequiredFieldError)).toBeFalsy();
	expect(isErrorOfType(urlError, RequiredFieldError)).toBeFalsy();
	expect(isErrorOfType(requiredError, RequiredFieldError)).toBeTruthy();
});

// Error Info Extraction Tests
test('getErrorInfo extracts info from uxlint errors', () => {
	const error = new ValidationError(
		'Invalid input',
		'username',
		'test',
		'custom',
	);
	const info = getErrorInfo(error);

	expect(info.message).toBe('Invalid input');
	expect(info.code).toBe('VALIDATION_ERROR');
	expect(info.context !== undefined).toBeTruthy();
	expect(typeof info.stack).toBe('string');
	expect(info.stack && info.stack.length > 0).toBeTruthy();
});

test('getErrorInfo extracts info from regular errors', () => {
	const error = new Error('Regular error');
	const info = getErrorInfo(error);

	expect(info.message).toBe('Regular error');
	expect(info.code).toBeUndefined();
	expect(info.context).toBeUndefined();
	expect(typeof info.stack).toBe('string');
});

test('getErrorInfo handles non-error values', () => {
	const info1 = getErrorInfo('string error');
	expect(info1.message).toBe('string error');
	expect(info1.code).toBeUndefined();
	expect(info1.context).toBeUndefined();
	expect(info1.stack).toBeUndefined();

	const info2 = getErrorInfo(null);
	expect(info2.message).toBe('null');

	const info3 = getErrorInfo(undefined);
	expect(info3.message).toBe('undefined');

	const info4 = getErrorInfo(42);
	expect(info4.message).toBe('42');
});

// Error Inheritance Chain Tests
test('error inheritance chain is correct', () => {
	const urlError = new UrlValidationError('test', 'url', 'format');

	expect(urlError instanceof UrlValidationError).toBeTruthy();
	expect(urlError instanceof ValidationError).toBeTruthy();
	expect(urlError instanceof UxlintError).toBeTruthy();
	expect(urlError instanceof Error).toBeTruthy();

	expect(Object.getPrototypeOf(urlError).constructor).toBe(UrlValidationError);
	expect(
		Object.getPrototypeOf(Object.getPrototypeOf(urlError)).constructor,
	).toBe(ValidationError);
});

test('error names are set correctly', () => {
	const errors = [
		new ValidationError('test', 'field', 'value', 'type'),
		new UrlValidationError('test', 'url', 'format'),
		new RequiredFieldError('field'),
		new LengthValidationError('test', {
			actualLength: 1,
			expectedLength: 5,
			lengthType: 'min',
			value: 'x',
		}),
		new UrlNormalizationError('test', 'input'),
		new InputProcessingError('test', 'step', 'input'),
		new ConfigurationError('test'),
		new NetworkError('test', 'url'),
	];

	const expectedNames = [
		'ValidationError',
		'UrlValidationError',
		'RequiredFieldError',
		'LengthValidationError',
		'UrlNormalizationError',
		'InputProcessingError',
		'ConfigurationError',
		'NetworkError',
	];

	for (const [index, error] of errors.entries()) {
		expect(error.name).toBe(expectedNames[index]!);
	}
});
