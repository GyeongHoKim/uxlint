import {Buffer} from 'node:buffer';
import {logger} from '../logger.js';
import {
	isSessionExpired,
	type AuthenticationSession,
} from '../../models/auth-session.js';
import {AuthenticationError, AuthErrorCode} from '../../models/auth-error.js';
import type {UserProfile} from '../../models/user-profile.js';
import type {TokenSet} from '../../models/token-set.js';
import {
	defaultOAuthConfig,
	requireOAuthClientId,
	type OAuthConfig,
} from './oauth-config.js';
import {KeytarKeychainService} from './keychain-impl.js';
import {OpenBrowserService} from './browser-impl.js';
import {MockBrowserService} from './browser-mock.js';
import {MockKeychainService} from './keychain-mock.js';
import {TokenManager} from './token-manager.js';
import {OAuthHttpClient} from './oauth-http-client.js';
import {CallbackServer} from './callback-server.js';
import {OAuthFlow} from './oauth-flow.js';

const ACCESS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export class UXLintClient {
	/**
	 * Test utility: reset the singleton instance.
	 *
	 * @internal
	 */
	static resetForTests(): void {
		UXLintClient.instance = undefined;
	}

	static getInstance(options?: {
		tokenManager?: TokenManager;
		oauthFlow?: OAuthFlow;
		config?: OAuthConfig;
	}): UXLintClient {
		if (UXLintClient.instance) {
			return UXLintClient.instance;
		}

		const config = options?.config ?? defaultOAuthConfig;
		const tokenManager =
			options?.tokenManager ?? new TokenManager(new KeytarKeychainService());
		const oauthFlow =
			options?.oauthFlow ??
			new OAuthFlow(
				new OAuthHttpClient(),
				new CallbackServer(),
				new OpenBrowserService(),
			);

		UXLintClient.instance = new UXLintClient(tokenManager, oauthFlow, config);
		return UXLintClient.instance;
	}

	private static instance: UXLintClient | undefined;
	private session: AuthenticationSession | undefined;

	private constructor(
		private readonly tokenManager: TokenManager,
		private readonly oauthFlow: OAuthFlow,
		private readonly config: OAuthConfig,
	) {}

	async login(options?: {
		onStatus?: (
			status:
				| 'opening-browser'
				| 'waiting-for-authentication'
				| 'exchanging-tokens',
		) => void;
	}): Promise<void> {
		const clientId = requireOAuthClientId(this.config);

		const {tokens} = await this.oauthFlow.authorize({
			clientId,
			baseUrl: this.config.baseUrl,
			authorizePath: this.config.endpoints.authorizePath,
			tokenPath: this.config.endpoints.tokenPath,
			redirectUri: this.config.redirectUri,
			scopes: this.config.scopes,
			onStatus: options?.onStatus,
		});

		const profile = this.decodeIdToken(tokens.idToken);
		const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

		const session: AuthenticationSession = {
			version: 1,
			user: profile,
			tokens,
			metadata: {
				createdAt: new Date().toISOString(),
				expiresAt: expiresAt.toISOString(),
			},
		};

		await this.tokenManager.saveSession(session);
		this.session = session;
	}

	async logout(): Promise<void> {
		await this.tokenManager.deleteSession();
		this.session = undefined;
	}

	async getStatus(): Promise<AuthenticationSession | undefined> {
		if (this.session !== undefined) {
			return this.session;
		}

		const loaded = await this.tokenManager.loadSession();
		this.session = loaded;
		return loaded;
	}

	async isAuthenticated(): Promise<boolean> {
		const session = await this.getStatus();
		return session !== undefined && !isSessionExpired(session);
	}

	async getUserProfile(): Promise<UserProfile> {
		const session = await this.getStatus();
		if (!session) {
			throw new AuthenticationError(
				AuthErrorCode.NOT_AUTHENTICATED,
				'Not logged in',
			);
		}

		return session.user;
	}

	async getAccessToken(): Promise<string> {
		const session = await this.getStatus();
		if (!session) {
			throw new AuthenticationError(
				AuthErrorCode.NOT_AUTHENTICATED,
				'Not logged in',
			);
		}

		if (isSessionExpired(session, ACCESS_TOKEN_REFRESH_BUFFER_MS)) {
			await this.refreshToken();
			const refreshed = await this.getStatus();
			if (!refreshed) {
				throw new AuthenticationError(
					AuthErrorCode.NOT_AUTHENTICATED,
					'Not logged in',
				);
			}

			return refreshed.tokens.accessToken;
		}

		return session.tokens.accessToken;
	}

	async refreshToken(): Promise<void> {
		const session = await this.getStatus();
		if (!session) {
			throw new AuthenticationError(
				AuthErrorCode.NOT_AUTHENTICATED,
				'Not logged in',
			);
		}

		const clientId = requireOAuthClientId(this.config);
		try {
			const refreshedTokens = await this.oauthFlow.refresh({
				clientId,
				baseUrl: this.config.baseUrl,
				tokenPath: this.config.endpoints.tokenPath,
				refreshToken: session.tokens.refreshToken,
				scope: session.tokens.scope,
			});

			const mergedTokens: TokenSet = {
				...session.tokens,
				...refreshedTokens,
				refreshToken:
					refreshedTokens.refreshToken ?? session.tokens.refreshToken,
			};

			const expiresAt = new Date(Date.now() + mergedTokens.expiresIn * 1000);
			const updated: AuthenticationSession = {
				...session,
				tokens: mergedTokens,
				metadata: {
					...session.metadata,
					expiresAt: expiresAt.toISOString(),
				},
			};

			await this.tokenManager.saveSession(updated);
			this.session = updated;
			logger.info('Access token refreshed');
		} catch (error: unknown) {
			throw new AuthenticationError(
				AuthErrorCode.REFRESH_FAILED,
				'Failed to refresh token',
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}

	private decodeIdToken(idToken: string | undefined): UserProfile {
		if (!idToken) {
			return {
				id: 'unknown',
				email: 'unknown',
				name: 'Unknown',
			};
		}

		const parts = idToken.split('.');
		if (parts.length < 2) {
			throw new AuthenticationError(
				AuthErrorCode.INVALID_RESPONSE,
				'Invalid id_token',
			);
		}

		const payload = parts[1];
		if (!payload) {
			throw new AuthenticationError(
				AuthErrorCode.INVALID_RESPONSE,
				'Invalid id_token',
			);
		}

		try {
			const json = Buffer.from(
				this.base64UrlToBase64(payload),
				'base64',
			).toString('utf8');
			const claims = JSON.parse(json) as Record<string, unknown>;

			const sub = typeof claims['sub'] === 'string' ? claims['sub'] : 'unknown';
			const email =
				typeof claims['email'] === 'string' ? claims['email'] : 'unknown';
			let name = 'Unknown';
			if (typeof claims['name'] === 'string') {
				name = claims['name'];
			} else if (typeof claims['preferred_username'] === 'string') {
				name = claims['preferred_username'];
			}

			let organization: string | undefined;
			if (typeof claims['organization'] === 'string') {
				organization = claims['organization'];
			} else if (typeof claims['org'] === 'string') {
				organization = claims['org'];
			}

			const picture =
				typeof claims['picture'] === 'string' ? claims['picture'] : undefined;
			const emailVerified =
				typeof claims['email_verified'] === 'boolean'
					? claims['email_verified']
					: undefined;

			return {
				id: sub,
				email,
				name,
				organization,
				picture,
				emailVerified,
			};
		} catch (error: unknown) {
			throw new AuthenticationError(
				AuthErrorCode.INVALID_RESPONSE,
				'Failed to decode id_token',
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}

	private base64UrlToBase64(base64Url: string): string {
		const base64 = base64Url.replaceAll('-', '+').replaceAll('_', '/');
		const padding =
			base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
		return `${base64}${padding}`;
	}
}

export function getUXLintClient(): UXLintClient {
	return UXLintClient.getInstance();
}

export const mockFactory = {
	createMockKeychain() {
		return new MockKeychainService();
	},
	createMockBrowser() {
		return new MockBrowserService();
	},
};
