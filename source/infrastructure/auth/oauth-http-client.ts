import {AuthErrorCode, AuthenticationError} from '../../models/auth-error.js';
import type {TokenSet} from '../../models/token-set.js';

export type TokenExchangeParameters = {
	tokenEndpoint: string;
	clientId: string;
	code: string;
	redirectUri: string;
	codeVerifier: string;
};

export type TokenRefreshParameters = {
	tokenEndpoint: string;
	clientId: string;
	refreshToken: string;
	scope?: string;
};

export type OIDCConfiguration = {
	issuer: string;
	authorizationEndpoint: string;
	tokenEndpoint: string;
	userinfoEndpoint?: string;
	jwksUri: string;
	responseTypesSupported: string[];
	grantTypesSupported: string[];
	scopesSupported: string[];
	codeChallengeMethodsSupported: string[];
};

type OAuthTokenResponse = {
	access_token: string;
	token_type: 'Bearer';
	expires_in: number;
	refresh_token: string;
	id_token?: string;
	scope: string;
};

type OAuthErrorResponse = {
	error: string;
	error_description?: string;
	error_uri?: string;
};

type OIDCConfigResponse = {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	userinfo_endpoint?: string;
	jwks_uri: string;
	response_types_supported: string[];
	grant_types_supported: string[];
	scopes_supported: string[];
	code_challenge_methods_supported: string[];
};

export class OAuthHttpClient {
	async exchangeCodeForTokens(
		parameters: TokenExchangeParameters,
	): Promise<TokenSet> {
		const body = new URLSearchParams({
			grant_type: 'authorization_code',
			client_id: parameters.clientId,
			code: parameters.code,
			redirect_uri: parameters.redirectUri,
			code_verifier: parameters.codeVerifier,
		});

		return this.fetchTokens(parameters.tokenEndpoint, body, 'code exchange');
	}

	async refreshAccessToken(
		parameters: TokenRefreshParameters,
	): Promise<TokenSet> {
		const body = new URLSearchParams({
			grant_type: 'refresh_token',
			client_id: parameters.clientId,
			refresh_token: parameters.refreshToken,
		});

		if (parameters.scope) {
			body.set('scope', parameters.scope);
		}

		try {
			return await this.fetchTokens(
				parameters.tokenEndpoint,
				body,
				'token refresh',
			);
		} catch (error) {
			if (
				error instanceof AuthenticationError &&
				error.code === AuthErrorCode.INVALID_RESPONSE
			) {
				throw new AuthenticationError(
					AuthErrorCode.REFRESH_FAILED,
					error.message,
					error.cause,
				);
			}

			throw error;
		}
	}

	async getOpenIDConfiguration(baseUrl: string): Promise<OIDCConfiguration> {
		const url = `${baseUrl}/auth/v1/oauth/.well-known/openid-configuration`;

		try {
			const response = await fetch(url);

			if (!response.ok) {
				throw new AuthenticationError(
					AuthErrorCode.NETWORK_ERROR,
					`Failed to fetch OIDC configuration: HTTP ${response.status}`,
				);
			}

			const data = (await response.json()) as OIDCConfigResponse;

			return {
				issuer: data.issuer,
				authorizationEndpoint: data.authorization_endpoint,
				tokenEndpoint: data.token_endpoint,
				userinfoEndpoint: data.userinfo_endpoint,
				jwksUri: data.jwks_uri,
				responseTypesSupported: data.response_types_supported,
				grantTypesSupported: data.grant_types_supported,
				scopesSupported: data.scopes_supported,
				codeChallengeMethodsSupported: data.code_challenge_methods_supported,
			};
		} catch (error) {
			if (error instanceof AuthenticationError) {
				throw error;
			}

			throw new AuthenticationError(
				AuthErrorCode.NETWORK_ERROR,
				'Failed to fetch OIDC configuration',
				error as Error,
			);
		}
	}

	private async fetchTokens(
		endpoint: string,
		body: URLSearchParams,
		operation: string,
	): Promise<TokenSet> {
		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: body.toString(),
			});

			const data = (await response.json()) as
				| OAuthTokenResponse
				| OAuthErrorResponse;

			if (!response.ok) {
				const errorData = data as OAuthErrorResponse;
				const message = errorData.error_description
					? `${errorData.error}: ${errorData.error_description}`
					: errorData.error;

				throw new AuthenticationError(
					AuthErrorCode.INVALID_RESPONSE,
					`OAuth ${operation} failed: ${message}`,
				);
			}

			const tokenData = data as OAuthTokenResponse;

			return {
				accessToken: tokenData.access_token,
				tokenType: tokenData.token_type,
				expiresIn: tokenData.expires_in,
				refreshToken: tokenData.refresh_token,
				idToken: tokenData.id_token,
				scope: tokenData.scope,
			};
		} catch (error) {
			if (error instanceof AuthenticationError) {
				throw error;
			}

			throw new AuthenticationError(
				AuthErrorCode.NETWORK_ERROR,
				`Network error during ${operation}`,
				error as Error,
			);
		}
	}
}
