import test from 'ava';
import {
	ValidationError,
	UrlValidationError,
	RequiredFieldError,
	LengthValidationError,
	UrlNormalizationError,
	InputProcessingError,
	ConfigurationError,
	NetworkError,
	isUxlintError,
	isErrorOfType,
	getErrorInfo,
} from '../../source/models/index.js';
import {UxlintError} from '../../source/models/errors.js';

// ValidationError Tests
test('ValidationError creates proper error instance', t => {
	const error = new ValidationError(
		'Invalid input',
		'username',
		'test',
		'custom',
	);

	t.is(error.code, 'VALIDATION_ERROR');
	t.is(error.message, 'Invalid input');
	t.is(error.field, 'username');
	t.is(error.value, 'test');
	t.is(error.validationType, 'custom');
	t.is(error.name, 'ValidationError');
	t.true(error instanceof ValidationError);
	t.true(error instanceof UxlintError);
});

// UrlValidationError Tests
test('UrlValidationError extends ValidationError', t => {
	const error = new UrlValidationError(
		'Invalid URL format',
		'not-a-url',
		'format',
	);

	t.is(error.code, 'URL_VALIDATION_ERROR');
	t.is(error.message, 'Invalid URL format');
	t.is(error.originalUrl, 'not-a-url');
	t.is(error.validationStep, 'format');
	t.is(error.field, 'url');
	t.is(error.validationType, 'url');
	t.is(error.name, 'UrlValidationError');
	t.true(error instanceof UrlValidationError);
	t.true(error instanceof ValidationError);
	t.true(error instanceof UxlintError);
});

test('UrlValidationError handles different validation steps', t => {
	const formatError = new UrlValidationError(
		'Format error',
		'invalid',
		'format',
	);
	t.is(formatError.validationStep, 'format');

	const protocolError = new UrlValidationError(
		'Protocol error',
		'ftp://test',
		'protocol',
	);
	t.is(protocolError.validationStep, 'protocol');

	const hostnameError = new UrlValidationError(
		'Hostname error',
		'https://',
		'hostname',
	);
	t.is(hostnameError.validationStep, 'hostname');

	const reachabilityError = new UrlValidationError(
		'Unreachable',
		'https://nonexistent.test',
		'reachability',
	);
	t.is(reachabilityError.validationStep, 'reachability');
});

// RequiredFieldError Tests
test('RequiredFieldError creates proper error instance', t => {
	const error = new RequiredFieldError('username');

	t.is(error.code, 'REQUIRED_FIELD_ERROR');
	t.is(error.message, 'username is required');
	t.is(error.field, 'username');
	t.is(error.value, '');
	t.is(error.validationType, 'required');
	t.is(error.name, 'RequiredFieldError');
	t.true(error instanceof RequiredFieldError);
	t.true(error instanceof ValidationError);
	t.true(error instanceof UxlintError);
});

test('RequiredFieldError uses default field name', t => {
	const error = new RequiredFieldError();

	t.is(error.message, 'field is required');
	t.is(error.field, 'field');
});

// LengthValidationError Tests
test('LengthValidationError creates proper error instance', t => {
	const error = new LengthValidationError('Too short', {
		actualLength: 2,
		expectedLength: 5,
		lengthType: 'min',
		value: 'hi',
		fieldName: 'password',
	});

	t.is(error.code, 'LENGTH_VALIDATION_ERROR');
	t.is(error.message, 'Too short');
	t.is(error.field, 'password');
	t.is(error.value, 'hi');
	t.is(error.validationType, 'minLength');
	t.is(error.actualLength, 2);
	t.is(error.expectedLength, 5);
	t.is(error.lengthType, 'min');
	t.is(error.name, 'LengthValidationError');
	t.true(error instanceof LengthValidationError);
	t.true(error instanceof ValidationError);
	t.true(error instanceof UxlintError);
});

test('LengthValidationError creates proper error instance for maxLength', t => {
	const error = new LengthValidationError('Too long', {
		actualLength: 10,
		expectedLength: 5,
		lengthType: 'max',
		value: 'toolongtext',
	});

	t.is(error.validationType, 'maxLength');
	t.is(error.lengthType, 'max');
	t.is(error.field, 'field'); // Default field name
});

// UrlNormalizationError Tests
test('UrlNormalizationError creates proper error instance', t => {
	const originalError = new Error('Invalid URL');
	const error = new UrlNormalizationError(
		'Cannot normalize URL',
		'invalid-input',
		originalError,
	);

	t.is(error.code, 'URL_NORMALIZATION_ERROR');
	t.is(error.message, 'Cannot normalize URL');
	t.is(error.originalInput, 'invalid-input');
	t.is(error.cause, originalError);
	t.is(error.name, 'UrlNormalizationError');
	t.true(error instanceof UrlNormalizationError);
	t.true(error instanceof UxlintError);
});

test('UrlNormalizationError works without cause', t => {
	const error = new UrlNormalizationError(
		'Cannot normalize URL',
		'invalid-input',
	);

	t.is(error.originalInput, 'invalid-input');
	t.is(error.cause, undefined);
});

// InputProcessingError Tests
test('InputProcessingError creates proper error instance', t => {
	const error = new InputProcessingError(
		'Processing failed',
		'sanitization',
		'dirty input',
	);

	t.is(error.code, 'INPUT_PROCESSING_ERROR');
	t.is(error.message, 'Processing failed');
	t.is(error.processingStep, 'sanitization');
	t.is(error.originalInput, 'dirty input');
	t.is(error.name, 'InputProcessingError');
	t.true(error instanceof InputProcessingError);
	t.true(error instanceof UxlintError);
});

