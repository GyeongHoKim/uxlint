# Data Model: OAuth 2.0 PKCE Authentication

**Feature**: UXLint Cloud OAuth2.0 PKCE Authentication
**Date**: 2025-12-18
**Status**: Design Complete

## Overview

This document defines the data models (TypeScript interfaces/types) for the OAuth 2.0 PKCE authentication feature. These models represent the core entities used throughout the authentication flow, token management, and user session state.

## Model Hierarchy

```
AuthenticationSession (root entity)
├── UserProfile (identity information)
├── TokenSet (credentials)
│   ├── AccessToken
│   ├── RefreshToken
│   └── IDToken (optional, from OIDC)
└── SessionMetadata (timestamps, state)

PKCEParameters (flow security)
├── CodeVerifier
├── CodeChallenge
└── State

OAuthConfig (server configuration)
└── Endpoints (discovery)
```

## Core Models

### 1. AuthenticationSession

Represents a complete authenticated session with all token and user information.

```typescript
/**
 * Complete authentication session state
 */
export interface AuthenticationSession {
  /** User identity information */
  user: UserProfile;

  /** OAuth tokens */
  tokens: TokenSet;

  /** Session metadata */
  metadata: SessionMetadata;
}

/**
 * Session metadata and timestamps
 */
export interface SessionMetadata {
  /** When the session was created (ISO 8601) */
  createdAt: string;

  /** When the session was last refreshed (ISO 8601) */
  lastRefreshedAt: string;

  /** When the access token expires (ISO 8601) */
  expiresAt: string;

  /** OAuth scopes granted */
  scopes: string[];

  /** Session ID (from server, if provided) */
  sessionId?: string;
}
```

**Usage**:
- Stored in OS keychain as serialized JSON
- Retrieved on CLI startup to check authentication state
- Updated on token refresh

**Validation Rules**:
- `expiresAt` must be future date when stored
- `scopes` must be non-empty array
- `createdAt <= lastRefreshedAt <= expiresAt`

**State Transitions**:
```
null (not authenticated)
  → AuthenticationSession (login)
  → AuthenticationSession (refresh, updates lastRefreshedAt/expiresAt)
  → null (logout)
```

### 2. UserProfile

User identity information returned from OIDC ID token or /userinfo endpoint.

```typescript
/**
 * User identity information
 */
export interface UserProfile {
  /** Unique user identifier */
  id: string;

  /** User's email address */
  email: string;

  /** User's display name */
  name: string;

  /** Organization name (if applicable) */
  organization?: string;

  /** Profile picture URL (optional) */
  picture?: string;

  /** Email verification status */
  emailVerified: boolean;
}
```

**Usage**:
- Displayed in `uxlint auth status` command
- Used for user identification in logs (email only, never full session)
- Source: ID token claims or /userinfo endpoint

**Mapping from OIDC Claims**:
```typescript
{
  id: claims.sub,              // Subject identifier
  email: claims.email,         // Email address
  name: claims.name,           // Full name
  organization: claims.org,    // Custom claim (if provided)
  picture: claims.picture,     // Profile picture URL
  emailVerified: claims.email_verified
}
```

### 3. TokenSet

OAuth 2.0 token response containing access token, refresh token, and optional ID token.

```typescript
/**
 * OAuth 2.0 token set
 */
export interface TokenSet {
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
}
```

**Usage**:
- Received from `/auth/v1/oauth/token` endpoint
- `accessToken` used in `Authorization: Bearer <token>` headers
- `refreshToken` used to obtain new access tokens when expired
- `idToken` decoded to extract UserProfile

**Security Notes**:
- Never log tokens to console or files
- Store only in OS keychain
- Clear from memory after use where possible
- Validate expiry before use

**Refresh Logic**:
```typescript
// Check if token is expired or expires within 5 minutes
const isExpired = Date.now() >= session.metadata.expiresAt.getTime() - 5 * 60 * 1000;
if (isExpired) {
  // Refresh using refreshToken
  const newTokens = await refreshAccessToken(session.tokens.refreshToken);
  // Update session with new tokens
}
```

