import {createHash} from 'node:crypto';
import test from 'ava';
import {generatePKCEParameters} from '../../../source/infrastructure/auth/pkce-generator.js';

test('generatePKCEParameters returns valid PKCE parameters', t => {
	const parameters = generatePKCEParameters();

	// Verify structure
	t.truthy(parameters.codeVerifier);
	t.truthy(parameters.codeChallenge);
	t.is(parameters.codeChallengeMethod, 'S256');
	t.truthy(parameters.state);
});

test('code verifier is 43-128 characters (RFC 7636 requirement)', t => {
	const parameters = generatePKCEParameters();

	// Base64URL encoding of 32 bytes produces 43 characters (no padding)
	t.is(parameters.codeVerifier.length, 43);
	t.true(parameters.codeVerifier.length >= 43);
	t.true(parameters.codeVerifier.length <= 128);
});

test('code verifier is URL-safe Base64 (no +, /, or =)', t => {
	const parameters = generatePKCEParameters();

	// Should not contain Base64 special characters that are not URL-safe
	t.false(parameters.codeVerifier.includes('+'));
	t.false(parameters.codeVerifier.includes('/'));
	t.false(parameters.codeVerifier.includes('='));

	// Should only contain [A-Za-z0-9_-]
	t.regex(parameters.codeVerifier, /^[\w-]+$/);
});

test('code challenge is SHA-256 hash of verifier', t => {
	const parameters = generatePKCEParameters();

	// Manually compute SHA-256 hash of code verifier
	const expectedChallenge = createHash('sha256')
		.update(parameters.codeVerifier)
		.digest('base64')
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');

	t.is(parameters.codeChallenge, expectedChallenge);
});

test('code challenge is URL-safe Base64', t => {
	const parameters = generatePKCEParameters();

	// Should not contain Base64 special characters that are not URL-safe
	t.false(parameters.codeChallenge.includes('+'));
	t.false(parameters.codeChallenge.includes('/'));
	t.false(parameters.codeChallenge.includes('='));

	// Should only contain [A-Za-z0-9_-]
	t.regex(parameters.codeChallenge, /^[\w-]+$/);
});

test('state is cryptographically random and URL-safe', t => {
	const parameters = generatePKCEParameters();

	// State should be 43 characters (32 bytes in Base64URL)
	t.is(parameters.state.length, 43);

	// Should not contain Base64 special characters that are not URL-safe
	t.false(parameters.state.includes('+'));
	t.false(parameters.state.includes('/'));
	t.false(parameters.state.includes('='));

	// Should only contain [A-Za-z0-9_-]
	t.regex(parameters.state, /^[\w-]+$/);
});

test('generates different parameters on each call (randomness)', t => {
	const parameters1 = generatePKCEParameters();
	const parameters2 = generatePKCEParameters();

	// Each call should produce different values
	t.not(parameters1.codeVerifier, parameters2.codeVerifier);
	t.not(parameters1.codeChallenge, parameters2.codeChallenge);
	t.not(parameters1.state, parameters2.state);
});

test('challenge method is always S256', t => {
	const parameters = generatePKCEParameters();

	// RFC 7636: MUST use S256, not plain
	t.is(parameters.codeChallengeMethod, 'S256');
});
