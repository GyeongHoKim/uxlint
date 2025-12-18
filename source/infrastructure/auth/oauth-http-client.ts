import {AuthenticationError, AuthErrorCode} from '../../models/auth-error.js';
import type {TokenSet} from '../../models/token-set.js';

type FetchLike = typeof fetch;

function toUrl(baseUrl: string, path: string): string {
	return new URL(path, baseUrl).toString();
}

type OAuthTokenResponse = {
	access_token: string;
	token_type: string;
	expires_in: number;
	refresh_token: string;
	id_token?: string;
	scope?: string;
	error?: string;
	error_description?: string;
};

export class OAuthHttpClient {
	constructor(private readonly fetchImpl: FetchLike = fetch) {}

	async exchangeCodeForTokens(options: {
		baseUrl: string;
		tokenPath: string;
		clientId: string;
		code: string;
		redirectUri: string;
		codeVerifier: string;
	}): Promise<TokenSet> {
		const tokenEndpoint = toUrl(options.baseUrl, options.tokenPath);
		const body = new URLSearchParams({
			grant_type: 'authorization_code',
			client_id: options.clientId,
			code: options.code,
			redirect_uri: options.redirectUri,
			code_verifier: options.codeVerifier,
		});

		const response = await this.fetchImpl(tokenEndpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
			},
			body,
		});

		return this.parseTokenResponse(response, tokenEndpoint);
	}

	async refreshAccessToken(options: {
		baseUrl: string;
		tokenPath: string;
		clientId: string;
		refreshToken: string;
		scope?: string;
	}): Promise<TokenSet> {
		const tokenEndpoint = toUrl(options.baseUrl, options.tokenPath);
		const body = new URLSearchParams({
			grant_type: 'refresh_token',
			client_id: options.clientId,
			refresh_token: options.refreshToken,
		});

		if (options.scope) {
			body.set('scope', options.scope);
		}

		const response = await this.fetchImpl(tokenEndpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
			},
			body,
		});

		return this.parseTokenResponse(response, tokenEndpoint);
	}

	async getOpenIDConfiguration(options: {
		baseUrl: string;
		path: string;
	}): Promise<unknown> {
		const url = toUrl(options.baseUrl, options.path);
		const response = await this.fetchImpl(url, {method: 'GET'});
		if (!response.ok) {
			throw new AuthenticationError(
				AuthErrorCode.NETWORK_ERROR,
				'Failed to fetch OpenID configuration',
				{
					url,
					status: response.status,
				},
			);
		}

		return response.json() as Promise<unknown>;
	}

	private async parseTokenResponse(
		response: Response,
		url: string,
	): Promise<TokenSet> {
		let data: OAuthTokenResponse;
		try {
			data = (await response.json()) as OAuthTokenResponse;
		} catch (error) {
			throw new AuthenticationError(
				AuthErrorCode.NETWORK_ERROR,
				'Invalid token response',
				{
					url,
					status: response.status,
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}

		if (!response.ok) {
			const maybeDenied = data.error === 'access_denied';
			throw new AuthenticationError(
				maybeDenied ? AuthErrorCode.USER_DENIED : AuthErrorCode.NETWORK_ERROR,
				data.error_description ?? 'OAuth token request failed',
				{url, status: response.status, error: data.error},
			);
		}

		if (data.token_type !== 'Bearer') {
			throw new AuthenticationError(
				AuthErrorCode.INVALID_RESPONSE,
				'Unexpected token_type in token response',
				{
					url,
					tokenType: data.token_type,
				},
			);
		}

		return {
			accessToken: data.access_token,
			tokenType: 'Bearer',
			expiresIn: data.expires_in,
			refreshToken: data.refresh_token,
			idToken: data.id_token,
			scope: data.scope,
		};
	}
}
