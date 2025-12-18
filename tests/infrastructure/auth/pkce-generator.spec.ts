import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import test from 'ava';
import {generatePKCEParameters} from '../../../source/infrastructure/auth/pkce-generator.js';

type PKCE = ReturnType<typeof generatePKCEParameters>;

function base64UrlEncode(bytes: Uint8Array): string {
	return Buffer.from(bytes)
		.toString('base64')
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

function computeChallenge(codeVerifier: string): string {
	const hash = createHash('sha256').update(codeVerifier).digest();
	return base64UrlEncode(hash);
}

test('generatePKCEParameters() returns S256 params with correct sizes', t => {
	const pkce: PKCE = generatePKCEParameters();

	t.is(pkce.codeChallengeMethod, 'S256');
	t.true(pkce.codeVerifier.length >= 43);
	t.true(pkce.codeVerifier.length <= 128);
	t.truthy(pkce.state);
});

test('generatePKCEParameters() challenge matches sha256(verifier)', t => {
	const pkce = generatePKCEParameters();
	t.is(pkce.codeChallenge, computeChallenge(pkce.codeVerifier));
});

test('generatePKCEParameters() produces different values across calls', t => {
	const a = generatePKCEParameters();
	const b = generatePKCEParameters();

	t.not(a.codeVerifier, b.codeVerifier);
	t.not(a.state, b.state);
});
