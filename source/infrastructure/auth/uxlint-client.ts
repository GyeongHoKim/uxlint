import {Buffer} from 'node:buffer';
import {AuthErrorCode, AuthenticationError} from '../../models/auth-error.js';
import {
	isSessionExpired,
	type AuthenticationSession,
} from '../../models/auth-session.js';
import type {TokenSet} from '../../models/token-set.js';
import type {UserProfile} from '../../models/user-profile.js';
import {OpenBrowserService} from './browser-impl.js';
import {CallbackServer} from './callback-server.js';
import {KeytarKeychainService} from './keychain-impl.js';
import {defaultOAuthConfig, type OAuthConfig} from './oauth-config.js';
import {OAuthFlow} from './oauth-flow.js';
import {OAuthHttpClient} from './oauth-http-client.js';
import {TokenManager} from './token-manager.js';

/**
 * JWT payload structure from ID token
 */
type JWTPayload = {
	sub: string;
	email?: string;
	name?: string;
	org?: string;
	picture?: string;
	email_verified?: boolean;
};

/**
 * UXLint authentication client
 * Singleton pattern for managing global authentication state
 */
export class UXLintClient {
	/**
	 * Get the singleton instance of UXLintClient
	 * Creates production dependencies on first call
	 */
	static getInstance(): UXLintClient {
		UXLintClient.instance ??= (() => {
			// Create production dependencies
			const keychain = new KeytarKeychainService();
			const browser = new OpenBrowserService();
			const httpClient = new OAuthHttpClient();
			const callbackServer = new CallbackServer();
			const oauthFlow = new OAuthFlow(httpClient, callbackServer, browser);
			const tokenManager = new TokenManager(keychain);

			return new UXLintClient(tokenManager, oauthFlow, defaultOAuthConfig);
		})();

		return UXLintClient.instance;
	}

	/**
	 * Create a UXLintClient with custom dependencies (for testing)
	 */
	static createWithDependencies(
		tokenManager: TokenManager,
		oauthFlow: OAuthFlow,
		config: OAuthConfig,
	): UXLintClient {
		return new UXLintClient(tokenManager, oauthFlow, config);
	}

	/**
	 * Reset the singleton instance (for testing)
	 */
	static resetInstance(): void {
		UXLintClient.instance = undefined;
	}

	private static instance: UXLintClient | undefined;

	private currentSession: AuthenticationSession | undefined;

	private constructor(
		private readonly tokenManager: TokenManager,
		private readonly oauthFlow: OAuthFlow,
		private readonly config: OAuthConfig,
	) {}

	/**
	 * Authenticate with UXLint Cloud
	 * @throws AuthenticationError on failure
	 */
	async login(): Promise<void> {
		// Check if already logged in
		const existing = await this.tokenManager.loadSession();
		if (existing && !isSessionExpired(existing)) {
			throw new AuthenticationError(
				AuthErrorCode.ALREADY_AUTHENTICATED,
				'Already logged in. Use logout first to re-authenticate.',
			);
		}

		// Execute OAuth flow
		const tokens = await this.oauthFlow.authorize({
			clientId: this.config.clientId,
			baseUrl: this.config.baseUrl,
			redirectUri: this.config.redirectUri,
			scopes: this.config.scopes,
		});

		// Decode ID token to get user profile
		const userProfile = this.decodeIdToken(tokens);

		// Create session
		const session: AuthenticationSession = {
			version: 1,
			user: userProfile,
			tokens,
			metadata: {
				createdAt: new Date().toISOString(),
				lastRefreshedAt: new Date().toISOString(),
				expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
				scopes: tokens.scope.split(' '),
			},
		};

		// Save session
		await this.tokenManager.saveSession(session);
		this.currentSession = session;
	}

	/**
	 * Log out from UXLint Cloud
	 */
	async logout(): Promise<void> {
		await this.tokenManager.deleteSession();
		this.currentSession = undefined;
	}

	/**
	 * Get current authentication status
	 * @returns Authentication session or undefined if not logged in
	 */
	async getStatus(): Promise<AuthenticationSession | undefined> {
		this.currentSession ??= await this.tokenManager.loadSession();
		return this.currentSession;
	}

