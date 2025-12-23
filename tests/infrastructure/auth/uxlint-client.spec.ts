import test from 'ava';
import {HttpResponse, http} from 'msw';
import sinon from 'sinon';
import {CallbackServer} from '../../../source/infrastructure/auth/callback-server.js';
import type {OAuthConfig} from '../../../source/infrastructure/auth/oauth-config.js';
import {OAuthFlow} from '../../../source/infrastructure/auth/oauth-flow.js';
import {OAuthHttpClient} from '../../../source/infrastructure/auth/oauth-http-client.js';
import {TokenManager} from '../../../source/infrastructure/auth/token-manager.js';
import {UXLintClient} from '../../../source/infrastructure/auth/uxlint-client.js';
import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';
import type {AuthenticationSession} from '../../../source/models/auth-session.js';
import type {TokenSet} from '../../../source/models/token-set.js';
import {server} from '../../mocks/server.js';
import {
	MockBrowserService,
	MockKeychainService,
} from '../../mocks/services/index.js';
import {createSignedJWT, getTestJWKS} from '../../utils/jwt-fixture.js';

// Use the global MSW server from tests/setup.ts

// Set up JWKS handler once before all tests to ensure it's available
// This prevents createRemoteJWKSet from caching failed results from other test files
test.before(async () => {
	const jwks = await getTestJWKS();

	server.use(
		http.get('https://app.uxlint.org/.well-known/jwks.json', () => {
			// Return JWKS with proper content type
			return HttpResponse.json(jwks, {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					Pragma: 'no-cache',
					Expires: '0',
				},
			});
		}),
		// Also handle with wildcard pattern to catch any variations
		http.get('https://app.uxlint.org/.well-known/*', ({request}) => {
			const url = new URL(request.url);

			if (url.pathname === '/.well-known/jwks.json') {
				return HttpResponse.json(jwks, {
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-cache, no-store, must-revalidate',
						Pragma: 'no-cache',
						Expires: '0',
					},
				});
			}

			return new HttpResponse(null, {status: 404});
		}),
	);
});

test.beforeEach(async () => {
	server.resetHandlers();
	// Re-set up JWKS handler after reset to ensure it's always available
	const jwks = await getTestJWKS();

	server.use(
		http.get('https://app.uxlint.org/.well-known/jwks.json', () => {
			// Return JWKS with proper content type
			return HttpResponse.json(jwks, {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					Pragma: 'no-cache',
					Expires: '0',
				},
			});
		}),
		// Also handle with wildcard pattern to catch any variations
		http.get('https://app.uxlint.org/.well-known/*', ({request}) => {
			const url = new URL(request.url);

			if (url.pathname === '/.well-known/jwks.json') {
				return HttpResponse.json(jwks, {
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-cache, no-store, must-revalidate',
						Pragma: 'no-cache',
						Expires: '0',
					},
				});
			}

			return new HttpResponse(null, {status: 404});
		}),
	);
});

function createValidSession(
	overrides: Partial<AuthenticationSession> = {},
): AuthenticationSession {
	return {
		version: 1,
		user: {
			id: 'user_123',
			email: 'test@example.com',
			name: 'Test User',
			emailVerified: true,
		},
		tokens: {
			accessToken: 'access_token_123',
			tokenType: 'Bearer',
			expiresIn: 3600,
			refreshToken: 'refresh_token_123',
			scope: 'openid profile email',
		},
		metadata: {
			createdAt: new Date().toISOString(),
			lastRefreshedAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
			scopes: ['openid', 'profile', 'email'],
		},
		...overrides,
	};
}

