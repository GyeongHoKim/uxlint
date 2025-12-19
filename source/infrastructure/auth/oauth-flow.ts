import type {TokenSet} from '../../models/token-set.js';
import type {PKCEParameters} from '../../models/pkce-params.js';
import {AuthErrorCode, AuthenticationError} from '../../models/auth-error.js';
import type {OAuthHttpClient} from './oauth-http-client.js';
import type {CallbackServer} from './callback-server.js';
import type {IBrowserService} from './browser-service.js';
import {generatePKCEParameters} from './pkce-generator.js';

export type OAuthFlowOptions = {
	/** OAuth client ID */
	clientId: string;

	/** Base URL for UXLint Cloud API */
	baseUrl: string;

	/** Redirect URI for OAuth callback */
	redirectUri: string;

	/** OAuth scopes to request */
	scopes: string[];

	/** Callback port or port range [start, end] */
	callbackPortRange?: number | [number, number];

	/** Timeout in milliseconds (default: 5 minutes) */
	timeoutMs?: number;
};

/**
 * OAuth 2.0 PKCE flow orchestrator
 * Coordinates the authorization code flow with PKCE security
 */
export class OAuthFlow {
	constructor(
		private readonly httpClient: OAuthHttpClient,
		private readonly callbackServer: CallbackServer,
		private readonly browserService: IBrowserService,
	) {}

	/**
	 * Execute the OAuth 2.0 authorization code flow with PKCE
	 * @param options - OAuth flow configuration
	 * @returns Token set from successful authorization
	 * @throws AuthenticationError on failure
	 */
	async authorize(options: OAuthFlowOptions): Promise<TokenSet> {
		// 1. Generate PKCE parameters
		const pkce = generatePKCEParameters();

		// 2. Determine callback port from redirect URI or options
		const port = this.extractPortFromRedirectUri(options);

		// 3. Construct authorization URL
		const authUrl = this.buildAuthorizationUrl(options, pkce);

		// 4. Start callback server and wait for callback (in parallel with browser opening)
		const callbackPromise = this.callbackServer.waitForCallback({
			port: options.callbackPortRange ?? port,
			expectedState: pkce.state,
			timeoutMs: options.timeoutMs ?? 300_000, // 5 minutes default
		});

		// 5. Open browser for authorization
		try {
			await this.browserService.openUrl(authUrl);
		} catch (error) {
			// Browser failed, but callback server is still running
			// User can manually open URL - rethrow with URL in message
			if (
				error instanceof AuthenticationError &&
				error.code === AuthErrorCode.BROWSER_FAILED
			) {
				throw new AuthenticationError(
					AuthErrorCode.BROWSER_FAILED,
					`Could not open browser. Please open this URL manually:\n${authUrl}`,
					error.cause,
				);
			}

			throw error;
		}

		// 6. Wait for callback with authorization code
		const callback = await callbackPromise;

		// 7. Exchange authorization code for tokens
		const tokens = await this.httpClient.exchangeCodeForTokens({
			tokenEndpoint: `${options.baseUrl}/auth/v1/oauth/token`,
			clientId: options.clientId,
			code: callback.code,
			redirectUri: options.redirectUri,
			codeVerifier: pkce.codeVerifier,
		});

		return tokens;
	}

	/**
	 * Refresh an access token using a refresh token
	 * @param refreshToken - Valid refresh token
	 * @param clientId - OAuth client ID
	 * @param baseUrl - UXLint Cloud base URL
	 * @returns New token set
	 */
	async refresh(
		refreshToken: string,
		clientId: string,
		baseUrl: string,
	): Promise<TokenSet> {
		return this.httpClient.refreshAccessToken({
			tokenEndpoint: `${baseUrl}/auth/v1/oauth/token`,
			clientId,
			refreshToken,
		});
	}

	/**
	 * Build the authorization URL with PKCE parameters
	 */
	private buildAuthorizationUrl(
		options: OAuthFlowOptions,
		pkce: PKCEParameters,
	): string {
		const parameters = new URLSearchParams({
			client_id: options.clientId,
			redirect_uri: options.redirectUri,
			response_type: 'code',
			scope: options.scopes.join(' '),
			state: pkce.state,
			code_challenge: pkce.codeChallenge,
			code_challenge_method: pkce.codeChallengeMethod,
		});

		return `${
			options.baseUrl
		}/auth/v1/oauth/authorize?${parameters.toString()}`;
	}

	/**
	 * Extract port number from redirect URI
	 */
	private extractPortFromRedirectUri(options: OAuthFlowOptions): number {
		try {
			const url = new URL(options.redirectUri);
			return url.port ? Number.parseInt(url.port, 10) : 8080;
		} catch {
			return 8080;
		}
	}
}
