/**
 * UXLintClient Public API Contract
 *
 * This file defines the public TypeScript interfaces for the UXLintClient singleton
 * and its dependencies. These interfaces serve as a contract between the authentication
 * infrastructure and the rest of the uxlint codebase.
 *
 * @packageDocumentation
 */

import type {
  AuthenticationSession,
  AuthenticationError,
  AuthErrorCode,
  UserProfile,
} from '../data-model.md'; // Reference only - actual types defined in source/models/

/**
 * Main authentication client interface
 *
 * Singleton class responsible for managing OAuth 2.0 PKCE authentication
 * with UXLint Cloud. Provides login, logout, status, and token management.
 */
export interface IUXLintClient {
  /**
   * Initiates OAuth 2.0 PKCE login flow
   *
   * 1. Generates PKCE parameters
   * 2. Opens browser to authorization URL
   * 3. Starts local callback server
   * 4. Waits for authorization code
   * 5. Exchanges code for tokens
   * 6. Stores session in keychain
   *
   * @throws {AuthenticationError} If login fails (user denied, network error, etc.)
   * @returns Promise that resolves when authentication is complete
   */
  login(): Promise<void>;

  /**
   * Logs out current user
   *
   * 1. Clears session from keychain
   * 2. Clears in-memory session
   * 3. (Future: revoke tokens with server)
   *
   * @throws {AuthenticationError} If keychain access fails
   * @returns Promise that resolves when logout is complete
   */
  logout(): Promise<void>;

  /**
   * Gets current authentication status
   *
   * @returns Current session if authenticated and valid, null otherwise
   */
  getStatus(): Promise<AuthenticationSession | null>;

  /**
   * Checks if user is currently authenticated with valid token
   *
   * @returns true if authenticated with non-expired token
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * Gets current user profile
   *
   * @throws {AuthenticationError} If not authenticated
   * @returns User profile information
   */
  getUserProfile(): Promise<UserProfile>;

  /**
   * Gets valid access token, refreshing if necessary
   *
   * Automatically refreshes token if expired or expiring within 5 minutes.
   * Use this method before making API calls to ensure valid token.
   *
   * @throws {AuthenticationError} If not authenticated or refresh fails
   * @returns Valid access token string
   */
  getAccessToken(): Promise<string>;

  /**
   * Manually refreshes access token using refresh token
   *
   * Normally called automatically by getAccessToken(), but can be called
   * manually if needed.
   *
   * @throws {AuthenticationError} If refresh fails (invalid refresh token)
   * @returns Promise that resolves when refresh is complete
   */
  refreshToken(): Promise<void>;
}

/**
 * Keychain service interface for secure credential storage
 *
 * Abstracts OS-native keychain access (macOS Keychain, Windows Credential Vault,
 * Linux Secret Service). Implementations must ensure credentials are encrypted
 * and never stored in plain text.
 */
export interface IKeychainService {
  /**
   * Retrieves password from keychain
   *
   * @param service - Service name (e.g., 'uxlint-cli')
   * @param account - Account name (e.g., 'default' or user email)
   * @returns Password string if found, null if not found
   * @throws {Error} If keychain access fails (permission denied, etc.)
   */
  getPassword(service: string, account: string): Promise<string | null>;

  /**
   * Stores password in keychain
   *
   * @param service - Service name
   * @param account - Account name
   * @param password - Password to store (token JSON in our case)
   * @throws {Error} If keychain access fails or storage fails
   */
  setPassword(service: string, account: string, password: string): Promise<void>;

  /**
   * Deletes password from keychain
   *
   * @param service - Service name
   * @param account - Account name
   * @returns true if password was deleted, false if not found
   * @throws {Error} If keychain access fails
   */
  deletePassword(service: string, account: string): Promise<boolean>;

  /**
   * Checks if keychain is available on this system
   *
   * @returns true if keychain is available and accessible
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Browser service interface for launching default browser
 *
 * Abstracts browser launching to enable testing without opening real browsers.
 * Implementations should handle cross-platform differences (macOS, Windows, Linux).
 */
export interface IBrowserService {
  /**
   * Opens URL in user's default browser
   *
   * @param url - URL to open (OAuth authorization URL)
   * @returns Promise that resolves when browser is launched
   * @throws {Error} If browser launch fails
   */
  openUrl(url: string): Promise<void>;

