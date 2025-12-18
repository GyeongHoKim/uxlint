import {Buffer} from 'node:buffer';
import {createHash, randomBytes} from 'node:crypto';
import type {PKCEParameters} from '../../models/pkce-params.js';

function base64URLEncode(bytes: Uint8Array): string {
	return Buffer.from(bytes)
		.toString('base64')
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

export function generatePKCEParameters(): PKCEParameters {
	// 32 random bytes => 43 char base64url (no padding), which satisfies 43-128 requirement.
	const codeVerifier = base64URLEncode(randomBytes(32));
	const codeChallenge = base64URLEncode(
		createHash('sha256').update(codeVerifier).digest(),
	);
	const state = base64URLEncode(randomBytes(16));

	return {
		codeVerifier,
		codeChallenge,
		codeChallengeMethod: 'S256',
		state,
	};
}
