import test from 'ava';
import {http, HttpResponse} from 'msw';
import {setupServer} from 'msw/node';
import {
	OAuthHttpClient,
	type TokenExchangeParameters,
	type TokenRefreshParameters,
} from '../../../source/infrastructure/auth/oauth-http-client.js';
import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';

const BASE_URL = 'https://test.uxlint.org';
const TOKEN_ENDPOINT = `${BASE_URL}/auth/v1/oauth/token`;
const OIDC_CONFIG_ENDPOINT = `${BASE_URL}/auth/v1/oauth/.well-known/openid-configuration`;

const mockTokenResponse = {
	access_token: 'mock_access_token_123',
	token_type: 'Bearer',
	expires_in: 3600,
	refresh_token: 'mock_refresh_token_456',
	id_token: 'mock_id_token_789',
	scope: 'openid profile email uxlint:api',
};

const mockOIDCConfig = {
	issuer: BASE_URL,
	authorization_endpoint: `${BASE_URL}/auth/v1/oauth/authorize`,
	token_endpoint: TOKEN_ENDPOINT,
	userinfo_endpoint: `${BASE_URL}/auth/v1/oauth/userinfo`,
	jwks_uri: `${BASE_URL}/auth/v1/oauth/.well-known/jwks.json`,
	response_types_supported: ['code'],
	grant_types_supported: ['authorization_code', 'refresh_token'],
	scopes_supported: ['openid', 'profile', 'email', 'uxlint:api'],
	code_challenge_methods_supported: ['S256'],
};

const server = setupServer();

test.before(() => {
	server.listen({onUnhandledRequest: 'error'});
});

test.after(() => {
	server.close();
});

test.afterEach(() => {
	server.resetHandlers();
});

test('exchangeCodeForTokens returns valid token set', async t => {
	server.use(
		http.post(TOKEN_ENDPOINT, async ({request}) => {
			const body = await request.text();
			const urlParameters = new URLSearchParams(body);

			t.is(urlParameters.get('grant_type'), 'authorization_code');
			t.is(urlParameters.get('client_id'), 'test-client');
			t.is(urlParameters.get('code'), 'auth_code_123');
			t.is(urlParameters.get('redirect_uri'), 'http://localhost:8080/callback');
			t.is(urlParameters.get('code_verifier'), 'test_verifier');

			return HttpResponse.json(mockTokenResponse);
		}),
	);

	const client = new OAuthHttpClient();
	const parameters: TokenExchangeParameters = {
		tokenEndpoint: TOKEN_ENDPOINT,
		clientId: 'test-client',
		code: 'auth_code_123',
		redirectUri: 'http://localhost:8080/callback',
		codeVerifier: 'test_verifier',
	};

	const tokens = await client.exchangeCodeForTokens(parameters);

	t.is(tokens.accessToken, 'mock_access_token_123');
	t.is(tokens.tokenType, 'Bearer');
	t.is(tokens.expiresIn, 3600);
	t.is(tokens.refreshToken, 'mock_refresh_token_456');
	t.is(tokens.idToken, 'mock_id_token_789');
	t.is(tokens.scope, 'openid profile email uxlint:api');
});

test('refreshAccessToken returns valid token set', async t => {
	server.use(
		http.post(TOKEN_ENDPOINT, async ({request}) => {
			const body = await request.text();
			const urlParameters = new URLSearchParams(body);

			t.is(urlParameters.get('grant_type'), 'refresh_token');
			t.is(urlParameters.get('client_id'), 'test-client');
			t.is(urlParameters.get('refresh_token'), 'existing_refresh_token');

			return HttpResponse.json({
				...mockTokenResponse,
				access_token: 'new_access_token',
				refresh_token: 'new_refresh_token',
			});
		}),
	);

	const client = new OAuthHttpClient();
	const parameters: TokenRefreshParameters = {
		tokenEndpoint: TOKEN_ENDPOINT,
		clientId: 'test-client',
		refreshToken: 'existing_refresh_token',
	};

	const tokens = await client.refreshAccessToken(parameters);

	t.is(tokens.accessToken, 'new_access_token');
	t.is(tokens.refreshToken, 'new_refresh_token');
});

