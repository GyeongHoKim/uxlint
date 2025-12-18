import test from 'ava';
import {OAuthFlow} from '../../../source/infrastructure/auth/oauth-flow.js';
import type {OAuthHttpClient} from '../../../source/infrastructure/auth/oauth-http-client.js';
import type {CallbackServer} from '../../../source/infrastructure/auth/callback-server.js';
import type {IBrowserService} from '../../../source/infrastructure/auth/browser-service.js';

test('OAuthFlow.authorize() builds URL and exchanges code', async t => {
	const httpClient = {
		async exchangeCodeForTokens() {
			return {
				accessToken: 'access',
				tokenType: 'Bearer',
				expiresIn: 3600,
				refreshToken: 'refresh',
			};
		},
		async refreshAccessToken() {
			throw new Error('not used');
		},
		async getOpenIDConfiguration() {
			return {};
		},
	} as unknown as OAuthHttpClient;

	const callbackServer = {
		async waitForCallback() {
			return {code: 'code', state: 'state'};
		},
		async stop() {
			// Noop
		},
	} as unknown as CallbackServer;

	const browser: IBrowserService = {
		async openUrl() {
			// Noop
		},
		async isAvailable() {
			return true;
		},
	};

	const flow = new OAuthFlow(httpClient, callbackServer, browser);
	const result = await flow.authorize({
		clientId: 'client',
		baseUrl: 'https://app.uxlint.org',
		authorizePath: '/auth/v1/oauth/authorize',
		tokenPath: '/auth/v1/oauth/token',
		redirectUri: 'http://localhost:8080/callback',
		scopes: ['openid'],
	});

	t.true(result.authorizationUrl.includes('code_challenge='));
	t.is(result.tokens.accessToken, 'access');
});
