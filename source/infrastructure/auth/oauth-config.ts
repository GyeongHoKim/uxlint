import process from 'node:process';
import {config} from 'dotenv';

config({quiet: true});

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
 * Default OAuth configuration for UXLint Cloud
 * Uses environment variables for overrides:
 * - UXLINT_CLOUD_CLIENT_ID: Override client ID (for development)
 * - UXLINT_CLOUD_API_BASE_URL: Override base URL (for staging/local testing)
 */
export const defaultOAuthConfig: OAuthConfig = {
	clientId: process.env['UXLINT_CLOUD_CLIENT_ID'] ?? 'uxlint-cli',
	baseUrl:
		process.env['UXLINT_CLOUD_API_BASE_URL'] ??
		'https://hyvuqqbpiitcsjwztsyb.supabase.co',
	endpoints: {
		authorization: '/auth/v1/oauth/authorize',
		token: '/auth/v1/oauth/token',
		openidConfiguration: '/auth/v1/oauth/.well-known/openid-configuration',
	},
	redirectUri:
		process.env['UXLINT_CLOUD_REDIRECT_URI'] ??
		'http://localhost:8080/callback',
	scopes: ['openid', 'profile', 'email'],
};
