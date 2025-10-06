import test from 'ava';
import {
	validationEngine,
	ValidationError,
	RequiredFieldError,
	LengthValidationError,
} from '../../source/models/index.js';

// URL Validation Tests
test('validationEngine.url validates valid URLs correctly', t => {
	t.is(validationEngine.url('https://example.com'), 'https://example.com/');
	t.is(validationEngine.url('example.com'), 'https://example.com/');
	t.is(validationEngine.url('localhost:3000'), 'https://localhost:3000/');
});

test('validationEngine.url throws RequiredFieldError for empty URLs', t => {
	const error = t.throws(() => validationEngine.url(''), {
		instanceOf: RequiredFieldError,
	});
	t.is(error?.message, 'URL is required');
});

// Required Field Validation Tests
test('validationEngine.required validates non-empty values', t => {
	t.is(validationEngine.required('hello'), 'hello');
	t.is(validationEngine.required('  world  '), 'world');
});

test('validationEngine.required throws RequiredFieldError for empty values', t => {
	const error = t.throws(() => validationEngine.required(''), {
		instanceOf: RequiredFieldError,
	});
	t.is(error?.message, 'field is required');
});

// Length Validation Tests
test('validationEngine.minLength creates validator that accepts valid lengths', t => {
	const validator = validationEngine.minLength(5);
	t.is(validator('hello'), 'hello');
	t.is(validator('hello world'), 'hello world');
});

test('validationEngine.minLength creates validator that throws for short values', t => {
	const validator = validationEngine.minLength(5);
	const error = t.throws(() => validator('hi'), {
		instanceOf: LengthValidationError,
	});
	t.is(error?.message, 'Must be at least 5 characters long');
});

test('validationEngine.maxLength creates validator that accepts valid lengths', t => {
	const validator = validationEngine.maxLength(10);
	t.is(validator('hello'), 'hello');
	t.is(validator('short'), 'short');
});

test('validationEngine.maxLength creates validator that throws for long values', t => {
	const validator = validationEngine.maxLength(5);
	const error = t.throws(() => validator('hello world'), {
		instanceOf: LengthValidationError,
	});
	t.is(error?.message, 'Must be no more than 5 characters long');
});

// Custom Validation Tests
test('validationEngine.custom creates validator with custom logic', t => {
	const emailValidator = validationEngine.custom(
		(value: string) => value.includes('@'),
		'Must be a valid email',
		'email',
	);

	t.is(emailValidator('test@example.com'), 'test@example.com');

	const error = t.throws(() => emailValidator('invalid-email'), {
		instanceOf: ValidationError,
	});
	t.is(error?.message, 'Must be a valid email');
});

// Composition Tests
test('validationEngine.compose combines validators correctly', t => {
	const composedValidator = validationEngine.compose(
		validationEngine.required,
		validationEngine.minLength(5),
		validationEngine.url,
	);

	const result = composedValidator('https://example.com');
	t.is(result, 'https://example.com/');
});

test('validationEngine.compose throws on first failing validator', t => {
	const composedValidator = validationEngine.compose(
		validationEngine.required,
		validationEngine.minLength(5),
		validationEngine.url,
	);

	// Should fail on first validator (required)
	const error1 = t.throws(() => composedValidator(''), {
		instanceOf: RequiredFieldError,
	});
	t.is(error1?.message, 'field is required');

	// Should fail on second validator (minLength)
	const error2 = t.throws(() => composedValidator('hi'), {
		instanceOf: LengthValidationError,
	});
	t.is(error2?.message, 'Must be at least 5 characters long');
});
