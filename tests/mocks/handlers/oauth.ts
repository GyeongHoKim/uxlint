/**
 * OAuth-related MSW handlers for testing.
 * These handlers provide default mock responses for OAuth endpoints.
 */
import {http, HttpResponse} from 'msw';

// Default base URL for OAuth tests
export const OAUTH_BASE_URL = 'https://test.uxlint.org';

// OAuth endpoint URLs
export const oauthEndpoints = {
	token: `${OAUTH_BASE_URL}/auth/v1/oauth/token`,
	authorize: `${OAUTH_BASE_URL}/auth/v1/oauth/authorize`,
	userinfo: `${OAUTH_BASE_URL}/auth/v1/oauth/userinfo`,
	openidConfig: `${OAUTH_BASE_URL}/auth/v1/.well-known/openid-configuration`,
	jwks: `${OAUTH_BASE_URL}/auth/v1/oauth/.well-known/jwks.json`,
};

// Mock token response
export const mockTokenResponse = {
	access_token: 'mock_access_token_123',
	token_type: 'Bearer',
	expires_in: 3600,
	refresh_token: 'mock_refresh_token_456',
	id_token: 'mock_id_token_789',
	scope: 'openid profile email uxlint:api',
};

// Mock OIDC configuration
export const mockOIDCConfig = {
	issuer: OAUTH_BASE_URL,
	authorization_endpoint: oauthEndpoints.authorize,
	token_endpoint: oauthEndpoints.token,
	userinfo_endpoint: oauthEndpoints.userinfo,
	jwks_uri: oauthEndpoints.jwks,
	response_types_supported: ['code'],
	grant_types_supported: ['authorization_code', 'refresh_token'],
	scopes_supported: ['openid', 'profile', 'email', 'uxlint:api'],
	code_challenge_methods_supported: ['S256'],
};

// Mock user info response
export const mockUserInfo = {
	sub: 'user_123',
	email: 'test@example.com',
	email_verified: true,
	name: 'Test User',
	picture: 'https://example.com/avatar.jpg',
};

/**
 * Default OAuth handlers that return successful responses.
 * Use server.use() in individual tests to override with specific behaviors.
 */
export const oauthHandlers = [
	// Token endpoint - handles both authorization_code and refresh_token grants
	http.post(oauthEndpoints.token, async ({request}) => {
		const body = await request.text();
		const parameters = new URLSearchParams(body);
		const grantType = parameters.get('grant_type');

		if (grantType === 'authorization_code') {
			return HttpResponse.json(mockTokenResponse);
		}

		if (grantType === 'refresh_token') {
			return HttpResponse.json({
				...mockTokenResponse,
				access_token: 'refreshed_access_token',
				refresh_token: 'refreshed_refresh_token',
			});
		}

		return HttpResponse.json(
			{
				error: 'unsupported_grant_type',
				error_description: 'Grant type not supported',
			},
			{status: 400},
		);
	}),

	// OpenID Configuration endpoint
	http.get(oauthEndpoints.openidConfig, () => {
		return HttpResponse.json(mockOIDCConfig);
	}),

	// User info endpoint
	http.get(oauthEndpoints.userinfo, () => {
		return HttpResponse.json(mockUserInfo);
	}),

	// JWKS endpoint - returns empty keyset for testing
	// Note: Tests use mock ID tokens that don't require real JWT verification
	http.get(oauthEndpoints.jwks, () => {
		return HttpResponse.json({
			keys: [],
		});
	}),
];

/**
 * Helper functions to create error handlers for specific test scenarios.
 */
export const oauthErrorHandlers = {
	/**
	 * Returns a handler that simulates a network error on token endpoint.
	 */
	tokenNetworkError: () =>
		http.post(oauthEndpoints.token, () => {
			return HttpResponse.error();
		}),

	/**
	 * Returns a handler that simulates an invalid grant error.
	 */
	tokenInvalidGrant: (description = 'Authorization code is invalid') =>
		http.post(oauthEndpoints.token, () => {
			return HttpResponse.json(
				{error: 'invalid_grant', error_description: description},
				{status: 400},
			);
		}),

	/**
	 * Returns a handler that simulates a server error on OIDC config endpoint.
	 */
	oidcConfigServerError: () =>
		http.get(oauthEndpoints.openidConfig, () => {
			return HttpResponse.json({error: 'Server error'}, {status: 500});
		}),

	/**
	 * Returns a handler that simulates an expired refresh token.
	 */
	refreshTokenExpired: () =>
		http.post(oauthEndpoints.token, () => {
			return HttpResponse.json(
				{error: 'invalid_grant', error_description: 'Refresh token expired'},
				{status: 400},
			);
		}),
};

/**
 * Creates a custom token endpoint handler with specific response data.
 */
export function createTokenHandler(
	customResponse: Partial<typeof mockTokenResponse>,
) {
	return http.post(oauthEndpoints.token, () => {
		return HttpResponse.json({...mockTokenResponse, ...customResponse});
	});
}

/**
 * Creates a token handler that validates request parameters.
 * Useful for tests that need to verify the correct parameters are sent.
 */
export function createValidatingTokenHandler(
	validator: (parameters: URLSearchParams) => void,
	response: Partial<typeof mockTokenResponse> = {},
) {
	return http.post(oauthEndpoints.token, async ({request}) => {
		const body = await request.text();
		const parameters = new URLSearchParams(body);
		validator(parameters);
		return HttpResponse.json({...mockTokenResponse, ...response});
	});
}