async function createTestClient() {
	const sandbox = sinon.createSandbox();
	const keychain = new MockKeychainService();
	const browser = new MockBrowserService();

	// Create stub instances using SinonJS
	const httpClient = sandbox.createStubInstance(OAuthHttpClient);
	const callbackServer = sandbox.createStubInstance(CallbackServer);

	// Create a real signed JWT for testing
	const signedIdToken = await createSignedJWT({
		issuer: 'https://app.uxlint.org',
		audience: 'test-client',
		subject: 'user_123',
		email: 'test@example.com',
		name: 'Test User',
		org: 'Test Org',
		emailVerified: true,
	});

	// JWKS endpoint is already mocked in test.before
	const jwksUri = 'https://app.uxlint.org/.well-known/jwks.json';

	// Set up default return values
	const mockTokenSet: TokenSet = {
		accessToken: 'mock_access_token',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'mock_refresh_token',
		idToken: signedIdToken,
		scope: 'openid profile email',
	};

	httpClient.exchangeCodeForTokens.resolves(mockTokenSet);
	httpClient.refreshAccessToken.resolves({
		...mockTokenSet,
		accessToken: 'refreshed_access_token',
	});
	httpClient.getOpenIDConfiguration.resolves({
		issuer: 'https://app.uxlint.org',
		authorizationEndpoint: 'https://app.uxlint.org/auth/v1/oauth/authorize',
		tokenEndpoint: 'https://app.uxlint.org/auth/v1/oauth/token',
		jwksUri,
		responseTypesSupported: ['code'],
		grantTypesSupported: ['authorization_code', 'refresh_token'],
		scopesSupported: ['openid', 'profile', 'email'],
		codeChallengeMethodsSupported: ['S256'],
	});
	callbackServer.waitForCallback.callsFake(async options => ({
		code: 'mock_auth_code',
		state: options.expectedState,
	}));

	const oauthFlow = new OAuthFlow(httpClient, callbackServer, browser);
	const tokenManager = new TokenManager(keychain);

	const config: OAuthConfig = {
		clientId: 'test-client',
		baseUrl: 'https://app.uxlint.org',
		endpoints: {
			authorization: '/auth/v1/oauth/authorize',
			token: '/auth/v1/oauth/token',
			openidConfiguration: '/auth/v1/oauth/.well-known/openid-configuration',
		},
		redirectUri: 'http://localhost:8080/callback',
		scopes: ['openid', 'profile', 'email'],
	};

	const client = new UXLintClient(tokenManager, oauthFlow, httpClient, config);

	return {client, keychain, browser, httpClient, tokenManager, sandbox};
}

test('UXLintClient.login throws ALREADY_AUTHENTICATED when logged in', async t => {
	const {client, keychain} = await createTestClient();

	// Store valid session
	const session = createValidSession();
	await keychain.setPassword('uxlint-cli', 'default', JSON.stringify(session));

	const error = await t.throwsAsync(async () => client.login());

	t.true(error instanceof AuthenticationError);
	t.is(
		(error as AuthenticationError).code,
		AuthErrorCode.ALREADY_AUTHENTICATED,
	);
});

test('UXLintClient.logout clears session', async t => {
	const {client, keychain} = await createTestClient();

	// Store session
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(createValidSession()),
	);

	await client.logout();

	const stored = await keychain.getPassword('uxlint-cli', 'default');
	t.is(stored, undefined);
});

test('UXLintClient.getStatus returns undefined when not logged in', async t => {
	const {client} = await createTestClient();

	const status = await client.getStatus();

	t.is(status, undefined);
});

test('UXLintClient.getStatus returns session when logged in', async t => {
	const {client, keychain} = await createTestClient();
	const session = createValidSession();
	await keychain.setPassword('uxlint-cli', 'default', JSON.stringify(session));

	const status = await client.getStatus();

	t.truthy(status);
	t.is(status?.user.email, session.user.email);
});

test('UXLintClient.isAuthenticated returns false when not logged in', async t => {
	const {client} = await createTestClient();

	const isAuth = await client.isAuthenticated();

	t.false(isAuth);
});

test('UXLintClient.isAuthenticated returns true when logged in', async t => {
	const {client, keychain} = await createTestClient();
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(createValidSession()),
	);

	const isAuth = await client.isAuthenticated();

	t.true(isAuth);
});

test('UXLintClient.isAuthenticated returns false when session expired', async t => {
	const {client, keychain} = await createTestClient();
	const expiredSession = createValidSession({
		metadata: {
			createdAt: new Date().toISOString(),
			lastRefreshedAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() - 60 * 1000).toISOString(), // Expired
			scopes: ['openid'],
		},
	});
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(expiredSession),
	);

	const isAuth = await client.isAuthenticated();

	t.false(isAuth);
});