  /**
   * Checks if browser launch is available
   *
   * @returns true if browser can be launched
   */
  isAvailable(): Promise<boolean>;
}

/**
 * OAuth flow orchestration interface
 *
 * Handles the complete OAuth 2.0 PKCE authorization code flow, from
 * generating PKCE parameters to exchanging authorization code for tokens.
 */
export interface IOAuthFlow {
  /**
   * Executes complete OAuth authorization flow
   *
   * 1. Generates PKCE parameters (code verifier, challenge, state)
   * 2. Constructs authorization URL with parameters
   * 3. Opens browser to authorization URL
   * 4. Starts local callback server
   * 5. Waits for authorization code callback
   * 6. Verifies state parameter (CSRF protection)
   * 7. Exchanges code for tokens
   * 8. Returns complete token set
   *
   * @param options - Flow options (client ID, redirect URI, scopes)
   * @returns Token set containing access token, refresh token, ID token
   * @throws {AuthenticationError} If any step fails
   */
  authorize(options: OAuthFlowOptions): Promise<OAuthTokens>;

  /**
   * Exchanges refresh token for new access token
   *
   * @param refreshToken - Refresh token from previous authorization
   * @param clientId - OAuth client ID
   * @returns New token set (may include rotated refresh token)
   * @throws {AuthenticationError} If refresh fails
   */
  refresh(refreshToken: string, clientId: string): Promise<OAuthTokens>;
}

/**
 * OAuth flow configuration options
 */
export interface OAuthFlowOptions {
  /** OAuth client ID */
  clientId: string;

  /** Base URL for OAuth server */
  baseUrl: string;

  /** Redirect URI for callback (localhost) */
  redirectUri: string;

  /** OAuth scopes to request */
  scopes: string[];

  /** Timeout for authorization flow (default: 5 minutes) */
  timeoutMs?: number;

  /** Port range for callback server (default: 8000-9000) */
  callbackPortRange?: [number, number];
}

/**
 * OAuth token set
 *
 * Returned from authorization and refresh flows.
 * Matches OAuth 2.0 token response format.
 */
export interface OAuthTokens {
  /** Access token for API authorization */
  accessToken: string;

  /** Token type (always "Bearer") */
  tokenType: 'Bearer';

  /** Access token lifetime in seconds */
  expiresIn: number;

  /** Refresh token for obtaining new access tokens */
  refreshToken: string;

  /** ID token (JWT) containing user claims (OIDC) */
  idToken?: string;

  /** Granted scopes (space-separated) */
  scope: string;
}

/**
 * Local callback server interface
 *
 * Starts HTTP server on localhost to receive OAuth authorization callback.
 * Automatically shuts down after receiving callback or timeout.
 */
export interface ICallbackServer {
  /**
   * Starts server and waits for OAuth callback
   *
   * @param options - Server options (port, timeout, callback path)
   * @returns Authorization code and state from callback
   * @throws {Error} If server fails to start or timeout occurs
   */
  waitForCallback(options: CallbackServerOptions): Promise<CallbackResult>;

  /**
   * Stops the callback server
   */
  stop(): Promise<void>;
}

/**
 * Callback server configuration options
 */
export interface CallbackServerOptions {
  /** Port to bind to (or port range to try) */
  port: number | [number, number];

  /** Callback path (default: '/callback') */
  path?: string;

  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeoutMs?: number;

  /** Expected state parameter for CSRF verification */
  expectedState: string;
}

/**
 * OAuth callback result
 */
export interface CallbackResult {
  /** Authorization code to exchange for tokens */
  code: string;

  /** State parameter from callback (should match request) */
  state: string;

  /** Error code if authorization failed */
  error?: string;

  /** Human-readable error description */
  errorDescription?: string;
}

/**
 * PKCE parameter generator interface
 *
 * Generates cryptographically secure PKCE parameters for OAuth flow.
 */
export interface IPKCEGenerator {
  /**
   * Generates code verifier and code challenge
   *
   * @returns PKCE parameters
   */
  generate(): PKCEParameters;