test('refreshAccessToken with scope parameter', async t => {
	server.use(
		http.post(TOKEN_ENDPOINT, async ({request}) => {
			const body = await request.text();
			const urlParameters = new URLSearchParams(body);

			t.is(urlParameters.get('scope'), 'openid profile');

			return HttpResponse.json(mockTokenResponse);
		}),
	);

	const client = new OAuthHttpClient();
	const parameters: TokenRefreshParameters = {
		tokenEndpoint: TOKEN_ENDPOINT,
		clientId: 'test-client',
		refreshToken: 'existing_refresh_token',
		scope: 'openid profile',
	};

	await client.refreshAccessToken(parameters);
	t.pass();
});

test('getOpenIDConfiguration returns valid config', async t => {
	server.use(
		http.get(OIDC_CONFIG_ENDPOINT, () => {
			return HttpResponse.json(mockOIDCConfig);
		}),
	);

	const client = new OAuthHttpClient();
	const config = await client.getOpenIDConfiguration(BASE_URL);

	t.is(config.issuer, BASE_URL);
	t.is(config.authorizationEndpoint, `${BASE_URL}/auth/v1/oauth/authorize`);
	t.is(config.tokenEndpoint, TOKEN_ENDPOINT);
	t.deepEqual(config.codeChallengeMethodsSupported, ['S256']);
});

test('exchangeCodeForTokens throws on network error', async t => {
	server.use(
		http.post(TOKEN_ENDPOINT, () => {
			return HttpResponse.error();
		}),
	);

	const client = new OAuthHttpClient();
	const parameters: TokenExchangeParameters = {
		tokenEndpoint: TOKEN_ENDPOINT,
		clientId: 'test-client',
		code: 'auth_code_123',
		redirectUri: 'http://localhost:8080/callback',
		codeVerifier: 'test_verifier',
	};

	const error = await t.throwsAsync<AuthenticationError>(
		async () => client.exchangeCodeForTokens(parameters),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.NETWORK_ERROR);
});

test('exchangeCodeForTokens throws on OAuth error response', async t => {
	server.use(
		http.post(TOKEN_ENDPOINT, () => {
			return HttpResponse.json(
				{
					error: 'invalid_grant',
					error_description: 'Authorization code is invalid',
				},
				{status: 400},
			);
		}),
	);

	const client = new OAuthHttpClient();
	const parameters: TokenExchangeParameters = {
		tokenEndpoint: TOKEN_ENDPOINT,
		clientId: 'test-client',
		code: 'invalid_code',
		redirectUri: 'http://localhost:8080/callback',
		codeVerifier: 'test_verifier',
	};

	const error = await t.throwsAsync<AuthenticationError>(
		async () => client.exchangeCodeForTokens(parameters),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.INVALID_RESPONSE);
	t.true(error?.message.includes('invalid_grant'));
});

test('refreshAccessToken throws REFRESH_FAILED on error', async t => {
	server.use(
		http.post(TOKEN_ENDPOINT, () => {
			return HttpResponse.json(
				{
					error: 'invalid_grant',
					error_description: 'Refresh token expired',
				},
				{status: 400},
			);
		}),
	);

	const client = new OAuthHttpClient();
	const parameters: TokenRefreshParameters = {
		tokenEndpoint: TOKEN_ENDPOINT,
		clientId: 'test-client',
		refreshToken: 'expired_token',
	};

	const error = await t.throwsAsync<AuthenticationError>(
		async () => client.refreshAccessToken(parameters),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.REFRESH_FAILED);
});

test('getOpenIDConfiguration throws on HTTP error', async t => {
	server.use(
		http.get(OIDC_CONFIG_ENDPOINT, () => {
			return HttpResponse.json({error: 'Server error'}, {status: 500});
		}),
	);

	const client = new OAuthHttpClient();

	const error = await t.throwsAsync<AuthenticationError>(
		async () => client.getOpenIDConfiguration(BASE_URL),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.NETWORK_ERROR);
});
