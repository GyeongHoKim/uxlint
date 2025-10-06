import test from 'ava';
import {
	inputProcessor,
	validationEngine,
	UrlNormalizationError,
} from '../../source/models/index.js';

// URL Normalization Tests
test('inputProcessor.normalizeUrl adds protocol to URLs without protocol', t => {
	const result = inputProcessor.normalizeUrl('example.com');
	t.is(result.toString(), 'https://example.com/');
	t.is(result.hostname, 'example.com');
	t.is(result.protocol, 'https:');
});

test('inputProcessor.normalizeUrl preserves existing protocols', t => {
	const result1 = inputProcessor.normalizeUrl('https://example.com');
	t.is(result1.toString(), 'https://example.com/');
	t.is(result1.protocol, 'https:');

	const result2 = inputProcessor.normalizeUrl('http://localhost:8080');
	t.is(result2.toString(), 'http://localhost:8080/');
	t.is(result2.protocol, 'http:');
});

test('inputProcessor.normalizeUrl handles whitespace and quotes', t => {
	const result1 = inputProcessor.normalizeUrl('  example.com  ');
	t.is(result1.toString(), 'https://example.com/');

	const result2 = inputProcessor.normalizeUrl('"example.com"');
	t.is(result2.toString(), 'https://example.com/');

	const result3 = inputProcessor.normalizeUrl("'example.com'");
	t.is(result3.toString(), 'https://example.com/');
});

test('inputProcessor.normalizeUrl throws UrlNormalizationError for empty URLs', t => {
	const error = t.throws(() => inputProcessor.normalizeUrl(''), {
		instanceOf: UrlNormalizationError,
	});
	t.is(error?.message, 'URL cannot be empty');
});

test('inputProcessor.normalizeUrl handles complex URLs', t => {
	const result1 = inputProcessor.normalizeUrl(
		'example.com/path?query=value#hash',
	);
	t.is(result1.toString(), 'https://example.com/path?query=value#hash');
	t.is(result1.pathname, '/path');
	t.is(result1.search, '?query=value');
	t.is(result1.hash, '#hash');

	const result2 = inputProcessor.normalizeUrl('sub.domain.com:8080/api/v1');
	t.is(result2.toString(), 'https://sub.domain.com:8080/api/v1');
	t.is(result2.hostname, 'sub.domain.com');
	t.is(result2.port, '8080');
});

// URL String Normalization Tests
test('inputProcessor.normalizeUrlString returns normalized URL as string', t => {
	t.is(
		inputProcessor.normalizeUrlString('example.com'),
		'https://example.com/',
	);
	t.is(
		inputProcessor.normalizeUrlString('https://google.com'),
		'https://google.com/',
	);
	t.is(
		inputProcessor.normalizeUrlString('localhost:3000/api'),
		'https://localhost:3000/api',
	);
});

// Input Sanitization Tests
test('inputProcessor.sanitizeInput removes dangerous characters', t => {
	t.is(inputProcessor.sanitizeInput('hello\u0000world'), 'helloworld');
	t.is(inputProcessor.sanitizeInput('hello\u007Fworld'), 'helloworld');
	t.is(inputProcessor.sanitizeInput('test\u0000\u007Finput'), 'testinput');
});

test('inputProcessor.sanitizeInput normalizes whitespace', t => {
	t.is(inputProcessor.sanitizeInput('hello    world'), 'hello world');
	t.is(inputProcessor.sanitizeInput('hello\t\n\r world'), 'hello world');
	t.is(inputProcessor.sanitizeInput('  hello \t\n world  '), 'hello world');
	t.is(inputProcessor.sanitizeInput('   test   '), 'test');
});

test('inputProcessor.sanitizeInput handles edge cases', t => {
	// Empty string
	t.is(inputProcessor.sanitizeInput(''), '');

	// Null/undefined
	t.is(inputProcessor.sanitizeInput(null as unknown as string), '');
	t.is(inputProcessor.sanitizeInput(undefined as unknown as string), '');

	// Only whitespace
	t.is(inputProcessor.sanitizeInput('   \t\n   '), '');
});

test('inputProcessor.sanitizeInput preserves valid content', t => {
	t.is(inputProcessor.sanitizeInput('Hello World'), 'Hello World');
	t.is(
		inputProcessor.sanitizeInput('https://example.com'),
		'https://example.com',
	);
	t.is(inputProcessor.sanitizeInput('test@example.com'), 'test@example.com');
});

// Submission Processing Tests
test('inputProcessor.processSubmission processes input without validator', t => {
	const result = inputProcessor.processSubmission('  hello world  ');
	t.is(result.originalValue, '  hello world  ');
	t.is(result.processedValue, 'hello world');
});

test('inputProcessor.processSubmission processes input with validator', t => {
	const result = inputProcessor.processSubmission(
		'  example.com  ',
		validationEngine.url,
	);
	t.is(result.originalValue, '  example.com  ');
	t.is(result.processedValue, 'https://example.com/');
});

test('inputProcessor.processSubmission sanitizes before validation', t => {
	const result = inputProcessor.processSubmission(
		'hello\u0000world.com',
		validationEngine.url,
	);
	t.is(result.originalValue, 'hello\u0000world.com');
	t.is(result.processedValue, 'https://helloworld.com/');
});

// Text Cleaning Tests
test('inputProcessor.cleanText performs minimal normalization', t => {
	t.is(inputProcessor.cleanText('  hello   world  '), 'hello world');
	t.is(inputProcessor.cleanText('hello\t\nworld'), 'hello world');
	t.is(inputProcessor.cleanText('hello world'), 'hello world');
});

test('inputProcessor.cleanText handles edge cases', t => {
	t.is(inputProcessor.cleanText(''), '');
	t.is(inputProcessor.cleanText(null as unknown as string), '');
	t.is(inputProcessor.cleanText(undefined as unknown as string), '');
	t.is(inputProcessor.cleanText('   \t\n   '), '');
});

// Domain Extraction Tests
test('inputProcessor.extractDomain extracts hostname from URLs', t => {
	t.is(inputProcessor.extractDomain('https://example.com'), 'example.com');
	t.is(inputProcessor.extractDomain('example.com'), 'example.com');
	t.is(inputProcessor.extractDomain('sub.domain.com:8080'), 'sub.domain.com');
});

test('inputProcessor.extractDomain handles complex URLs', t => {
	t.is(
		inputProcessor.extractDomain('https://api.example.com/v1/users?id=123'),
		'api.example.com',
	);
	t.is(inputProcessor.extractDomain('localhost:3000'), 'localhost');
});
