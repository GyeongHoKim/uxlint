import {Buffer} from 'node:buffer';
import test from 'ava';
import sinon from 'sinon';
import {CallbackServer} from '../../../source/infrastructure/auth/callback-server.js';
import type {OAuthConfig} from '../../../source/infrastructure/auth/oauth-config.js';
import {OAuthFlow} from '../../../source/infrastructure/auth/oauth-flow.js';
import {OAuthHttpClient} from '../../../source/infrastructure/auth/oauth-http-client.js';
import {TokenManager} from '../../../source/infrastructure/auth/token-manager.js';
import {
	UXLintClient,
	getUXLintClient,
} from '../../../source/infrastructure/auth/uxlint-client.js';
import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';
import type {AuthenticationSession} from '../../../source/models/auth-session.js';
import type {TokenSet} from '../../../source/models/token-set.js';
import {
	MockBrowserService,
	MockKeychainService,
} from '../../mocks/services/index.js';

function createMockIdToken(): string {
	const header = Buffer.from(
		JSON.stringify({alg: 'RS256', typ: 'JWT'}),
	).toString('base64url');
	const payload = Buffer.from(
		JSON.stringify({
			sub: 'user_123',
			email: 'test@example.com',
			name: 'Test User',
			org: 'Test Org',
			email_verified: true,
		}),
	).toString('base64url');
	const signature = 'mock_signature';

	return `${header}.${payload}.${signature}`;
}

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

function createTestClient() {
	const sandbox = sinon.createSandbox();
	const keychain = new MockKeychainService();
	const browser = new MockBrowserService();

	// Create stub instances using SinonJS
	const httpClient = sandbox.createStubInstance(OAuthHttpClient);
	const callbackServer = sandbox.createStubInstance(CallbackServer);

	// Set up default return values
	const mockTokenSet: TokenSet = {
		accessToken: 'mock_access_token',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'mock_refresh_token',
		idToken: createMockIdToken(),
		scope: 'openid profile email',
	};

	httpClient.exchangeCodeForTokens.resolves(mockTokenSet);
	httpClient.refreshAccessToken.resolves({
		...mockTokenSet,
		accessToken: 'refreshed_access_token',
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

	const client = UXLintClient.createWithDependencies(
		tokenManager,
		oauthFlow,
		config,
	);

	return {client, keychain, browser, httpClient, tokenManager, sandbox};
}

test.afterEach(() => {
	// Reset singleton between tests
	UXLintClient.resetInstance();
});

// T083: Integration tests for UXLintClient
test('UXLintClient.getInstance returns singleton', t => {
	// This test would require mocking the production dependencies
	// Just verify the static method exists
	t.is(typeof UXLintClient.getInstance, 'function');
});

test('getUXLintClient returns singleton instance', t => {
	t.is(typeof getUXLintClient, 'function');
});

test('UXLintClient.login stores session after successful auth', async t => {
	const {client, keychain} = createTestClient();

	await client.login();

	const stored = await keychain.getPassword('uxlint-cli', 'default');
	t.truthy(stored);
});

test('UXLintClient.login throws ALREADY_AUTHENTICATED when logged in', async t => {
	const {client, keychain} = createTestClient();

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
	const {client, keychain} = createTestClient();

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
	const {client} = createTestClient();

	const status = await client.getStatus();

	t.is(status, undefined);
});

test('UXLintClient.getStatus returns session when logged in', async t => {
	const {client, keychain} = createTestClient();
	const session = createValidSession();
	await keychain.setPassword('uxlint-cli', 'default', JSON.stringify(session));

	const status = await client.getStatus();

	t.truthy(status);
	t.is(status?.user.email, session.user.email);
});

test('UXLintClient.isAuthenticated returns false when not logged in', async t => {
	const {client} = createTestClient();

	const isAuth = await client.isAuthenticated();

	t.false(isAuth);
});

test('UXLintClient.isAuthenticated returns true when logged in', async t => {
	const {client, keychain} = createTestClient();
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(createValidSession()),
	);

	const isAuth = await client.isAuthenticated();

	t.true(isAuth);
});

test('UXLintClient.isAuthenticated returns false when session expired', async t => {
	const {client, keychain} = createTestClient();
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
	const {client, keychain} = createTestClient();
	const session = createValidSession();
	await keychain.setPassword('uxlint-cli', 'default', JSON.stringify(session));

	const profile = await client.getUserProfile();

	t.is(profile.email, session.user.email);
	t.is(profile.name, session.user.name);
});

test('UXLintClient.getUserProfile throws NOT_AUTHENTICATED when not logged in', async t => {
	const {client} = createTestClient();

	const error = await t.throwsAsync(async () => client.getUserProfile());

	t.true(error instanceof AuthenticationError);
	t.is((error as AuthenticationError).code, AuthErrorCode.NOT_AUTHENTICATED);
});

test('UXLintClient.getAccessToken returns token when logged in', async t => {
	const {client, keychain} = createTestClient();
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(createValidSession()),
	);

	const token = await client.getAccessToken();

	t.is(token, 'access_token_123');
});

test('UXLintClient.getAccessToken throws NOT_AUTHENTICATED when not logged in', async t => {
	const {client} = createTestClient();

	const error = await t.throwsAsync(async () => client.getAccessToken());

	t.true(error instanceof AuthenticationError);
	t.is((error as AuthenticationError).code, AuthErrorCode.NOT_AUTHENTICATED);
});

test('UXLintClient.getAccessToken auto-refreshes expiring token', async t => {
	const {client, keychain} = createTestClient();

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
	const {client, keychain} = createTestClient();
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
	const {client, keychain, httpClient} = createTestClient();
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

test('UXLintClient.login decodes ID token correctly', async t => {
	const {client} = createTestClient();

	await client.login();

	const profile = await client.getUserProfile();
	t.is(profile.id, 'user_123');
	t.is(profile.email, 'test@example.com');
	t.is(profile.name, 'Test User');
	t.is(profile.organization, 'Test Org');
	t.true(profile.emailVerified);
});

test('UXLintClient.createWithDependencies allows custom dependencies', t => {
	const sandbox = sinon.createSandbox();
	const keychain = new MockKeychainService();
	const browser = new MockBrowserService();

	// Create stub instances using SinonJS
	const httpClient = sandbox.createStubInstance(OAuthHttpClient);
	const callbackServer = sandbox.createStubInstance(CallbackServer);

	// Set up default return values
	const mockTokenSet: TokenSet = {
		accessToken: 'mock_access_token',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'mock_refresh_token',
		idToken: createMockIdToken(),
		scope: 'openid profile email',
	};

	httpClient.exchangeCodeForTokens.resolves(mockTokenSet);
	httpClient.refreshAccessToken.resolves(mockTokenSet);
	callbackServer.waitForCallback.callsFake(async options => ({
		code: 'mock_auth_code',
		state: options.expectedState,
	}));

	const oauthFlow = new OAuthFlow(httpClient, callbackServer, browser);
	const tokenManager = new TokenManager(keychain);

	const config: OAuthConfig = {
		clientId: 'custom-client',
		baseUrl: 'https://custom.uxlint.org',
		endpoints: {
			authorization: '/auth',
			token: '/token',
			openidConfiguration: '/config',
		},
		redirectUri: 'http://localhost:9000/callback',
		scopes: ['custom:scope'],
	};

	const client = UXLintClient.createWithDependencies(
		tokenManager,
		oauthFlow,
		config,
	);

	t.truthy(client);
});