	/**
	 * Check if user is authenticated
	 * @returns true if logged in and session is valid
	 */
	async isAuthenticated(): Promise<boolean> {
		const session = await this.getStatus();
		return session !== undefined && !isSessionExpired(session);
	}

	/**
	 * Get the current user profile
	 * @throws AuthenticationError if not logged in
	 */
	async getUserProfile(): Promise<UserProfile> {
		const session = await this.getStatus();
		if (!session) {
			throw new AuthenticationError(
				AuthErrorCode.NOT_AUTHENTICATED,
				'Not authenticated. Please run `uxlint auth login` first.',
			);
		}

		return session.user;
	}

	/**
	 * Get a valid access token
	 * Automatically refreshes if expired or expiring soon
	 * @throws AuthenticationError if not logged in or refresh fails
	 */
	async getAccessToken(): Promise<string> {
		const session = await this.getStatus();
		if (!session) {
			throw new AuthenticationError(
				AuthErrorCode.NOT_AUTHENTICATED,
				'Not authenticated. Please run `uxlint auth login` first.',
			);
		}

		// Refresh if expired or expiring within 5 minutes
		if (isSessionExpired(session, 5)) {
			await this.refreshToken();
			return this.currentSession!.tokens.accessToken;
		}

		return session.tokens.accessToken;
	}

	/**
	 * Refresh the access token
	 * @throws AuthenticationError if not logged in or refresh fails
	 */
	async refreshToken(): Promise<void> {
		const session = await this.getStatus();
		if (!session) {
			throw new AuthenticationError(
				AuthErrorCode.NOT_AUTHENTICATED,
				'Not authenticated',
			);
		}

		try {
			const newTokens = await this.oauthFlow.refresh(
				session.tokens.refreshToken,
				this.config.clientId,
				this.config.baseUrl,
			);

			// Update session with new tokens
			const updatedSession: AuthenticationSession = {
				...session,
				tokens: newTokens,
				metadata: {
					...session.metadata,
					lastRefreshedAt: new Date().toISOString(),
					expiresAt: new Date(
						Date.now() + newTokens.expiresIn * 1000,
					).toISOString(),
				},
			};

			await this.tokenManager.saveSession(updatedSession);
			this.currentSession = updatedSession;
		} catch (error) {
			// Refresh failed, clear session
			await this.logout();
			throw new AuthenticationError(
				AuthErrorCode.REFRESH_FAILED,
				'Token refresh failed. Please log in again.',
				error instanceof Error ? error : undefined,
			);
		}
	}

	/**
	 * Decode the ID token to extract user profile
	 */
	private decodeIdToken(tokens: TokenSet): UserProfile {
		if (!tokens.idToken) {
			// If no ID token, create minimal profile from tokens
			return {
				id: 'unknown',
				email: 'unknown@uxlint.org',
				name: 'UXLint User',
				emailVerified: false,
			};
		}

		try {
			// Decode JWT (base64URL decode payload)
			const parts = tokens.idToken.split('.');
			if (parts.length !== 3) {
				throw new Error('Invalid JWT format');
			}

			const payloadPart = parts[1];
			if (!payloadPart) {
				throw new Error('Missing JWT payload');
			}

			const payload = JSON.parse(
				Buffer.from(payloadPart, 'base64url').toString('utf8'),
			) as JWTPayload;

			return {
				id: payload.sub,
				email: payload.email ?? 'unknown@uxlint.org',
				name: payload.name ?? 'UXLint User',
				organization: payload.org,
				picture: payload.picture,
				emailVerified: payload.email_verified ?? false,
			};
		} catch {
			// Fallback to minimal profile on decode error
			return {
				id: 'unknown',
				email: 'unknown@uxlint.org',
				name: 'UXLint User',
				emailVerified: false,
			};
		}
	}
}

/**
 * Get the singleton UXLintClient instance
 */
export function getUXLintClient(): UXLintClient {
	return UXLintClient.getInstance();
}
