import type {TokenSet} from '../../../source/models/token-set.js';

/**
 * Mock OAuthHttpClient for testing OAuth flows.
 * Tracks method calls and allows customizing responses.
 */
export class MockOAuthHttpClient {
	public exchangeCodeCalled = false;
	public refreshCalled = false;
	public lastExchangeParameters: unknown = undefined;
	public lastRefreshParameters: unknown = undefined;
	public shouldFailExchange = false;
	public shouldFailRefresh = false;
	public exchangeError?: Error;
	public refreshError?: Error;

	public mockTokenResponse: TokenSet = {
		accessToken: 'mock_access_token',
		tokenType: 'Bearer',
		expiresIn: 3600,
		refreshToken: 'mock_refresh_token',
		idToken: 'mock_id_token',
		scope: 'openid profile email',
	};

	async exchangeCodeForTokens(parameters: unknown): Promise<TokenSet> {
		this.exchangeCodeCalled = true;
		this.lastExchangeParameters = parameters;

		if (this.shouldFailExchange) {
			throw this.exchangeError ?? new Error('Mock exchange failure');
		}

		return this.mockTokenResponse;
	}

	async refreshAccessToken(parameters: unknown): Promise<TokenSet> {
		this.refreshCalled = true;
		this.lastRefreshParameters = parameters;

		if (this.shouldFailRefresh) {
			throw this.refreshError ?? new Error('Mock refresh failure');
		}

		return this.mockTokenResponse;
	}

	/**
	 * Reset mock state for test cleanup.
	 */
	clear(): void {
		this.exchangeCodeCalled = false;
		this.refreshCalled = false;
		this.lastExchangeParameters = undefined;
		this.lastRefreshParameters = undefined;
		this.shouldFailExchange = false;
		this.shouldFailRefresh = false;
		this.exchangeError = undefined;
		this.refreshError = undefined;
	}
}