  /**
   * Generates random state parameter for CSRF protection
   *
   * @returns Random state string
   */
  generateState(): string;
}

/**
 * PKCE parameters
 */
export interface PKCEParameters {
  /** Code verifier (random string, 43-128 characters) */
  codeVerifier: string;

  /** Code challenge (SHA-256 hash of verifier, Base64URL-encoded) */
  codeChallenge: string;

  /** Code challenge method (always 'S256' for SHA-256) */
  codeChallengeMethod: 'S256';

  /** State parameter for CSRF protection */
  state: string;
}

/**
 * HTTP client interface for OAuth API calls
 *
 * Abstracts HTTP calls to enable testing with mocked responses.
 */
export interface IOAuthHttpClient {
  /**
   * Exchanges authorization code for tokens
   *
   * POST /token with authorization_code grant
   *
   * @param params - Token exchange parameters
   * @returns Token response
   */
  exchangeCodeForTokens(params: TokenExchangeParams): Promise<OAuthTokens>;

  /**
   * Refreshes access token using refresh token
   *
   * POST /token with refresh_token grant
   *
   * @param params - Token refresh parameters
   * @returns Token response
   */
  refreshAccessToken(params: TokenRefreshParams): Promise<OAuthTokens>;

  /**
   * Fetches OpenID Connect discovery configuration
   *
   * GET /.well-known/openid-configuration
   *
   * @param baseUrl - OAuth server base URL
   * @returns OIDC configuration
   */
  getOpenIDConfiguration(baseUrl: string): Promise<OIDCConfiguration>;
}

/**
 * Token exchange parameters
 */
export interface TokenExchangeParams {
  /** OAuth server token endpoint URL */
  tokenEndpoint: string;

  /** OAuth client ID */
  clientId: string;

  /** Authorization code from callback */
  code: string;

  /** Redirect URI (must match authorization request) */
  redirectUri: string;

  /** PKCE code verifier */
  codeVerifier: string;
}

/**
 * Token refresh parameters
 */
export interface TokenRefreshParams {
  /** OAuth server token endpoint URL */
  tokenEndpoint: string;

  /** OAuth client ID */
  clientId: string;

  /** Refresh token */
  refreshToken: string;

  /** Optional: requested scopes (must be subset of original) */
  scope?: string;
}

/**
 * OpenID Connect configuration
 *
 * Returned from /.well-known/openid-configuration endpoint.
 * Used for endpoint discovery.
 */
export interface OIDCConfiguration {
  /** OIDC issuer identifier */
  issuer: string;

  /** Authorization endpoint URL */
  authorizationEndpoint: string;

  /** Token endpoint URL */
  tokenEndpoint: string;

  /** UserInfo endpoint URL */
  userinfoEndpoint?: string;

  /** JWKS URI for token verification */
  jwksUri: string;

  /** Supported response types */
  responseTypesSupported: string[];

  /** Supported grant types */
  grantTypesSupported: string[];

  /** Supported scopes */
  scopesSupported: string[];

  /** Supported PKCE methods */
  codeChallengeMethodsSupported: string[];
}

/**
 * Singleton accessor for UXLintClient
 *
 * Use this to get the global UXLintClient instance.
 * The instance is created lazily on first access.
 *
 * @example
 * ```typescript
 * import { getUXLintClient } from './infrastructure/auth/uxlint-client';
 *
 * const client = getUXLintClient();
 * await client.login();
 * const profile = await client.getUserProfile();
 * ```
 */
export function getUXLintClient(): IUXLintClient;

/**
 * Testing utilities
 *
 * Mock implementations for testing. Not exported in production builds.
 */
export interface IMockKeychainService extends IKeychainService {
  /** Storage map for testing */
  storage: Map<string, string>;

  /** Clear all stored data */
  clear(): void;
}

export interface IMockBrowserService extends IBrowserService {
  /** Track opened URLs for testing */
  openedUrls: string[];

  /** Simulate browser launch failure */
  shouldFail: boolean;

  /** Clear opened URLs history */
  clear(): void;
}

/**
 * Factory for creating mock services
 */
export interface IMockFactory {
  createMockKeychain(): IMockKeychainService;
  createMockBrowser(): IMockBrowserService;
}
