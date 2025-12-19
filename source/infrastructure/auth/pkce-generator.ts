import {Buffer} from 'node:buffer';
import {createHash, randomBytes} from 'node:crypto';
import type {PKCEParameters} from '../../models/pkce-params.js';

/**
 * Base64URL-encode a buffer (RFC 4648 Section 5)
 * Converts standard Base64 to URL-safe Base64 by replacing characters:
 * - '+' → '-'
 * - '/' → '_'
 * - Remove trailing '='
 */
function base64URLEncode(buffer: Uint8Array): string {
	return Buffer.from(buffer)
		.toString('base64')
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

/**
 * Generate PKCE (Proof Key for Code Exchange) parameters for OAuth 2.0 authorization
 * Implements RFC 7636 with S256 code challenge method
 *
 * @returns PKCE parameters with code verifier, challenge, and state
 */
export function generatePKCEParameters(): PKCEParameters {
	// Generate cryptographically random code verifier (32 bytes = 43 chars in Base64URL)
	const codeVerifier = base64URLEncode(randomBytes(32));

	// Hash code verifier with SHA-256 and Base64URL-encode
	const hash = createHash('sha256').update(codeVerifier).digest();
	const codeChallenge = base64URLEncode(hash);

	// Generate cryptographically random state for CSRF protection
	const state = base64URLEncode(randomBytes(32));

	return {
		codeVerifier,
		codeChallenge,
		codeChallengeMethod: 'S256',
		state,
	};
}
