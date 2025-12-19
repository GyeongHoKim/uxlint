/**
 * PKCE (Proof Key for Code Exchange) parameters for OAuth 2.0 authorization
 */
export type PKCEParameters = {
	/** Code verifier (random string, 43-128 characters) */
	codeVerifier: string;

	/** Code challenge (SHA-256 hash of verifier, Base64URL-encoded) */
	codeChallenge: string;

	/** Code challenge method (always "S256" for SHA-256) */
	codeChallengeMethod: 'S256';

	/** State parameter for CSRF protection (random string) */
	state: string;
};
