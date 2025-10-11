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

// Feature Description Validation Tests
test('validationEngine.featureDescription validates valid descriptions', () => {
	expect(
		validationEngine.featureDescription(
			'Home page with hero section and navigation',
		),
	).toBe('Home page with hero section and navigation');
	expect(validationEngine.featureDescription('1234567890')).toBe('1234567890');
});

test('validationEngine.featureDescription throws for empty or short descriptions', () => {
	const action1 = () => validationEngine.featureDescription('');
	expect(action1).toThrow(RequiredFieldError);

	const action2 = () => validationEngine.featureDescription('Short');
	expect(action2).toThrow(LengthValidationError);
	expect(action2).toThrow('at least 10 characters');
});

// Persona Validation Tests
test('validationEngine.persona validates valid persona descriptions', () => {
	const persona = 'Developer looking for CLI tools with focus on accessibility';
	expect(validationEngine.persona(persona)).toBe(persona);
	expect(validationEngine.persona('12345678901234567890')).toBe(
		'12345678901234567890',
	);
});

test('validationEngine.persona throws for empty or short descriptions', () => {
	const action1 = () => validationEngine.persona('');
	expect(action1).toThrow(RequiredFieldError);

	const action2 = () => validationEngine.persona('Developer');
	expect(action2).toThrow(LengthValidationError);
	expect(action2).toThrow('at least 20 characters');
});

// Report Path Validation Tests
test('validationEngine.reportPath validates valid paths', () => {
	expect(validationEngine.reportPath('./ux-report.md')).toBe('./ux-report.md');
	expect(validationEngine.reportPath('/home/user/reports/ux-report.md')).toBe(
		'/home/user/reports/ux-report.md',
	);
});

test('validationEngine.reportPath throws for invalid paths', () => {
	const action1 = () => validationEngine.reportPath('');
	expect(action1).toThrow(RequiredFieldError);

	const action2 = () => validationEngine.reportPath('./report<test>.md');
	expect(action2).toThrow(ValidationError);
	expect(action2).toThrow('invalid characters');
});

// File Path Validation Tests
test('validationEngine.filePath validates valid file paths', () => {
	expect(validationEngine.filePath('./config.yaml')).toBe('./config.yaml');
	expect(validationEngine.filePath('/etc/config.json')).toBe(
		'/etc/config.json',
	);
});

test('validationEngine.filePath throws for invalid paths', () => {
	const action1 = () => validationEngine.filePath('');
	expect(action1).toThrow(RequiredFieldError);

	const action2 = () => validationEngine.filePath('./file|name.txt');
	expect(action2).toThrow(ValidationError);
	expect(action2).toThrow('invalid characters');
});

// Config Format Validation Tests
test('validationEngine.configFormat validates yaml and json', () => {
	expect(validationEngine.configFormat('yaml')).toBe('yaml');
	expect(validationEngine.configFormat('json')).toBe('json');
	expect(validationEngine.configFormat('YAML')).toBe('yaml');
	expect(validationEngine.configFormat('JSON')).toBe('json');
});

test('validationEngine.configFormat throws for invalid formats', () => {
	const action1 = () => validationEngine.configFormat('xml');
	expect(action1).toThrow(ValidationError);
	expect(action1).toThrow('yaml');
	expect(action1).toThrow('json');

	const action2 = () => validationEngine.configFormat('toml');
	expect(action2).toThrow(ValidationError);
});
