import process from 'node:process';
import {AuthenticationError, AuthErrorCode} from '../../models/auth-error.js';

export type OAuthEndpoints = {
	authorizePath: string;
	tokenPath: string;
	openIdConfigurationPath: string;
};

export type OAuthConfig = {
	clientId: string;
	baseUrl: string;
	endpoints: OAuthEndpoints;
	redirectUri: string;
	scopes: string[];
};

export const defaultOAuthConfig: OAuthConfig = {
	clientId: process.env['UXLINT_CLOUD_CLIENT_ID'] ?? '',
	baseUrl: process.env['UXLINT_CLOUD_API_BASE_URL'] ?? 'https://app.uxlint.org',
	endpoints: {
		authorizePath: '/auth/v1/oauth/authorize',
		tokenPath: '/auth/v1/oauth/token',
		openIdConfigurationPath: '/.well-known/openid-configuration',
	},
	redirectUri: 'http://localhost:8080/callback',
	scopes: ['openid', 'profile', 'email', 'uxlint:api'],
};

export function requireOAuthClientId(config: OAuthConfig): string {
	if (config.clientId.trim().length === 0) {
		throw new AuthenticationError(
			AuthErrorCode.INVALID_CONFIG,
			'Missing OAuth client ID. Set UXLINT_CLOUD_CLIENT_ID in your environment.',
		);
	}

	return config.clientId;
}
