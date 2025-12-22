/**
 * JWT fixture utilities for testing.
 * Generates real signed JWTs for testing JWT verification.
 */
import {exportJWK, generateKeyPair, SignJWT, type JWK} from 'jose';

/**
 * Test RSA key pair for signing JWTs.
 * Generated once and reused across tests for performance.
 */
let testKeyPair: {publicKey: JWK; privateKey: CryptoKey} | undefined;

/**
 * Get or generate the test key pair.
 * The public key can be used in JWKS endpoints for verification.
 */
async function getTestKeyPair(): Promise<{
	publicKey: JWK;
	privateKey: CryptoKey;
}> {
	if (!testKeyPair) {
		const {publicKey, privateKey} = await generateKeyPair('RS256');
		const publicJWK = await exportJWK(publicKey);

		testKeyPair = {
			publicKey: publicJWK,
			privateKey,
		};
	}

	return testKeyPair;
}

/**
 * JWTPayload structure for ID tokens
 */
export type TestJWTPayload = {
	sub: string;
	iss?: string;
	aud?: string | string[];
	exp?: number;
	nbf?: number;
	iat?: number;
	email?: string;
	name?: string;
	org?: string;
	picture?: string;
	email_verified?: boolean;
};

/**
 * Options for creating a signed JWT
 */
export type CreateSignedJWTOptions = {
	issuer?: string;
	audience?: string | string[];
	expiresIn?: number; // Seconds from now
	notBefore?: number; // Seconds from now (negative for past)
	subject?: string;
	email?: string;
	name?: string;
	org?: string;
	picture?: string;
	emailVerified?: boolean;
};

/**
 * Creates a real signed JWT token for testing.
 * The token is signed with RS256 using a test key pair.
 *
 * @param options - JWT payload options
 * @returns A signed JWT string
 */
export async function createSignedJWT(
	options: CreateSignedJWTOptions = {},
): Promise<string> {
	const {privateKey} = await getTestKeyPair();

	const now = Math.floor(Date.now() / 1000);
	const {
		issuer = 'https://test.uxlint.org',
		audience = 'test-client',
		expiresIn = 3600,
		notBefore = -60, // 1 minute ago (allows for clock skew)
		subject = 'user_123',
		email = 'test@example.com',
		name = 'Test User',
		org,
		picture,
		emailVerified = true,
	} = options;

	const jwt = new SignJWT({
		sub: subject,
		email,
		name,
		org,
		picture,
		email_verified: emailVerified,
	})
		.setProtectedHeader({alg: 'RS256', typ: 'JWT', kid: 'test-key-1'})
		.setIssuedAt(now)
		.setIssuer(issuer)
		.setAudience(audience)
		.setExpirationTime(now + expiresIn)
		.setNotBefore(now + notBefore);

	return jwt.sign(privateKey);
}

/**
 * Gets the public key in JWK format for JWKS endpoints.
 * This can be used to mock JWKS responses.
 *
 * @returns Public key as JWK
 */
export async function getTestPublicKey(): Promise<JWK> {
	const {publicKey} = await getTestKeyPair();
	return publicKey;
}

/**
 * Gets the JWKS response format for mocking JWKS endpoints.
 * This includes the public key needed to verify tokens created with createSignedJWT.
 *
 * @param kid - Optional key ID (default: 'test-key-1')
 * @returns JWKS response object
 */
export async function getTestJWKS(kid = 'test-key-1'): Promise<{
	keys: Array<JWK & {kid: string}>;
}> {
	const publicKey = await getTestPublicKey();

	return {
		keys: [
			{
				...publicKey,
				kid,
				use: 'sig',
				alg: 'RS256',
			},
		],
	};
}

/**
 * Resets the test key pair (useful for test cleanup).
 * This will force regeneration of the key pair on next use.
 */
export function resetTestKeyPair(): void {
	testKeyPair = undefined;
}
