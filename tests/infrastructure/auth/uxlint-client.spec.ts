import {Buffer} from 'node:buffer';
import test from 'ava';
import {TokenManager} from '../../../source/infrastructure/auth/token-manager.js';
import {UXLintClient} from '../../../source/infrastructure/auth/uxlint-client.js';
import {MockKeychainService} from '../../../source/infrastructure/auth/keychain-mock.js';
import type {TokenSet} from '../../../source/models/token-set.js';
import type {OAuthFlow} from '../../../source/infrastructure/auth/oauth-flow.js';

function base64UrlEncode(value: string): string {
	return Buffer.from(value, 'utf8')
		.toString('base64')
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

function createIdToken(claims: Record<string, unknown>): string {
	const header = base64UrlEncode(JSON.stringify({alg: 'none', typ: 'JWT'}));
	const payload = base64UrlEncode(JSON.stringify(claims));
	return `${header}.${payload}.`;
}

function createConfig() {
	return {
		clientId: 'client_123',
		baseUrl: 'https://app.uxlint.org',
		endpoints: {
			authorizePath: '/auth/v1/oauth/authorize',
			tokenPath: '/auth/v1/oauth/token',
			openIdConfigurationPath: '/.well-known/openid-configuration',
		},
		redirectUri: 'http://localhost:8080/callback',
		scopes: ['openid', 'profile', 'email'],
	};
}

test.beforeEach(() => {
	UXLintClient.resetForTests();
});

test.serial('login() stores a session in keychain', async t => {
	const keychain = new MockKeychainService();
	const tokenManager = new TokenManager(keychain);

	const tokens: TokenSet = {
		accessToken: 'access',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'refresh',
		idToken: createIdToken({
			sub: 'user_1',
			email: 'user@example.com',
			name: 'User',
			email_verified: true,
		}),
	};

	const oauthFlow = {
		async authorize() {
			return {
				tokens,
				authorizationUrl: 'https://auth.example.com',
			};
		},
		async refresh() {
			return tokens;
		},
	} as unknown as OAuthFlow;

	const client = UXLintClient.getInstance({
		tokenManager,
		oauthFlow,
		config: createConfig(),
	});

	await client.login();

	const session = await tokenManager.loadSession();
	t.truthy(session);
	t.is(session?.user.email, 'user@example.com');
	t.is(session?.tokens.accessToken, 'access');
});

test.serial('getAccessToken() refreshes when expiring soon', async t => {
	const keychain = new MockKeychainService();
	const tokenManager = new TokenManager(keychain);

	const oldTokens: TokenSet = {
		accessToken: 'old-access',
		tokenType: 'Bearer',
		expiresIn: 1,
		refreshToken: 'refresh',
		idToken: createIdToken({
			sub: 'user_1',
			email: 'user@example.com',
			name: 'User',
		}),
	};

	const newTokens: TokenSet = {
		accessToken: 'new-access',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'refresh-2',
		idToken: oldTokens.idToken,
	};

	await tokenManager.saveSession({
		version: 1,
		user: {id: 'user_1', email: 'user@example.com', name: 'User'},
		tokens: oldTokens,
		metadata: {
			createdAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() - 60_000).toISOString(),
		},
	});

	const oauthFlow = {
		async authorize() {
			return {
				tokens: newTokens,
				authorizationUrl: 'https://auth',
			};
		},
		async refresh() {
			return newTokens;
		},
	} as unknown as OAuthFlow;

	const client = UXLintClient.getInstance({
		tokenManager,
		oauthFlow,
		config: createConfig(),
	});

	const accessToken = await client.getAccessToken();
	t.is(accessToken, 'new-access');

	const session = await tokenManager.loadSession();
	t.is(session?.tokens.accessToken, 'new-access');
});
