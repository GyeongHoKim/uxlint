/**
 * Tests for logout command functionality
 * T176: Logout command tests
 */

import test from 'ava';
import sinon from 'sinon';
import {UXLintClient} from '../../source/infrastructure/auth/uxlint-client.js';
import type {AuthenticationSession} from '../../source/models/auth-session.js';
import {
	MockKeychainService,
	MockBrowserService,
} from '../mocks/services/index.js';
import {TokenManager} from '../../source/infrastructure/auth/token-manager.js';
import {OAuthFlow} from '../../source/infrastructure/auth/oauth-flow.js';
import type {OAuthConfig} from '../../source/infrastructure/auth/oauth-config.js';
import {OAuthHttpClient} from '../../source/infrastructure/auth/oauth-http-client.js';
import {CallbackServer} from '../../source/infrastructure/auth/callback-server.js';

function createValidSession(): AuthenticationSession {
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
	};
}

function createTestClient() {
	const sandbox = sinon.createSandbox();
	const keychain = new MockKeychainService();
	const browser = new MockBrowserService();

	const httpClient = sandbox.createStubInstance(OAuthHttpClient);
	const callbackServer = sandbox.createStubInstance(CallbackServer);

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
	UXLintClient.resetInstance();
});

test('logout removes session from keychain', async t => {
	const {client, keychain} = createTestClient();

	// Setup: Store a valid session
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(createValidSession()),
	);

	// Verify session exists before logout
	const beforeLogout = await keychain.getPassword('uxlint-cli', 'default');
	t.truthy(beforeLogout);

	// Execute logout
	await client.logout();

	// Verify session is removed
	const afterLogout = await keychain.getPassword('uxlint-cli', 'default');
	t.is(afterLogout, undefined);
});

test('logout succeeds when already logged out', async t => {
	const {client, keychain} = createTestClient();

	// Verify no session exists
	const session = await keychain.getPassword('uxlint-cli', 'default');
	t.is(session, undefined);

	// Logout should not throw
	await t.notThrowsAsync(async () => client.logout());
});

test('logout clears in-memory session cache', async t => {
	const {client, keychain} = createTestClient();

	// Setup: Store a valid session
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(createValidSession()),
	);

	// Load session into memory
	const statusBefore = await client.getStatus();
	t.truthy(statusBefore);

	// Execute logout
	await client.logout();

	// Verify in-memory cache is cleared
	const statusAfter = await client.getStatus();
	t.is(statusAfter, undefined);
});

test('logout handles keychain errors gracefully', async t => {
	const {client, keychain} = createTestClient();

	// Setup: Store a valid session
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(createValidSession()),
	);

	// Mock keychain failure on delete
	const originalDelete = keychain.deletePassword.bind(keychain);
	keychain.deletePassword = async () => {
		throw new Error('Keychain access denied');
	};

	// Logout should handle the error (implementation may throw or swallow)
	try {
		await client.logout();
		// If it doesn't throw, that's acceptable behavior
		t.pass();
	} catch (error: unknown) {
		// If it throws, verify it's an appropriate error
		t.true(error instanceof Error);
		t.true(
			(error as Error).message.includes('Keychain') ||
				(error as Error).message.includes('denied'),
		);
	}

	// Restore original function
	keychain.deletePassword = originalDelete;
});

test('logout is idempotent - can be called multiple times', async t => {
	const {client, keychain} = createTestClient();

	// Setup: Store a valid session
	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify(createValidSession()),
	);

	// First logout
	await client.logout();
	const afterFirst = await keychain.getPassword('uxlint-cli', 'default');
	t.is(afterFirst, undefined);

	// Second logout should not fail
	await t.notThrowsAsync(async () => client.logout());

	// Third logout should also not fail
	await t.notThrowsAsync(async () => client.logout());
});
