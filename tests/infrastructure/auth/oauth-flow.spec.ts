import test from 'ava';
import sinon from 'sinon';
import type {IBrowserService} from '../../../source/infrastructure/auth/browser-service.js';
import {
	CallbackServer,
	type CallbackResult,
} from '../../../source/infrastructure/auth/callback-server.js';
import {OAuthFlow} from '../../../source/infrastructure/auth/oauth-flow.js';
import {OAuthHttpClient} from '../../../source/infrastructure/auth/oauth-http-client.js';
import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';
import type {TokenSet} from '../../../source/models/token-set.js';

function createOAuthFlow() {
	const sandbox = sinon.createSandbox();

	// Create stub instances for classes
	const httpClient = sandbox.createStubInstance(OAuthHttpClient);
	const callbackServer = sandbox.createStubInstance(CallbackServer);

	// Track opened URLs separately since IBrowserService doesn't have this property
	const openedUrls: string[] = [];

	// Create stub object for interface
	const browserService: IBrowserService = {
		openUrl: sandbox.stub().callsFake(async (url: string) => {
			openedUrls.push(url);
		}),
		isAvailable: sandbox.stub().resolves(true),
	};

	// Setup default return values
	const mockTokenSet: TokenSet = {
		accessToken: 'mock_access_token',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'mock_refresh_token',
		idToken: 'mock_id_token',
		scope: 'openid profile email',
	};

	const mockCallbackResult: CallbackResult = {
		code: 'mock_auth_code',
		state: '',
	};

	httpClient.exchangeCodeForTokens.resolves(mockTokenSet);
	httpClient.refreshAccessToken.resolves(mockTokenSet);
	callbackServer.waitForCallback.callsFake(async options => ({
		...mockCallbackResult,
		state: options.expectedState,
	}));

	const flow = new OAuthFlow(httpClient, callbackServer, browserService);

	return {
		flow,
		httpClient,
		callbackServer,
		browserService,
		openedUrls,
		sandbox,
	};
}

// T065: Integration tests for OAuthFlow
test('OAuthFlow.authorize executes complete OAuth flow', async t => {
	const {flow, httpClient, callbackServer, openedUrls, sandbox} =
		createOAuthFlow();

	const tokens = await flow.authorize({
		clientId: 'test-client',
		baseUrl: 'https://app.uxlint.org',
		redirectUri: 'http://localhost:8080/callback',
		scopes: ['openid', 'profile'],
	});

	t.true(openedUrls.length > 0);
	t.true(callbackServer.waitForCallback.called);
	t.true(httpClient.exchangeCodeForTokens.called);
	t.is(tokens.accessToken, 'mock_access_token');

	sandbox.restore();
});

test('OAuthFlow.authorize builds correct authorization URL', async t => {
	const {flow, openedUrls, sandbox} = createOAuthFlow();

	await flow.authorize({
		clientId: 'test-client',
		baseUrl: 'https://app.uxlint.org',
		redirectUri: 'http://localhost:8080/callback',
		scopes: ['openid', 'profile', 'email'],
	});

	const authUrl = openedUrls.at(-1);
	t.truthy(authUrl);
	t.true(authUrl?.includes('client_id=test-client'));
	t.true(authUrl?.includes('redirect_uri='));
	t.true(authUrl?.includes('response_type=code'));
	t.true(authUrl?.includes('scope=openid+profile+email'));
	t.true(authUrl?.includes('code_challenge='));
	t.true(authUrl?.includes('code_challenge_method=S256'));
	t.true(authUrl?.includes('state='));

	sandbox.restore();
});

test('OAuthFlow.authorize includes PKCE parameters', async t => {
	const {flow, openedUrls, sandbox} = createOAuthFlow();

	await flow.authorize({
		clientId: 'test-client',
		baseUrl: 'https://app.uxlint.org',
		redirectUri: 'http://localhost:8080/callback',
		scopes: ['openid'],
	});

	const authUrl = openedUrls.at(-1);
	t.truthy(authUrl);
	t.true(authUrl?.includes('code_challenge='));
	t.true(authUrl?.includes('code_challenge_method=S256'));

	sandbox.restore();
});

