import test from 'ava';
import {
	OAuthHttpClient,
	type TokenExchangeParameters,
	type TokenRefreshParameters,
} from '../../../source/infrastructure/auth/oauth-http-client.js';
import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';
import {
	OAUTH_BASE_URL,
	createValidatingTokenHandler,
	mockOIDCConfig,
	mockTokenResponse,
	oauthEndpoints,
	oauthErrorHandlers,
} from '../../mocks/handlers/index.js';
import {server} from '../../mocks/server.js';

// Reset handlers after each test to ensure test isolation
test.afterEach(() => {
	server.resetHandlers();
});

test('exchangeCodeForTokens returns valid token set', async t => {
	// Use validating handler to check request parameters
	server.use(
		createValidatingTokenHandler(parameters => {
			t.is(parameters.get('grant_type'), 'authorization_code');
			t.is(parameters.get('client_id'), 'test-client');
			t.is(parameters.get('code'), 'auth_code_123');
			t.is(parameters.get('redirect_uri'), 'http://localhost:8080/callback');
			t.is(parameters.get('code_verifier'), 'test_verifier');
		}),
	);

	const client = new OAuthHttpClient();
	const parameters: TokenExchangeParameters = {
		tokenEndpoint: oauthEndpoints.token,
		clientId: 'test-client',
		code: 'auth_code_123',
		redirectUri: 'http://localhost:8080/callback',
		codeVerifier: 'test_verifier',
	};

	const tokens = await client.exchangeCodeForTokens(parameters);

	t.is(tokens.accessToken, mockTokenResponse.access_token);
	t.is(tokens.tokenType, 'Bearer');
	t.is(tokens.expiresIn, mockTokenResponse.expires_in);
	t.is(tokens.refreshToken, mockTokenResponse.refresh_token);
	t.is(tokens.idToken, mockTokenResponse.id_token);
	t.is(tokens.scope, mockTokenResponse.scope);
});

test('refreshAccessToken returns valid token set', async t => {
	server.use(
		createValidatingTokenHandler(
			parameters => {
				t.is(parameters.get('grant_type'), 'refresh_token');
				t.is(parameters.get('client_id'), 'test-client');
				t.is(parameters.get('refresh_token'), 'existing_refresh_token');
			},
			{
				access_token: 'new_access_token',
				refresh_token: 'new_refresh_token',
			},
		),
	);

	const client = new OAuthHttpClient();
	const parameters: TokenRefreshParameters = {
		tokenEndpoint: oauthEndpoints.token,
		clientId: 'test-client',
		refreshToken: 'existing_refresh_token',
	};

	const tokens = await client.refreshAccessToken(parameters);

	t.is(tokens.accessToken, 'new_access_token');
	t.is(tokens.refreshToken, 'new_refresh_token');
});

test('refreshAccessToken with scope parameter', async t => {
	server.use(
		createValidatingTokenHandler(parameters => {
			t.is(parameters.get('scope'), 'openid profile');
		}),
	);

	const client = new OAuthHttpClient();
	const parameters: TokenRefreshParameters = {
		tokenEndpoint: oauthEndpoints.token,
		clientId: 'test-client',
		refreshToken: 'existing_refresh_token',
		scope: 'openid profile',
	};

	await client.refreshAccessToken(parameters);
	t.pass();
});

test('getOpenIDConfiguration returns valid config', async t => {
	// Default handler already returns mockOIDCConfig
	const client = new OAuthHttpClient();
	const config = await client.getOpenIDConfiguration(OAUTH_BASE_URL);

	t.is(config.issuer, mockOIDCConfig.issuer);
	t.is(config.authorizationEndpoint, mockOIDCConfig.authorization_endpoint);
	t.is(config.tokenEndpoint, mockOIDCConfig.token_endpoint);
	t.deepEqual(
		config.codeChallengeMethodsSupported,
		mockOIDCConfig.code_challenge_methods_supported,
	);
});

test('exchangeCodeForTokens throws on network error', async t => {
	server.use(oauthErrorHandlers.tokenNetworkError());

	const client = new OAuthHttpClient();
	const parameters: TokenExchangeParameters = {
		tokenEndpoint: oauthEndpoints.token,
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
		oauthErrorHandlers.tokenInvalidGrant('Authorization code is invalid'),
	);

	const client = new OAuthHttpClient();
	const parameters: TokenExchangeParameters = {
		tokenEndpoint: oauthEndpoints.token,
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
	server.use(oauthErrorHandlers.refreshTokenExpired());

	const client = new OAuthHttpClient();
	const parameters: TokenRefreshParameters = {
		tokenEndpoint: oauthEndpoints.token,
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
	server.use(oauthErrorHandlers.oidcConfigServerError());

	const client = new OAuthHttpClient();

	const error = await t.throwsAsync<AuthenticationError>(
		async () => client.getOpenIDConfiguration(OAUTH_BASE_URL),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.NETWORK_ERROR);
});
