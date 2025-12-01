import test from 'ava';
import {
	RequiredFieldError,
	UrlValidationError,
} from '../../dist/models/errors.js';
import {validationEngine} from '../../dist/models/validation-engine.js';

test('validationEngine.url() validates correct URL', t => {
	const url = validationEngine.url('https://example.com');
	t.true(url.startsWith('https://example.com'));
});

test('validationEngine.url() adds https:// prefix when missing', t => {
	const url = validationEngine.url('example.com');
	t.true(url.startsWith('https://example.com'));
});

test('validationEngine.url() throws RequiredFieldError for empty URL', t => {
	t.throws(() => validationEngine.url(''), {
		instanceOf: RequiredFieldError,
	});
	t.throws(() => validationEngine.url('   '), {
		instanceOf: RequiredFieldError,
	});
});

test('validationEngine.url() throws UrlValidationError for invalid URL', t => {
	t.throws(() => validationEngine.url('http://'), {
		instanceOf: UrlValidationError,
	});
});

test('validationEngine.required() validates non-empty string', t => {
	const value = validationEngine.required('test', 'Field');
	t.is(value, 'test');
});

test('validationEngine.required() trims whitespace', t => {
	const value = validationEngine.required('  test  ', 'Field');
	t.is(value, 'test');
});

test('validationEngine.required() throws for empty string', t => {
	t.throws(() => validationEngine.required('', 'Field'), {
		instanceOf: RequiredFieldError,
	});
	t.throws(() => validationEngine.required('   ', 'Field'), {
		instanceOf: RequiredFieldError,
	});
});

test('validationEngine.persona() validates persona with minimum length', t => {
	const persona =
		'This is a valid persona description with more than 20 characters';
	const result = validationEngine.persona(persona);
	t.is(result, persona.trim());
});

test('validationEngine.persona() throws for too short persona', t => {
	t.throws(() => validationEngine.persona('short'), {
		instanceOf: Error,
	});
});

test('validationEngine.featureDescription() validates feature with minimum length', t => {
	const feature =
		'This is a valid feature description with more than 10 characters';
	const result = validationEngine.featureDescription(feature);
	t.is(result, feature.trim());
});

test('validationEngine.featureDescription() throws for too short feature', t => {
	t.throws(() => validationEngine.featureDescription('short'), {
		instanceOf: Error,
	});
});