### 4. PKCEParameters

PKCE (Proof Key for Code Exchange) parameters for securing the OAuth authorization code flow.

```typescript
/**
 * PKCE parameters for OAuth 2.0 authorization
 */
export interface PKCEParameters {
  /** Code verifier (random string, 43-128 characters) */
  codeVerifier: string;

  /** Code challenge (SHA-256 hash of verifier, Base64URL-encoded) */
  codeChallenge: string;

  /** Code challenge method (always "S256" for SHA-256) */
  codeChallengeMethod: 'S256';

  /** State parameter for CSRF protection (random string) */
  state: string;
}
```

**Usage**:
- Generated at start of authorization flow
- `codeChallenge` and `state` sent to `/authorize` endpoint
- `codeVerifier` sent to `/token` endpoint
- `state` verified on callback to prevent CSRF

**Generation Algorithm**:
```typescript
function generatePKCEParameters(): PKCEParameters {
  // Generate random code verifier (43-128 chars, URL-safe)
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));

  // Hash with SHA-256 and Base64URL-encode
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = base64URLEncode(hash);

  // Generate random state for CSRF protection
  const state = base64URLEncode(crypto.randomBytes(32));

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
    state,
  };
}
```

**Security Requirements**:
- `codeVerifier`: Minimum 43 characters, cryptographically random
- `codeChallenge`: SHA-256 hash, never send verifier in authorization request
- `state`: Minimum 16 characters, cryptographically random, verified on callback

**Lifecycle**:
```
Generate → Store in memory → Send challenge to /authorize →
Receive callback → Verify state → Send verifier to /token → Discard
```

### 5. OAuthConfig

Configuration for OAuth 2.0 endpoints and client credentials.

```typescript
/**
 * OAuth 2.0 client configuration
 */
export interface OAuthConfig {
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
}

/**
 * OAuth 2.0 endpoint URLs
 */
export interface OAuthEndpoints {
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
}
```

**Default Configuration**:
```typescript
const defaultConfig: OAuthConfig = {
  clientId: process.env.UXLINT_CLOUD_CLIENT_ID || INJECTED_CLIENT_ID,
  baseUrl: process.env.UXLINT_CLOUD_API_BASE_URL || 'https://app.uxlint.org',
  endpoints: {
    authorization: '/auth/v1/oauth/authorize',
    token: '/auth/v1/oauth/token',
    openidConfiguration: '/auth/v1/oauth/.well-known/openid-configuration',
  },
  redirectUri: 'http://localhost:8080/callback',
  scopes: ['openid', 'profile', 'email', 'uxlint:api'],
};
```

**Environment Overrides**:
- `UXLINT_CLOUD_CLIENT_ID`: Override client ID (for development)
- `UXLINT_CLOUD_API_BASE_URL`: Override base URL (for staging/local testing)

### 6. OAuthCallbackResponse

Authorization code callback response from OAuth server.

```typescript
/**
 * OAuth authorization callback response
 */
export interface OAuthCallbackResponse {
  /** Authorization code to exchange for tokens */
  code: string;

  /** State parameter (must match request state) */
  state: string;

  /** Error code (if authorization failed) */
  error?: string;

  /** Human-readable error description */
  errorDescription?: string;
}
```

**Usage**:
- Parsed from callback URL query parameters
- Validate `state` matches original request
- Check for `error` before proceeding
- Exchange `code` for tokens

**Error Handling**:
```typescript
if (response.error) {
  switch (response.error) {
    case 'access_denied':
      throw new Error('User denied authorization');
    case 'invalid_request':
      throw new Error('Invalid OAuth request');
    case 'server_error':
      throw new Error('Authorization server error');
    default:
      throw new Error(`OAuth error: ${response.error}`);
  }
}

if (response.state !== expectedState) {
  throw new Error('State mismatch - possible CSRF attack');
}
```

### 7. TokenRefreshRequest/Response

Token refresh flow models.

