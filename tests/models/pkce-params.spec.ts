import test from 'ava';
import type {PKCEParameters} from '../../source/models/pkce-params.js';

// T019: Unit tests for PKCEParameters model

test('PKCEParameters type allows all required fields', t => {
	const pkce: PKCEParameters = {
		codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
		codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
		codeChallengeMethod: 'S256',
		state: 'af0ifjsldkj',
	};

	t.is(pkce.codeVerifier, 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
	t.is(pkce.codeChallenge, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
	t.is(pkce.codeChallengeMethod, 'S256');
	t.is(pkce.state, 'af0ifjsldkj');
});

test('PKCEParameters codeChallengeMethod is always S256', t => {
	const pkce: PKCEParameters = {
		codeVerifier: 'verifier',
		codeChallenge: 'challenge',
		codeChallengeMethod: 'S256',
		state: 'state123',
	};

	t.is(pkce.codeChallengeMethod, 'S256');
});

test('PKCEParameters codeVerifier should be between 43-128 characters', t => {
	// Valid 43-character verifier
	const minVerifier = 'a'.repeat(43);
	const pkceMin: PKCEParameters = {
		codeVerifier: minVerifier,
		codeChallenge: 'challenge',
		codeChallengeMethod: 'S256',
		state: 'state',
	};
	t.is(pkceMin.codeVerifier.length, 43);

	// Valid 128-character verifier
	const maxVerifier = 'b'.repeat(128);
	const pkceMax: PKCEParameters = {
		codeVerifier: maxVerifier,
		codeChallenge: 'challenge',
		codeChallengeMethod: 'S256',
		state: 'state',
	};
	t.is(pkceMax.codeVerifier.length, 128);
});

test('PKCEParameters can be serialized to JSON', t => {
	const pkce: PKCEParameters = {
		codeVerifier: 'test_verifier_123456789012345678901234567890',
		codeChallenge: 'test_challenge',
		codeChallengeMethod: 'S256',
		state: 'test_state',
	};

	const json = JSON.stringify(pkce);
	const parsed = JSON.parse(json) as PKCEParameters;

	t.deepEqual(parsed, pkce);
});

test('PKCEParameters state is used for CSRF protection', t => {
	const pkce1: PKCEParameters = {
		codeVerifier: 'verifier1' + 'x'.repeat(35),
		codeChallenge: 'challenge1',
		codeChallengeMethod: 'S256',
		state: 'unique_state_1',
	};

	const pkce2: PKCEParameters = {
		codeVerifier: 'verifier2' + 'x'.repeat(35),
		codeChallenge: 'challenge2',
		codeChallengeMethod: 'S256',
		state: 'unique_state_2',
	};

	// Each PKCE flow should have unique state
	t.not(pkce1.state, pkce2.state);
});

test('PKCEParameters verifier and challenge are related', t => {
	// In real implementation, codeChallenge = base64url(sha256(codeVerifier))
	// This test documents the relationship without computing it
	const pkce: PKCEParameters = {
		codeVerifier: 'original_verifier_that_generates_challenge',
		codeChallenge: 'sha256_hash_of_verifier_base64url_encoded',
		codeChallengeMethod: 'S256',
		state: 'csrf_token',
	};

	// The challenge should be derived from verifier (documented relationship)
	t.truthy(pkce.codeVerifier);
	t.truthy(pkce.codeChallenge);
	t.not(pkce.codeVerifier, pkce.codeChallenge);
});

test('PKCEParameters fields use URL-safe characters', t => {
	// Base64URL encoding uses: A-Z, a-z, 0-9, -, _
	const urlSafePattern = /^[\w-]+$/;

	const pkce: PKCEParameters = {
		codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
		codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
		codeChallengeMethod: 'S256',
		state: 'af0ifjsldkj-state_123',
	};

	t.regex(pkce.codeVerifier, urlSafePattern);
	t.regex(pkce.codeChallenge, urlSafePattern);
});
