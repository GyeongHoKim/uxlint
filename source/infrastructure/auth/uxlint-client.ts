import {
	createRemoteJWKSet,
	jwtVerify,
	type JWTPayload as JoseJWTPayload,
} from 'jose';
import {AuthErrorCode, AuthenticationError} from '../../models/auth-error.js';
import {
	isSessionExpired,
	type AuthenticationSession,
} from '../../models/auth-session.js';
import type {TokenSet} from '../../models/token-set.js';
import type {UserProfile} from '../../models/user-profile.js';
import {logger} from '../logger.js';
import {TOKEN_REFRESH_BUFFER_MINUTES} from './auth-constants.js';
import {OpenBrowserService} from './browser-impl.js';
import {CallbackServer} from './callback-server.js';
import {KeytarKeychainService} from './keychain-impl.js';
import {getOAuthConfig, type OAuthConfig} from './oauth-config.js';
import {OAuthFlow} from './oauth-flow.js';
import {OAuthHttpClient} from './oauth-http-client.js';
import {TokenManager} from './token-manager.js';

/**
 * JWT payload structure from ID token
 */
type JWTPayload = {
	sub: string;
	iss?: string;
	aud?: string | string[];
	exp?: number;
	nbf?: number;
	iat?: number;
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
		if (!UXLintClient.instance) {
			try {
				// Create production dependencies
				const keychain = new KeytarKeychainService();
				const browser = new OpenBrowserService();
				const httpClient = new OAuthHttpClient();
				const callbackServer = new CallbackServer();
				const oauthFlow = new OAuthFlow(httpClient, callbackServer, browser);
				const tokenManager = new TokenManager(keychain);

				UXLintClient.instance = new UXLintClient(
					tokenManager,
					oauthFlow,
					httpClient,
					getOAuthConfig(),
				);
			} catch (error) {
				UXLintClient.instance = undefined;
				throw error;
			}
		}

		return UXLintClient.instance;
	}

	/**
	 * Create a UXLintClient with custom dependencies (for testing)
	 */
	static createWithDependencies(
		tokenManager: TokenManager,
		oauthFlow: OAuthFlow,
		httpClient: OAuthHttpClient,
		config: OAuthConfig,
	): UXLintClient {
		return new UXLintClient(tokenManager, oauthFlow, httpClient, config);
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
		private readonly httpClient: OAuthHttpClient,
		private readonly config: OAuthConfig,
	) {}

	/**
	 * Authenticate with UXLint Cloud
	 * @throws AuthenticationError on failure
	 */
	async login(): Promise<void> {
		const startTime = performance.now();

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

		// Decode and verify ID token to get user profile
		const userProfile = await this.decodeIdToken(tokens);

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

		const duration = performance.now() - startTime;
		logger.info('Login flow completed', {
			userId: userProfile.id,
			durationMs: Math.round(duration),
			durationSeconds: (duration / 1000).toFixed(2),
		});
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
		const startTime = performance.now();
		this.currentSession ??= await this.tokenManager.loadSession();
		const duration = performance.now() - startTime;

		logger.debug('Status check completed', {
			authenticated: this.currentSession !== undefined,
			durationMs: Math.round(duration),
		});

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

		// Refresh if expired or expiring soon
		if (isSessionExpired(session, TOKEN_REFRESH_BUFFER_MINUTES)) {
			logger.info('Token expiring soon, initiating auto-refresh', {
				userId: session.user.id,
				expiresAt: session.metadata.expiresAt,
			});
			await this.refreshToken();

			if (!this.currentSession) {
				throw new AuthenticationError(
					AuthErrorCode.REFRESH_FAILED,
					'Session lost after token refresh',
				);
			}

			return this.currentSession.tokens.accessToken;
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

		logger.info('Token refresh initiated', {
			userId: session.user.id,
			expiresAt: session.metadata.expiresAt,
		});

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

			logger.info('Token refresh successful', {
				userId: session.user.id,
				newExpiresAt: updatedSession.metadata.expiresAt,
			});
		} catch (error) {
			// Refresh failed, clear session
			logger.error('Token refresh failed', {
				userId: session.user.id,
				error: error instanceof Error ? error.message : String(error),
			});

			await this.logout();
			throw new AuthenticationError(
				AuthErrorCode.REFRESH_FAILED,
				'Token refresh failed. Please log in again.',
				error instanceof Error ? error : undefined,
			);
		}
	}

	/**
	 * Decode and verify the ID token to extract user profile
	 * Verifies JWT signature using JWKS from OIDC discovery
	 * Validates standard JWT claims (iss, aud, exp, nbf)
	 */
	private async decodeIdToken(tokens: TokenSet): Promise<UserProfile> {
		if (!tokens.idToken) {
			// If no ID token, create minimal profile from tokens
			logger.warn('No ID token provided, using minimal profile');
			return {
				id: 'unknown',
				email: 'unknown@uxlint.org',
				name: 'UXLint User',
				emailVerified: false,
			};
		}

		try {
			// Fetch OIDC configuration to get JWKS URI
			const oidcConfig = await this.httpClient.getOpenIDConfiguration(
				this.config.baseUrl,
			);

			// Create remote JWKS set for signature verification
			const jwks = createRemoteJWKSet(new URL(oidcConfig.jwksUri));

			// Verify JWT signature and validate claims
			const {payload} = await jwtVerify(tokens.idToken, jwks, {
				issuer: oidcConfig.issuer,
				audience: this.config.clientId,
			});

			const jwtPayload = payload as JoseJWTPayload & JWTPayload;

			// Validate required claims
			if (!jwtPayload.sub) {
				throw new AuthenticationError(
					AuthErrorCode.INVALID_RESPONSE,
					'Missing required "sub" claim in ID token',
				);
			}

			// Validate expiration (jwtVerify already checks exp, but we log it)
			if (jwtPayload.exp) {
				const expDate = new Date(jwtPayload.exp * 1000);
				if (expDate <= new Date()) {
					throw new AuthenticationError(
						AuthErrorCode.INVALID_RESPONSE,
						'ID token has expired',
					);
				}
			}

			// Validate not-before (nbf)
			if (jwtPayload.nbf) {
				const nbfDate = new Date(jwtPayload.nbf * 1000);
				if (nbfDate > new Date()) {
					throw new AuthenticationError(
						AuthErrorCode.INVALID_RESPONSE,
						'ID token is not yet valid (nbf claim)',
					);
				}
			}

			logger.info('ID token verified successfully', {
				sub: jwtPayload.sub,
				email: jwtPayload.email,
				iss: jwtPayload.iss,
			});

			return {
				id: jwtPayload.sub,
				email: jwtPayload.email ?? 'unknown@uxlint.org',
				name: jwtPayload.name ?? 'UXLint User',
				organization: jwtPayload.org,
				picture: jwtPayload.picture,
				emailVerified: jwtPayload.email_verified ?? false,
			};
		} catch (error) {
			// If verification fails, throw authentication error
			if (error instanceof AuthenticationError) {
				throw error;
			}

			logger.error('Failed to verify ID token', {
				error: error instanceof Error ? error.message : String(error),
			});

			throw new AuthenticationError(
				AuthErrorCode.INVALID_RESPONSE,
				'Failed to verify ID token',
				error instanceof Error ? error : undefined,
			);
		}
	}
}

/**
 * Get the singleton UXLintClient instance
 */
export function getUXLintClient(): UXLintClient {
	return UXLintClient.getInstance();
}
