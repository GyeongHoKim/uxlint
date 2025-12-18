import {AuthenticationError, AuthErrorCode} from '../../models/auth-error.js';
import type {TokenSet} from '../../models/token-set.js';
import {generatePKCEParameters} from './pkce-generator.js';
import type {IBrowserService} from './browser-service.js';
import type {CallbackServer, OAuthCallbackResult} from './callback-server.js';
import type {OAuthHttpClient} from './oauth-http-client.js';

export class OAuthFlow {
	constructor(
		private readonly httpClient: OAuthHttpClient,
		private readonly callbackServer: CallbackServer,
		private readonly browser: IBrowserService,
	) {}

	async authorize(options: {
		clientId: string;
		baseUrl: string;
		authorizePath: string;
		tokenPath: string;
		redirectUri: string;
		scopes: string[];
		timeoutMs?: number;
		onStatus?: (
			status:
				| 'opening-browser'
				| 'waiting-for-authentication'
				| 'exchanging-tokens',
		) => void;
	}): Promise<{tokens: TokenSet; authorizationUrl: string}> {
		const pkce = generatePKCEParameters();
		const authorizationUrl = this.buildAuthorizationUrl({
			baseUrl: options.baseUrl,
			authorizePath: options.authorizePath,
			clientId: options.clientId,
			redirectUri: options.redirectUri,
			scopes: options.scopes,
			codeChallenge: pkce.codeChallenge,
			codeChallengeMethod: pkce.codeChallengeMethod,
			state: pkce.state,
		});

		// Start callback server first so we don't miss a fast redirect.
		const callbackPromise: Promise<OAuthCallbackResult> =
			this.callbackServer.waitForCallback({
				authorizationUrl,
				redirectUri: options.redirectUri,
				expectedState: pkce.state,
				timeoutMs: options.timeoutMs,
			});

		options.onStatus?.('opening-browser');
		try {
			await this.browser.openUrl(authorizationUrl);
		} catch (error: unknown) {
			await this.callbackServer.stop();
			// Preserve AuthenticationError thrown by browser service.
			if (error instanceof AuthenticationError) {
				throw error;
			}

			throw new AuthenticationError(
				AuthErrorCode.BROWSER_FAILED,
				'Failed to open browser',
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}

		let callback: OAuthCallbackResult;
		try {
			options.onStatus?.('waiting-for-authentication');
			callback = await callbackPromise;
		} finally {
			await this.callbackServer.stop();
		}

		if (callback.error) {
			const isDenied = callback.error === 'access_denied';
			throw new AuthenticationError(
				isDenied ? AuthErrorCode.USER_DENIED : AuthErrorCode.INVALID_RESPONSE,
				callback.errorDescription ?? 'OAuth callback error',
				{error: callback.error, errorUri: callback.errorUri},
			);
		}

		if (!callback.code) {
			throw new AuthenticationError(
				AuthErrorCode.INVALID_RESPONSE,
				'Missing authorization code',
			);
		}

		options.onStatus?.('exchanging-tokens');
		const tokens = await this.httpClient.exchangeCodeForTokens({
			baseUrl: options.baseUrl,
			tokenPath: options.tokenPath,
			clientId: options.clientId,
			code: callback.code,
			redirectUri: options.redirectUri,
			codeVerifier: pkce.codeVerifier,
		});

		return {tokens, authorizationUrl};
	}

	async refresh(options: {
		clientId: string;
		baseUrl: string;
		tokenPath: string;
		refreshToken: string;
		scope?: string;
	}): Promise<TokenSet> {
		return this.httpClient.refreshAccessToken({
			baseUrl: options.baseUrl,
			tokenPath: options.tokenPath,
			clientId: options.clientId,
			refreshToken: options.refreshToken,
			scope: options.scope,
		});
	}

	private buildAuthorizationUrl(options: {
		baseUrl: string;
		authorizePath: string;
		clientId: string;
		redirectUri: string;
		scopes: string[];
		codeChallenge: string;
		codeChallengeMethod: 'S256';
		state: string;
	}): string {
		const url = new URL(options.authorizePath, options.baseUrl);
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('client_id', options.clientId);
		url.searchParams.set('redirect_uri', options.redirectUri);
		url.searchParams.set('scope', options.scopes.join(' '));
		url.searchParams.set('code_challenge', options.codeChallenge);
		url.searchParams.set('code_challenge_method', options.codeChallengeMethod);
		url.searchParams.set('state', options.state);
		return url.toString();
	}
}
