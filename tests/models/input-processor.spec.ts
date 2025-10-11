// Using Jest globals
import {
	inputProcessor,
	UrlNormalizationError,
	validationEngine,
} from '../../source/models/index.js';

// URL Normalization Tests
test('inputProcessor.normalizeUrl adds protocol to URLs without protocol', () => {
	const result = inputProcessor.normalizeUrl('example.com');
	expect(result.toString()).toBe('https://example.com/');
	expect(result.hostname).toBe('example.com');
	expect(result.protocol).toBe('https:');
});

test('inputProcessor.normalizeUrl preserves existing protocols', () => {
	const result1 = inputProcessor.normalizeUrl('https://example.com');
	expect(result1.toString()).toBe('https://example.com/');
	expect(result1.protocol).toBe('https:');

	const result2 = inputProcessor.normalizeUrl('http://localhost:8080');
	expect(result2.toString()).toBe('http://localhost:8080/');
	expect(result2.protocol).toBe('http:');
});

test('inputProcessor.normalizeUrl handles whitespace and quotes', () => {
	const result1 = inputProcessor.normalizeUrl('  example.com  ');
	expect(result1.toString()).toBe('https://example.com/');

	const result2 = inputProcessor.normalizeUrl('"example.com"');
	expect(result2.toString()).toBe('https://example.com/');

	const result3 = inputProcessor.normalizeUrl("'example.com'");
	expect(result3.toString()).toBe('https://example.com/');
});

test('inputProcessor.normalizeUrl throws UrlNormalizationError for empty URLs', () => {
	const action = () => inputProcessor.normalizeUrl('');
	expect(action).toThrow(UrlNormalizationError);
	expect(action).toThrow('URL cannot be empty');
});

test('inputProcessor.normalizeUrl handles complex URLs', () => {
	const result1 = inputProcessor.normalizeUrl(
		'example.com/path?query=value#hash',
	);
	expect(result1.toString()).toBe('https://example.com/path?query=value#hash');
	expect(result1.pathname).toBe('/path');
	expect(result1.search).toBe('?query=value');
	expect(result1.hash).toBe('#hash');

	const result2 = inputProcessor.normalizeUrl('sub.domain.com:8080/api/v1');
	expect(result2.toString()).toBe('https://sub.domain.com:8080/api/v1');
	expect(result2.hostname).toBe('sub.domain.com');
	expect(result2.port).toBe('8080');
});

// URL String Normalization Tests
test('inputProcessor.normalizeUrlString returns normalized URL as string', () => {
	expect(inputProcessor.normalizeUrlString('example.com')).toBe(
		'https://example.com/',
	);
	expect(inputProcessor.normalizeUrlString('https://google.com')).toBe(
		'https://google.com/',
	);
	expect(inputProcessor.normalizeUrlString('localhost:3000/api')).toBe(
		'https://localhost:3000/api',
	);
});

// Input Sanitization Tests
test('inputProcessor.sanitizeInput removes dangerous characters', () => {
	expect(inputProcessor.sanitizeInput('hello\u0000world')).toBe('helloworld');
	expect(inputProcessor.sanitizeInput('hello\u007Fworld')).toBe('helloworld');
	expect(inputProcessor.sanitizeInput('test\u0000\u007Finput')).toBe(
		'testinput',
	);
});

test('inputProcessor.sanitizeInput normalizes whitespace', () => {
	expect(inputProcessor.sanitizeInput('hello    world')).toBe('hello world');
	expect(inputProcessor.sanitizeInput('hello\t\n\r world')).toBe('hello world');
	expect(inputProcessor.sanitizeInput('  hello \t\n world  ')).toBe(
		'hello world',
	);
	expect(inputProcessor.sanitizeInput('   test   ')).toBe('test');
});

test('inputProcessor.sanitizeInput handles edge cases', () => {
	// Empty string
	expect(inputProcessor.sanitizeInput('')).toBe('');

	// Null/undefined
	expect(inputProcessor.sanitizeInput(null as unknown as string)).toBe('');
	expect(inputProcessor.sanitizeInput(undefined as unknown as string)).toBe('');

	// Only whitespace
	expect(inputProcessor.sanitizeInput('   \t\n   ')).toBe('');
});

test('inputProcessor.sanitizeInput preserves valid content', () => {
	expect(inputProcessor.sanitizeInput('Hello World')).toBe('Hello World');
	expect(inputProcessor.sanitizeInput('https://example.com')).toBe(
		'https://example.com',
	);
	expect(inputProcessor.sanitizeInput('test@example.com')).toBe(
		'test@example.com',
	);
});

// Submission Processing Tests
test('inputProcessor.processSubmission processes input without validator', () => {
	const result = inputProcessor.processSubmission('  hello world  ');
	expect(result.originalValue).toBe('  hello world  ');
	expect(result.processedValue).toBe('hello world');
});

test('inputProcessor.processSubmission processes input with validator', () => {
	const result = inputProcessor.processSubmission(
		'  example.com  ',
		validationEngine.url,
	);
	expect(result.originalValue).toBe('  example.com  ');
	expect(result.processedValue).toBe('https://example.com/');
});

test('inputProcessor.processSubmission sanitizes before validation', () => {
	const result = inputProcessor.processSubmission(
		'hello\u0000world.com',
		validationEngine.url,
	);
	expect(result.originalValue).toBe('hello\u0000world.com');
	expect(result.processedValue).toBe('https://helloworld.com/');
});

// Text Cleaning Tests
test('inputProcessor.cleanText performs minimal normalization', () => {
	expect(inputProcessor.cleanText('  hello   world  ')).toBe('hello world');
	expect(inputProcessor.cleanText('hello\t\nworld')).toBe('hello world');
	expect(inputProcessor.cleanText('hello world')).toBe('hello world');
});

test('inputProcessor.cleanText handles edge cases', () => {
	expect(inputProcessor.cleanText('')).toBe('');
	expect(inputProcessor.cleanText(null as unknown as string)).toBe('');
	expect(inputProcessor.cleanText(undefined as unknown as string)).toBe('');
	expect(inputProcessor.cleanText('   \t\n   ')).toBe('');
});

// Domain Extraction Tests
test('inputProcessor.extractDomain extracts hostname from URLs', () => {
	expect(inputProcessor.extractDomain('https://example.com')).toBe(
		'example.com',
	);
	expect(inputProcessor.extractDomain('example.com')).toBe('example.com');
	expect(inputProcessor.extractDomain('sub.domain.com:8080')).toBe(
		'sub.domain.com',
	);
});

test('inputProcessor.extractDomain handles complex URLs', () => {
	expect(
		inputProcessor.extractDomain('https://api.example.com/v1/users?id=123'),
	).toBe('api.example.com');
	expect(inputProcessor.extractDomain('localhost:3000')).toBe('localhost');
});