```typescript
/**
 * Token refresh request
 */
export interface TokenRefreshRequest {
  /** Refresh token */
  refreshToken: string;

  /** Client ID */
  clientId: string;

  /** Grant type (always "refresh_token") */
  grantType: 'refresh_token';

  /** Optional: request specific scopes */
  scope?: string;
}

/**
 * Token refresh response (same as TokenSet)
 */
export type TokenRefreshResponse = TokenSet;
```

**Usage**:
- Sent to `/token` endpoint when access token expires
- Response contains new access token (and possibly new refresh token)
- Update stored session with new tokens

**Refresh Token Rotation**:
- Server may return new refresh token in response
- If new refresh token provided, replace old one
- If server implements rotation, old refresh token becomes invalid

## Model Relationships

### Entity Relationship Diagram

```
┌─────────────────────────┐
│  AuthenticationSession  │
│  ─────────────────────  │
│  + user: UserProfile    │───────┐
│  + tokens: TokenSet     │───┐   │
│  + metadata: Metadata   │   │   │
└─────────────────────────┘   │   │
                              │   │
      ┌───────────────────────┘   │
      │                           │
      v                           v
┌─────────────────┐      ┌──────────────┐
│    TokenSet     │      │ UserProfile  │
│  ─────────────  │      │ ───────────  │
│  + accessToken  │      │ + id         │
│  + refreshToken │      │ + email      │
│  + idToken      │      │ + name       │
│  + expiresIn    │      │ + org        │
└─────────────────┘      └──────────────┘

┌──────────────────┐
│ PKCEParameters   │ (transient, not persisted)
│ ──────────────── │
│ + codeVerifier   │
│ + codeChallenge  │
│ + state          │
└──────────────────┘
```

## Storage Strategy

### Keychain Storage

**What to Store**:
- Complete `AuthenticationSession` as JSON string
- Service name: `uxlint-cli`
- Account name: User email or `default`

**Storage Format**:
```json
{
  "user": {
    "id": "user_abc123",
    "email": "developer@example.com",
    "name": "Jane Developer",
    "organization": "Acme Corp",
    "emailVerified": true
  },
  "tokens": {
    "accessToken": "eyJhbGci...",
    "tokenType": "Bearer",
    "expiresIn": 3600,
    "refreshToken": "v1.MR5h...",
    "idToken": "eyJhbGci...",
    "scope": "openid profile email uxlint:api"
  },
  "metadata": {
    "createdAt": "2025-12-18T10:00:00Z",
    "lastRefreshedAt": "2025-12-18T10:00:00Z",
    "expiresAt": "2025-12-18T11:00:00Z",
    "scopes": ["openid", "profile", "email", "uxlint:api"],
    "sessionId": "sess_xyz789"
  }
}
```

**Retrieval**:
```typescript
const sessionJson = await keychain.getPassword('uxlint-cli', 'default');
if (sessionJson) {
  const session = JSON.parse(sessionJson) as AuthenticationSession;
  // Validate expiry, refresh if needed
}
```

**Deletion** (logout):
```typescript
await keychain.deletePassword('uxlint-cli', 'default');
```

### In-Memory Storage (Runtime)

**What to Keep in Memory**:
- Current `AuthenticationSession` (singleton in UXLintClient)
- DO NOT keep PKCE parameters after token exchange (security)

**Memory Management**:
```typescript
export class UXLintClient {
  private currentSession: AuthenticationSession | null = null;

  async loadSession(): Promise<void> {
    const sessionJson = await this.keychain.getPassword('uxlint-cli', 'default');
    if (sessionJson) {
      this.currentSession = JSON.parse(sessionJson);
      // Check expiry, refresh if needed
      await this.ensureValidToken();
    }
  }

  async logout(): Promise<void> {
    await this.keychain.deletePassword('uxlint-cli', 'default');
    this.currentSession = null;
  }
}
```

## Validation Rules

### AuthenticationSession