// ConfigurationError Tests
test('ConfigurationError creates proper error instance', t => {
	const error = new ConfigurationError(
		'Invalid config',
		'/path/to/config.json',
		'apiKey',
	);

	t.is(error.code, 'CONFIGURATION_ERROR');
	t.is(error.message, 'Invalid config');
	t.is(error.configPath, '/path/to/config.json');
	t.is(error.configField, 'apiKey');
	t.is(error.name, 'ConfigurationError');
	t.true(error instanceof ConfigurationError);
	t.true(error instanceof UxlintError);
});

test('ConfigurationError works with minimal parameters', t => {
	const error = new ConfigurationError('Invalid config');

	t.is(error.message, 'Invalid config');
	t.is(error.configPath, undefined);
	t.is(error.configField, undefined);
});

// NetworkError Tests
test('NetworkError creates proper error instance', t => {
	const originalError = new Error('Connection timeout');
	const error = new NetworkError(
		'Network request failed',
		'https://example.com',
		404,
		originalError,
	);

	t.is(error.code, 'NETWORK_ERROR');
	t.is(error.message, 'Network request failed');
	t.is(error.url, 'https://example.com');
	t.is(error.statusCode, 404);
	t.is(error.cause, originalError);
	t.is(error.name, 'NetworkError');
	t.true(error instanceof NetworkError);
	t.true(error instanceof UxlintError);
});

test('NetworkError works without status code and cause', t => {
	const error = new NetworkError(
		'Network request failed',
		'https://example.com',
	);

	t.is(error.url, 'https://example.com');
	t.is(error.statusCode, undefined);
	t.is(error.cause, undefined);
});

// Type Guard Tests
test('isUxlintError identifies uxlint errors correctly', t => {
	const uxlintError = new ValidationError('test', 'field', 'value', 'type');
	const regularError = new Error('regular error');
	const notAnError = 'not an error';

	t.true(isUxlintError(uxlintError));
	t.false(isUxlintError(regularError));
	t.false(isUxlintError(notAnError));
	t.false(isUxlintError(null));
	t.false(isUxlintError(undefined));
});

test('isErrorOfType identifies specific error types correctly', t => {
	const validationError = new ValidationError('test', 'field', 'value', 'type');
	const urlError = new UrlValidationError('test', 'url', 'format');
	const requiredError = new RequiredFieldError('field');
	const regularError = new Error('regular error');

	// Test ValidationError
	t.true(isErrorOfType(validationError, ValidationError));
	t.true(isErrorOfType(urlError, ValidationError)); // UrlValidationError extends ValidationError
	t.true(isErrorOfType(requiredError, ValidationError)); // RequiredFieldError extends ValidationError
	t.false(isErrorOfType(regularError, ValidationError));

	// Test UrlValidationError
	t.false(isErrorOfType(validationError, UrlValidationError));
	t.true(isErrorOfType(urlError, UrlValidationError));
	t.false(isErrorOfType(requiredError, UrlValidationError));

	// Test RequiredFieldError
	t.false(isErrorOfType(validationError, RequiredFieldError));
	t.false(isErrorOfType(urlError, RequiredFieldError));
	t.true(isErrorOfType(requiredError, RequiredFieldError));
});

// Error Info Extraction Tests
test('getErrorInfo extracts info from uxlint errors', t => {
	const error = new ValidationError(
		'Invalid input',
		'username',
		'test',
		'custom',
	);
	const info = getErrorInfo(error);

	t.is(info.message, 'Invalid input');
	t.is(info.code, 'VALIDATION_ERROR');
	t.true(info.context !== undefined);
	t.is(typeof info.stack, 'string');
	t.true(info.stack!.length > 0);
});

test('getErrorInfo extracts info from regular errors', t => {
	const error = new Error('Regular error');
	const info = getErrorInfo(error);

	t.is(info.message, 'Regular error');
	t.is(info.code, undefined);
	t.is(info.context, undefined);
	t.is(typeof info.stack, 'string');
});

test('getErrorInfo handles non-error values', t => {
	const info1 = getErrorInfo('string error');
	t.is(info1.message, 'string error');
	t.is(info1.code, undefined);
	t.is(info1.context, undefined);
	t.is(info1.stack, undefined);

	const info2 = getErrorInfo(null);
	t.is(info2.message, 'null');

	const info3 = getErrorInfo(undefined);
	t.is(info3.message, 'undefined');

	const info4 = getErrorInfo(42);
	t.is(info4.message, '42');
});

// Error Inheritance Chain Tests
test('error inheritance chain is correct', t => {
	const urlError = new UrlValidationError('test', 'url', 'format');

	// Should be instance of all parent classes
	t.true(urlError instanceof UrlValidationError);
	t.true(urlError instanceof ValidationError);
	t.true(urlError instanceof UxlintError);
	t.true(urlError instanceof Error);

	// Should have correct prototype chain
	t.is(Object.getPrototypeOf(urlError).constructor, UrlValidationError);
	t.is(
		Object.getPrototypeOf(Object.getPrototypeOf(urlError)).constructor,
		ValidationError,
	);
});

test('error names are set correctly', t => {
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
		t.is(error.name, expectedNames[index]!);
	}
});
