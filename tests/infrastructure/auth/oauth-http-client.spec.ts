import test from 'ava';
import {setupServer} from 'msw/node';
import {OAuthHttpClient} from '../../../source/infrastructure/auth/oauth-http-client.js';
import {oauthServerHandlers} from '../../mocks/oauth-server.js';
import {AuthErrorCode} from '../../../source/models/auth-error.js';

const baseUrl = 'https://app.uxlint.org';
const tokenPath = '/auth/v1/oauth/token';

function createServer(...handlers: Parameters<typeof setupServer>) {
	const server = setupServer(...handlers);
	server.listen({onUnhandledRequest: 'error'});
	return server;
}

test.serial('exchangeCodeForTokens() returns TokenSet', async t => {
	const server = createServer(oauthServerHandlers.tokenSuccess);
	t.teardown(() => {
		server.close();
	});

	const client = new OAuthHttpClient();
	const tokens = await client.exchangeCodeForTokens({
		baseUrl,
		tokenPath,
		clientId: 'client_123',
		code: 'code',
		redirectUri: 'http://localhost:8080/callback',
		codeVerifier: 'verifier',
	});

	t.is(tokens.tokenType, 'Bearer');
	t.is(tokens.accessToken, 'access');
});

test.serial('refreshAccessToken() returns TokenSet', async t => {
	const server = createServer(oauthServerHandlers.tokenSuccess);
	t.teardown(() => {
		server.close();
	});

	const client = new OAuthHttpClient();
	const tokens = await client.refreshAccessToken({
		baseUrl,
		tokenPath,
		clientId: 'client_123',
		refreshToken: 'refresh',
	});

	t.is(tokens.accessToken, 'access-2');
});

test.serial(
	'exchangeCodeForTokens() throws AuthenticationError on HTTP error',
	async t => {
		const server = createServer(oauthServerHandlers.tokenError);
		t.teardown(() => {
			server.close();
		});

		const client = new OAuthHttpClient();
		const error = await t.throwsAsync(async () => {
			await client.exchangeCodeForTokens({
				baseUrl,
				tokenPath,
				clientId: 'client_123',
				code: 'code',
				redirectUri: 'http://localhost:8080/callback',
				codeVerifier: 'verifier',
			});
		});

		t.is((error as any)?.code, AuthErrorCode.NETWORK_ERROR);
	},
);