- ✅ `user.email` must be valid email format
- ✅ `user.id` must be non-empty string
- ✅ `tokens.accessToken` must be non-empty string
- ✅ `tokens.refreshToken` must be non-empty string
- ✅ `tokens.expiresIn` must be positive number
- ✅ `metadata.expiresAt` must be future date (or recently expired for refresh)
- ✅ `metadata.scopes` must be non-empty array
- ✅ `metadata.createdAt <= metadata.lastRefreshedAt <= metadata.expiresAt`

### PKCEParameters

- ✅ `codeVerifier` must be 43-128 characters, URL-safe Base64
- ✅ `codeChallenge` must be Base64URL-encoded SHA-256 hash
- ✅ `codeChallengeMethod` must be 'S256' (never 'plain')
- ✅ `state` must be cryptographically random, minimum 16 characters

### OAuthCallbackResponse

- ✅ `code` must be present if no error
- ✅ `state` must match original request state
- ✅ If `error` present, `code` should not be processed

## Type Guards

```typescript
/**
 * Type guard for valid AuthenticationSession
 */
export function isValidSession(session: unknown): session is AuthenticationSession {
  if (!session || typeof session !== 'object') return false;

  const s = session as Partial<AuthenticationSession>;

  return (
    s.user !== undefined &&
    typeof s.user.id === 'string' &&
    typeof s.user.email === 'string' &&
    s.tokens !== undefined &&
    typeof s.tokens.accessToken === 'string' &&
    typeof s.tokens.refreshToken === 'string' &&
    s.metadata !== undefined &&
    typeof s.metadata.expiresAt === 'string'
  );
}

/**
 * Check if session is expired or expiring soon
 */
export function isSessionExpired(session: AuthenticationSession, bufferMinutes = 5): boolean {
  const expiryTime = new Date(session.metadata.expiresAt).getTime();
  const now = Date.now();
  const buffer = bufferMinutes * 60 * 1000;

  return now >= (expiryTime - buffer);
}
```

## Error Models

```typescript
/**
 * Authentication error types
 */
export enum AuthErrorCode {
  /** No active session found */
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',

  /** Token has expired */
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  /** Refresh token is invalid */
  REFRESH_FAILED = 'REFRESH_FAILED',

  /** Network error during auth flow */
  NETWORK_ERROR = 'NETWORK_ERROR',

  /** User denied authorization */
  USER_DENIED = 'USER_DENIED',

  /** Invalid OAuth response */
  INVALID_RESPONSE = 'INVALID_RESPONSE',

  /** Keychain access denied */
  KEYCHAIN_ERROR = 'KEYCHAIN_ERROR',

  /** Browser launch failed */
  BROWSER_FAILED = 'BROWSER_FAILED',
}

/**
 * Authentication error
 */
export class AuthenticationError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}
```

**Usage**:
```typescript
try {
  await uxlintClient.login();
} catch (error) {
  if (error instanceof AuthenticationError) {
    switch (error.code) {
      case AuthErrorCode.USER_DENIED:
        console.error('Authentication cancelled by user');
        break;
      case AuthErrorCode.NETWORK_ERROR:
        console.error('Network error:', error.message);
        break;
      // ...
    }
  }
}
```

## Model Evolution

### Versioning Strategy

Add `version` field to `AuthenticationSession` for future compatibility:

```typescript
export interface AuthenticationSession {
  /** Schema version for migration */
  version: 1;

  // ... rest of fields
}
```

**Migration Path**:
```typescript
function migrateSession(storedSession: unknown): AuthenticationSession {
  const session = storedSession as Partial<AuthenticationSession>;

  // Legacy sessions without version field
  if (!session.version) {
    return migrateV0ToV1(session);
  }

  return session as AuthenticationSession;
}
```

### Future Extensions

Potential additions (not implemented in this phase):

- **MFA Support**: Add `mfaRequired: boolean` to session
- **Device Trust**: Add `deviceId: string` to metadata
- **Multiple Accounts**: Support multiple stored sessions
- **Session Revocation**: Add `revokedAt?: string` to metadata

---

**Data Model Status**: ✅ Complete
**Ready for Implementation**: Yes
**Constitutional Compliance**: Follows Test-First Development (models defined before code)
