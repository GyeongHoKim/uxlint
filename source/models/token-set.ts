/**
 * OAuth 2.0 token set containing access token, refresh token, and optional ID token
 */
export type TokenSet = {
	/** Access token for API authorization */
	accessToken: string;

	/** Token type (always "Bearer" for OAuth 2.0) */
	tokenType: 'Bearer';

	/** Access token lifetime in seconds */
	expiresIn: number;

	/** Refresh token for obtaining new access tokens */
	refreshToken: string;

	/** ID token (JWT) containing user claims (OIDC) */
	idToken?: string;

	/** OAuth scopes granted */
	scope: string;
};
