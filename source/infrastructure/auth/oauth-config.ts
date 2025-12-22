import {envIO, type EnvIO} from '../config/env-io.js';

/**
 * OAuth 2.0 endpoint URLs
 */
export type OAuthEndpoints = {
	/** Authorization endpoint */
	authorization: string;

	/** Token endpoint */
	token: string;

	/** OpenID configuration endpoint (discovery) */
	openidConfiguration: string;

	/** User info endpoint (optional) */
	userInfo?: string;

	/** Token revocation endpoint (optional) */
	revocation?: string;
};

/**
 * OAuth 2.0 client configuration
 */
export type OAuthConfig = {
	/** Client ID (public identifier) */
	clientId: string;

	/** Base URL for UXLint Cloud API */
	baseUrl: string;

	/** OAuth endpoints */
	endpoints: OAuthEndpoints;

	/** Redirect URI for OAuth callback */
	redirectUri: string;

	/** OAuth scopes to request */
	scopes: string[];
};

/**
 * Get OAuth configuration from environment
 *
 * @param envIoInstance - EnvIO instance for dependency injection (defaults to singleton)
 * @returns OAuthConfig with environment variables applied
 */
export function getOAuthConfig(envIoInstance: EnvIO = envIO): OAuthConfig {
	const cloudConfig = envIoInstance.loadCloudConfig();

	return {
		clientId: cloudConfig.clientId,
		baseUrl: cloudConfig.apiBaseUrl,
		endpoints: {
			authorization: '/auth/v1/oauth/authorize',
			token: '/auth/v1/oauth/token',
			openidConfiguration: '/auth/v1/oauth/.well-known/openid-configuration',
		},
		redirectUri: cloudConfig.redirectUri,
		scopes: ['openid', 'profile', 'email'],
	};
}

/**
 * Default OAuth configuration for UXLint Cloud
 * @deprecated Use getOAuthConfig() instead for better testability
 */
export const defaultOAuthConfig: OAuthConfig = getOAuthConfig();