test('UXLintClient.getUserProfile returns user profile when logged in', async t => {
	const {client, keychain} = await createTestClient();
	const session = createValidSession();
	await keychain.setPassword('uxlint-cli', 'default', JSON.stringify(session));

	const profile = await client.getUserProfile();

	t.is(profile.email, session.user.email);
	t.is(profile.name, session.user.name);
});

test('UXLintClient.getUserProfile throws NOT_AUTHENTICATED when not logged in', async t => {
	const {client} = await createTestClient();

	const error = await t.throwsAsync(async () => client.getUserProfile());

	t.true(error instanceof AuthenticationError);
	t.is((error as AuthenticationError).code, AuthErrorCode.NOT_AUTHENTICATED);
});

test('UXLintClient.getAccessToken returns token when logged in', async t => {
	const {client, keychain} = await createTestClient();
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(createValidSession()),
	);

	const token = await client.getAccessToken();

	t.is(token, 'access_token_123');
});

test('UXLintClient.getAccessToken throws NOT_AUTHENTICATED when not logged in', async t => {
	const {client} = await createTestClient();

	const error = await t.throwsAsync(async () => client.getAccessToken());

	t.true(error instanceof AuthenticationError);
	t.is((error as AuthenticationError).code, AuthErrorCode.NOT_AUTHENTICATED);
});

test('UXLintClient.getAccessToken auto-refreshes expiring token', async t => {
	const {client, keychain} = await createTestClient();

	// Session expiring within 5 minutes
	const expiringSession = createValidSession({
		metadata: {
			createdAt: new Date().toISOString(),
			lastRefreshedAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // 2 minutes
			scopes: ['openid'],
		},
	});
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(expiringSession),
	);

	const token = await client.getAccessToken();

	// Should have refreshed
	t.is(token, 'refreshed_access_token');
});

test('UXLintClient.refreshToken updates stored session', async t => {
	const {client, keychain} = await createTestClient();
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(createValidSession()),
	);

	await client.refreshToken();

	const stored = await keychain.getPassword('uxlint-cli', 'default');
	const session = JSON.parse(stored!) as AuthenticationSession;
	t.is(session.tokens.accessToken, 'refreshed_access_token');
});

test('UXLintClient.refreshToken clears session on failure', async t => {
	const {client, keychain, httpClient} = await createTestClient();
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(createValidSession()),
	);
	httpClient.refreshAccessToken.rejects(
		new AuthenticationError(
			AuthErrorCode.REFRESH_FAILED,
			'Mock refresh failure',
		),
	);

	await t.throwsAsync(async () => client.refreshToken());

	const stored = await keychain.getPassword('uxlint-cli', 'default');
	t.is(stored, undefined);
});

// This test runs before "UXLintClient.login stores session after successful auth"
// to warm up createRemoteJWKSet cache with a successful JWKS fetch
test('UXLintClient.login decodes ID token correctly', async t => {
	// Ensure JWKS handler is explicitly set up for this test
	// This is needed because createRemoteJWKSet caches results internally
	// and may have cached a failed result from other test files
	const jwks = await getTestJWKS();

	server.resetHandlers();
	server.use(
		http.get('https://app.uxlint.org/.well-known/jwks.json', () => {
			return HttpResponse.json(jwks, {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					Pragma: 'no-cache',
					Expires: '0',
				},
			});
		}),
	);

	const {client} = await createTestClient();

	await client.login();

	const profile = await client.getUserProfile();
	t.is(profile.id, 'user_123');
	t.is(profile.email, 'test@example.com');
	t.is(profile.name, 'Test User');
	t.is(profile.organization, 'Test Org');
	t.true(profile.emailVerified);
});

// This test must run after "UXLintClient.login decodes ID token correctly"
// to ensure createRemoteJWKSet cache is warmed up with a successful JWKS fetch first
test('UXLintClient.login stores session after successful auth', async t => {
	const {client, keychain} = await createTestClient();

	await client.login();

	const stored = await keychain.getPassword('uxlint-cli', 'default');
	t.truthy(stored);
});
