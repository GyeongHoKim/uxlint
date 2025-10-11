// Using Jest globals
import {
	LengthValidationError,
	RequiredFieldError,
	validationEngine,
	ValidationError,
} from '../../source/models/index.js';

// URL Validation Tests
test('validationEngine.url validates valid URLs correctly', () => {
	expect(validationEngine.url('https://example.com')).toBe(
		'https://example.com/',
	);
	expect(validationEngine.url('example.com')).toBe('https://example.com/');
	expect(validationEngine.url('localhost:3000')).toBe(
		'https://localhost:3000/',
	);
});

test('validationEngine.url throws RequiredFieldError for empty URLs', () => {
	const action = () => validationEngine.url('');
	expect(action).toThrow(RequiredFieldError);
	expect(action).toThrow('URL is required');
});

// Required Field Validation Tests
test('validationEngine.required validates non-empty values', () => {
	expect(validationEngine.required('hello')).toBe('hello');
	expect(validationEngine.required('  world  ')).toBe('world');
});

test('validationEngine.required throws RequiredFieldError for empty values', () => {
	const action = () => validationEngine.required('');
	expect(action).toThrow(RequiredFieldError);
	expect(action).toThrow('field is required');
});

// Length Validation Tests
test('validationEngine.minLength creates validator that accepts valid lengths', () => {
	const validator = validationEngine.minLength(5);
	expect(validator('hello')).toBe('hello');
	expect(validator('hello world')).toBe('hello world');
});

test('validationEngine.minLength creates validator that throws for short values', () => {
	const validator = validationEngine.minLength(5);
	const action = () => validator('hi');
	expect(action).toThrow(LengthValidationError);
	expect(action).toThrow('Must be at least 5 characters long');
});

test('validationEngine.maxLength creates validator that accepts valid lengths', () => {
	const validator = validationEngine.maxLength(10);
	expect(validator('hello')).toBe('hello');
	expect(validator('short')).toBe('short');
});

test('validationEngine.maxLength creates validator that throws for long values', () => {
	const validator = validationEngine.maxLength(5);
	const action = () => validator('hello world');
	expect(action).toThrow(LengthValidationError);
	expect(action).toThrow('Must be no more than 5 characters long');
});

// Custom Validation Tests
test('validationEngine.custom creates validator with custom logic', () => {
	const emailValidator = validationEngine.custom(
		(value: string) => value.includes('@'),
		'Must be a valid email',
		'email',
	);

	expect(emailValidator('test@example.com')).toBe('test@example.com');

	const action = () => emailValidator('invalid-email');
	expect(action).toThrow(ValidationError);
	expect(action).toThrow('Must be a valid email');
});

// Composition Tests
test('validationEngine.compose combines validators correctly', () => {
	const composedValidator = validationEngine.compose(
		validationEngine.required,
		validationEngine.minLength(5),
		validationEngine.url,
	);

	const result = composedValidator('https://example.com');
	expect(result).toBe('https://example.com/');
});

test('validationEngine.compose throws on first failing validator', () => {
	const composedValidator = validationEngine.compose(
		validationEngine.required,
		validationEngine.minLength(5),
		validationEngine.url,
	);

	const action1 = () => composedValidator('');
	expect(action1).toThrow(RequiredFieldError);
	expect(action1).toThrow('field is required');

	const action2 = () => composedValidator('hi');
	expect(action2).toThrow(LengthValidationError);
	expect(action2).toThrow('Must be at least 5 characters long');
});