test('OAuthFlow.authorize throws BROWSER_FAILED when browser fails', async t => {
	const {flow, browserService, sandbox} = createOAuthFlow();
	browserService.openUrl = sandbox
		.stub()
		.rejects(
			new AuthenticationError(
				AuthErrorCode.BROWSER_FAILED,
				'Mock browser failure',
			),
		);

	const error = await t.throwsAsync(async () =>
		flow.authorize({
			clientId: 'test-client',
			baseUrl: 'https://app.uxlint.org',
			redirectUri: 'http://localhost:8080/callback',
			scopes: ['openid'],
		}),
	);

	t.true(error instanceof AuthenticationError);
	if (error instanceof AuthenticationError) {
		t.is(error.code, AuthErrorCode.BROWSER_FAILED);
		t.true(error.message.includes('Could not open browser'));
	}

	sandbox.restore();
});

test('OAuthFlow.authorize includes URL in error message when browser fails', async t => {
	const {flow, browserService, sandbox} = createOAuthFlow();
	browserService.openUrl = sandbox
		.stub()
		.rejects(
			new AuthenticationError(
				AuthErrorCode.BROWSER_FAILED,
				'Mock browser failure',
			),
		);

	const error = await t.throwsAsync(async () =>
		flow.authorize({
			clientId: 'test-client',
			baseUrl: 'https://app.uxlint.org',
			redirectUri: 'http://localhost:8080/callback',
			scopes: ['openid'],
		}),
	);

	t.true(error?.message.includes('https://app.uxlint.org'));

	sandbox.restore();
});

test('OAuthFlow.authorize sends code verifier to token endpoint', async t => {
	const {flow, httpClient, sandbox} = createOAuthFlow();

	await flow.authorize({
		clientId: 'test-client',
		baseUrl: 'https://app.uxlint.org',
		redirectUri: 'http://localhost:8080/callback',
		scopes: ['openid'],
	});

	t.true(httpClient.exchangeCodeForTokens.called);
	t.is(httpClient.exchangeCodeForTokens.callCount, 1);

	// Verify parameters using calledWith matcher
	const {firstCall} = httpClient.exchangeCodeForTokens;
	t.truthy(firstCall);
	t.truthy(firstCall.args[0]);

	// Access properties without type assertion by checking structure
	const parameters = firstCall.args[0];
	if (
		parameters &&
		typeof parameters === 'object' &&
		'codeVerifier' in parameters &&
		'code' in parameters
	) {
		t.truthy(parameters.codeVerifier);
		t.is(parameters.code, 'mock_auth_code');
	} else {
		t.fail('Parameters do not have expected structure');
	}

	sandbox.restore();
});

test('OAuthFlow.refresh calls refreshAccessToken', async t => {
	const {flow, httpClient, sandbox} = createOAuthFlow();

	const tokens = await flow.refresh(
		'mock_refresh_token',
		'test-client',
		'https://app.uxlint.org',
	);

	t.true(httpClient.refreshAccessToken.called);
	t.is(tokens.accessToken, 'mock_access_token');

	sandbox.restore();
});

test('OAuthFlow.refresh sends correct parameters', async t => {
	const {flow, httpClient, sandbox} = createOAuthFlow();

	await flow.refresh(
		'my_refresh_token',
		'my-client-id',
		'https://app.uxlint.org',
	);

	t.true(httpClient.refreshAccessToken.called);
	t.is(httpClient.refreshAccessToken.callCount, 1);

	// Verify parameters without type assertion
	const {firstCall} = httpClient.refreshAccessToken;
	t.truthy(firstCall);
	t.truthy(firstCall.args[0]);

	// Access properties without type assertion by checking structure
	const parameters = firstCall.args[0];
	if (
		parameters &&
		typeof parameters === 'object' &&
		'refreshToken' in parameters &&
		'clientId' in parameters &&
		'tokenEndpoint' in parameters
	) {
		t.is(parameters.refreshToken, 'my_refresh_token');
		t.is(parameters.clientId, 'my-client-id');
		t.is(
			parameters.tokenEndpoint,
			'https://app.uxlint.org/auth/v1/oauth/token',
		);
	} else {
		t.fail('Parameters do not have expected structure');
	}

	sandbox.restore();
});
