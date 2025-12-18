# Quickstart: OAuth 2.0 PKCE Authentication Implementation

**Feature**: UXLint Cloud OAuth2.0 PKCE Authentication
**Date**: 2025-12-18
**Status**: Ready for Implementation

## Prerequisites

Before starting implementation, ensure you have:

1. ✅ Read `research.md` - Understand technology choices and rationale
2. ✅ Read `data-model.md` - Understand data structures and relationships
3. ✅ Read `contracts/oauth-endpoints.yaml` - Understand API contracts
4. ✅ Read `contracts/uxlint-client-interface.ts` - Understand TypeScript interfaces

## Implementation Order

Follow this order to maintain dependencies and enable incremental testing:

### Phase 1: Foundation (Models & Utilities)
### Phase 2: Services (Infrastructure)
### Phase 3: UI Components (Terminal)
### Phase 4: CLI Integration (Commands)
### Phase 5: Testing & Documentation

---

## Phase 1: Foundation (Models & Utilities)

### 1.1 Install Dependencies

```bash
npm install keytar open oauth-callback @inkjs/ui
npm install --save-dev @types/keytar msw
```

**Dependency Versions** (use latest compatible):
- `keytar`: ^7.9.0 or latest
- `open`: ^10.0.0 or latest
- `oauth-callback`: ^1.0.0 or latest
- `@inkjs/ui`: ^2.0.0 or latest
- `msw`: ^2.0.0 or latest (already in project)

### 1.2 Create Data Models

**File**: `source/models/auth-session.ts`

```typescript
export interface AuthenticationSession {
  version: 1;
  user: UserProfile;
  tokens: TokenSet;
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  createdAt: string;
  lastRefreshedAt: string;
  expiresAt: string;
  scopes: string[];
  sessionId?: string;
}

// Export validation functions
export function isValidSession(session: unknown): session is AuthenticationSession;
export function isSessionExpired(session: AuthenticationSession, bufferMinutes?: number): boolean;
```

**File**: `source/models/user-profile.ts`

```typescript
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  organization?: string;
  picture?: string;
  emailVerified: boolean;
}
```

**File**: `source/models/token-set.ts`

```typescript
export interface TokenSet {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  idToken?: string;
  scope: string;
}
```

**File**: `source/models/pkce-params.ts`

```typescript
export interface PKCEParameters {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  state: string;
}
```

**File**: `source/models/auth-error.ts`

```typescript
export enum AuthErrorCode {
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  REFRESH_FAILED = 'REFRESH_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  USER_DENIED = 'USER_DENIED',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  KEYCHAIN_ERROR = 'KEYCHAIN_ERROR',
  BROWSER_FAILED = 'BROWSER_FAILED',
}

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

### 1.3 Create Utility Functions

**File**: `source/infrastructure/auth/pkce-generator.ts`

```typescript
import crypto from 'node:crypto';

export function generatePKCEParameters(): PKCEParameters {
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = base64URLEncode(hash);
  const state = base64URLEncode(crypto.randomBytes(32));

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
    state,
  };
}

function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

**Testing Priority**: HIGH - Unit test PKCE generation (verify SHA-256, Base64URL)

---

## Phase 2: Services (Infrastructure)

### 2.1 Keychain Service

**File**: `source/infrastructure/auth/keychain-service.ts` (interface)

```typescript
export interface IKeychainService {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  isAvailable(): Promise<boolean>;
}
```

**File**: `source/infrastructure/auth/keychain-impl.ts` (production)

```typescript
import * as keytar from 'keytar';
import type { IKeychainService } from './keychain-service.js';

export class KeytarKeychainService implements IKeychainService {
  async getPassword(service: string, account: string): Promise<string | null> {
    try {
      return await keytar.getPassword(service, account);
    } catch (error) {
      throw new AuthenticationError(
        AuthErrorCode.KEYCHAIN_ERROR,
        'Failed to access keychain',
        error as Error
      );
    }
  }

  // Implement setPassword, deletePassword, isAvailable...
}
```

**File**: `source/infrastructure/auth/keychain-mock.ts` (testing)

```typescript
export class MockKeychainService implements IKeychainService {
  private storage = new Map<string, string>();

  async getPassword(service: string, account: string): Promise<string | null> {
    return this.storage.get(`${service}:${account}`) ?? null;
  }

  // Implement other methods...
}
```

**Testing Priority**: HIGH - Unit test with mock, verify JSON serialization

### 2.2 Browser Service

**File**: `source/infrastructure/auth/browser-service.ts` (interface)

```typescript
export interface IBrowserService {
  openUrl(url: string): Promise<void>;
  isAvailable(): Promise<boolean>;
}
```

**File**: `source/infrastructure/auth/browser-impl.ts` (production)

```typescript
import open from 'open';

export class OpenBrowserService implements IBrowserService {
  async openUrl(url: string): Promise<void> {
    try {
      await open(url);
    } catch (error) {
      throw new AuthenticationError(
        AuthErrorCode.BROWSER_FAILED,
        'Failed to open browser',
        error as Error
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    return true; // open handles platform detection
  }
}
```

**File**: `source/infrastructure/auth/browser-mock.ts` (testing)

```typescript
export class MockBrowserService implements IBrowserService {
  public openedUrls: string[] = [];
  public shouldFail = false;

  async openUrl(url: string): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Mock browser failure');
    }
    this.openedUrls.push(url);
  }

  async isAvailable(): Promise<boolean> {
    return !this.shouldFail;
  }
}
```

**Testing Priority**: MEDIUM - Unit test with mock

### 2.3 OAuth HTTP Client

**File**: `source/infrastructure/auth/oauth-http-client.ts`

```typescript
export class OAuthHttpClient {
  async exchangeCodeForTokens(params: TokenExchangeParams): Promise<TokenSet> {
    const response = await fetch(params.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.code,
        redirect_uri: params.redirectUri,
        client_id: params.clientId,
        code_verifier: params.codeVerifier,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new AuthenticationError(
        AuthErrorCode.INVALID_RESPONSE,
        error.error_description || 'Token exchange failed'
      );
    }

    return await response.json();
  }

  // Implement refreshAccessToken, getOpenIDConfiguration...
}
```

**Testing Priority**: HIGH - Use MSW to mock HTTP responses

### 2.4 Callback Server

**File**: `source/infrastructure/auth/callback-server.ts`

```typescript
import { oauthCallback } from 'oauth-callback';

export class CallbackServer {
  async waitForCallback(options: CallbackServerOptions): Promise<CallbackResult> {
    try {
      const result = await oauthCallback({
        authorizationUrl: '', // Not needed, server just waits
        callbackPort: Array.isArray(options.port) ? options.port[0] : options.port,
        callbackPath: options.path || '/callback',
        timeout: options.timeoutMs || 300000,
      });

      // Verify state
      if (result.state !== options.expectedState) {
        throw new AuthenticationError(
          AuthErrorCode.INVALID_RESPONSE,
          'State mismatch - possible CSRF attack'
        );
      }

      return {
        code: result.code,
        state: result.state,
      };
    } catch (error) {
      throw new AuthenticationError(
        AuthErrorCode.NETWORK_ERROR,
        'OAuth callback failed',
        error as Error
      );
    }
  }

  async stop(): Promise<void> {
    // oauth-callback handles cleanup automatically
  }
}
```

**Testing Priority**: MEDIUM - Mock oauth-callback library

### 2.5 OAuth Flow Orchestrator

**File**: `source/infrastructure/auth/oauth-flow.ts`

```typescript
export class OAuthFlow {
  constructor(
    private httpClient: OAuthHttpClient,
    private callbackServer: CallbackServer,
    private browserService: IBrowserService,
  ) {}

  async authorize(options: OAuthFlowOptions): Promise<TokenSet> {
    // 1. Generate PKCE parameters
    const pkce = generatePKCEParameters();

    // 2. Construct authorization URL
    const authUrl = this.buildAuthorizationUrl(options, pkce);

    // 3. Start callback server
    const callbackPromise = this.callbackServer.waitForCallback({
      port: options.callbackPortRange || [8000, 9000],
      expectedState: pkce.state,
      timeoutMs: options.timeoutMs || 300000,
    });

    // 4. Open browser
    try {
      await this.browserService.openUrl(authUrl);
    } catch (error) {
      // Browser failed, but callback server still running
      // User can manually open URL
      throw new AuthenticationError(
        AuthErrorCode.BROWSER_FAILED,
        `Could not open browser. Please open this URL manually: ${authUrl}`,
        error as Error
      );
    }

    // 5. Wait for callback
    const callback = await callbackPromise;

    // 6. Exchange code for tokens
    const tokens = await this.httpClient.exchangeCodeForTokens({
      tokenEndpoint: `${options.baseUrl}/auth/v1/oauth/token`,
      clientId: options.clientId,
      code: callback.code,
      redirectUri: options.redirectUri,
      codeVerifier: pkce.codeVerifier,
    });

    return tokens;
  }

  private buildAuthorizationUrl(options: OAuthFlowOptions, pkce: PKCEParameters): string {
    const params = new URLSearchParams({
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      response_type: 'code',
      scope: options.scopes.join(' '),
      state: pkce.state,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: pkce.codeChallengeMethod,
    });

    return `${options.baseUrl}/auth/v1/oauth/authorize?${params}`;
  }

  async refresh(refreshToken: string, clientId: string, baseUrl: string): Promise<TokenSet> {
    return await this.httpClient.refreshAccessToken({
      tokenEndpoint: `${baseUrl}/auth/v1/oauth/token`,
      clientId,
      refreshToken,
    });
  }
}
```

**Testing Priority**: HIGH - Integration test with mocked HTTP and browser

### 2.6 Token Manager

**File**: `source/infrastructure/auth/token-manager.ts`

```typescript
export class TokenManager {
  constructor(private keychain: IKeychainService) {}

  async loadSession(): Promise<AuthenticationSession | null> {
    const sessionJson = await this.keychain.getPassword('uxlint-cli', 'default');
    if (!sessionJson) return null;

    try {
      const session = JSON.parse(sessionJson) as AuthenticationSession;
      if (!isValidSession(session)) {
        throw new Error('Invalid session format');
      }
      return session;
    } catch (error) {
      // Corrupted session, delete it
      await this.keychain.deletePassword('uxlint-cli', 'default');
      return null;
    }
  }

  async saveSession(session: AuthenticationSession): Promise<void> {
    const sessionJson = JSON.stringify(session);
    await this.keychain.setPassword('uxlint-cli', 'default', sessionJson);
  }

  async deleteSession(): Promise<void> {
    await this.keychain.deletePassword('uxlint-cli', 'default');
  }
}
```

**Testing Priority**: HIGH - Unit test with mock keychain

### 2.7 UXLintClient (Singleton)

**File**: `source/infrastructure/auth/uxlint-client.ts`

```typescript
export class UXLintClient implements IUXLintClient {
  private static instance: UXLintClient;
  private currentSession: AuthenticationSession | null = null;

  private constructor(
    private tokenManager: TokenManager,
    private oauthFlow: OAuthFlow,
    private config: OAuthConfig,
  ) {}

  static getInstance(): UXLintClient {
    if (!UXLintClient.instance) {
      // Create with production dependencies
      const keychain = new KeytarKeychainService();
      const browser = new OpenBrowserService();
      const httpClient = new OAuthHttpClient();
      const callbackServer = new CallbackServer();
      const oauthFlow = new OAuthFlow(httpClient, callbackServer, browser);
      const tokenManager = new TokenManager(keychain);

      UXLintClient.instance = new UXLintClient(
        tokenManager,
        oauthFlow,
        defaultOAuthConfig
      );
    }

    return UXLintClient.instance;
  }

  async login(): Promise<void> {
    // Check if already logged in
    const existing = await this.tokenManager.loadSession();
    if (existing && !isSessionExpired(existing)) {
      throw new AuthenticationError(
        AuthErrorCode.ALREADY_AUTHENTICATED,
        'Already logged in. Use logout first to re-authenticate.'
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
    const userProfile = this.decodeIdToken(tokens.idToken!);

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

  async logout(): Promise<void> {
    await this.tokenManager.deleteSession();
    this.currentSession = null;
  }

  async getStatus(): Promise<AuthenticationSession | null> {
    if (!this.currentSession) {
      this.currentSession = await this.tokenManager.loadSession();
    }
    return this.currentSession;
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getStatus();
    return session !== null && !isSessionExpired(session);
  }

  async getUserProfile(): Promise<UserProfile> {
    const session = await this.getStatus();
    if (!session) {
      throw new AuthenticationError(
        AuthErrorCode.NOT_AUTHENTICATED,
        'Not authenticated'
      );
    }
    return session.user;
  }

  async getAccessToken(): Promise<string> {
    const session = await this.getStatus();
    if (!session) {
      throw new AuthenticationError(
        AuthErrorCode.NOT_AUTHENTICATED,
        'Not authenticated'
      );
    }

    // Refresh if expired or expiring soon
    if (isSessionExpired(session, 5)) {
      await this.refreshToken();
      return this.currentSession!.tokens.accessToken;
    }

    return session.tokens.accessToken;
  }

  async refreshToken(): Promise<void> {
    const session = await this.getStatus();
    if (!session) {
      throw new AuthenticationError(
        AuthErrorCode.NOT_AUTHENTICATED,
        'Not authenticated'
      );
    }

    try {
      const newTokens = await this.oauthFlow.refresh(
        session.tokens.refreshToken,
        this.config.clientId,
        this.config.baseUrl
      );

      // Update session with new tokens
      session.tokens = newTokens;
      session.metadata.lastRefreshedAt = new Date().toISOString();
      session.metadata.expiresAt = new Date(
        Date.now() + newTokens.expiresIn * 1000
      ).toISOString();

      await this.tokenManager.saveSession(session);
      this.currentSession = session;
    } catch (error) {
      // Refresh failed, clear session
      await this.logout();
      throw new AuthenticationError(
        AuthErrorCode.REFRESH_FAILED,
        'Token refresh failed. Please log in again.',
        error as Error
      );
    }
  }

  private decodeIdToken(idToken: string): UserProfile {
    // Decode JWT (base64URL decode payload)
    const parts = idToken.split('.');
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    );

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      organization: payload.org,
      picture: payload.picture,
      emailVerified: payload.email_verified ?? false,
    };
  }
}

// Export singleton accessor
export function getUXLintClient(): UXLintClient {
  return UXLintClient.getInstance();
}
```

**Testing Priority**: CRITICAL - Integration test with all mocked dependencies

---

## Phase 3: UI Components (Terminal)

### 3.1 Login Flow Component

**File**: `source/components/auth/login-flow.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import { Spinner } from '@inkjs/ui';
import { getUXLintClient } from '../../infrastructure/auth/uxlint-client.js';
import { AuthErrorCode } from '../../models/auth-error.js';

export function LoginFlow({ onComplete, onError }: LoginFlowProps) {
  const [status, setStatus] = useState<'opening-browser' | 'waiting' | 'exchanging' | 'success'>('opening-browser');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = getUXLintClient();

    client.login()
      .then(async () => {
        setStatus('success');
        const profile = await client.getUserProfile();
        onComplete(profile);
      })
      .catch((error) => {
        if (error.code === AuthErrorCode.BROWSER_FAILED) {
          setError(error.message); // Contains manual URL
        } else {
          setError(error.message);
          onError(error);
        }
      });
  }, []);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">⚠ {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {status === 'opening-browser' && (
        <Box>
          <Text><Spinner /> Opening browser...</Text>
        </Box>
      )}
      {status === 'waiting' && (
        <Box>
          <Text><Spinner /> Waiting for authentication in browser...</Text>
        </Box>
      )}
      {status === 'exchanging' && (
        <Box>
          <Text><Spinner /> Completing authentication...</Text>
        </Box>
      )}
      {status === 'success' && (
        <Box>
          <Text color="green">✓ Authentication successful!</Text>
        </Box>
      )}
    </Box>
  );
}
```

**Testing Priority**: MEDIUM - Visual regression test with ink-testing-library

### 3.2 Auth Status Component

**File**: `source/components/auth/auth-status.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import { Badge, Alert } from '@inkjs/ui';
import { getUXLintClient } from '../../infrastructure/auth/uxlint-client.js';
import type { AuthenticationSession } from '../../models/auth-session.js';

export function AuthStatus() {
  const [session, setSession] = useState<AuthenticationSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = getUXLintClient();
    client.getStatus()
      .then(setSession)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Text>Loading...</Text>;
  }

  if (!session) {
    return (
      <Box flexDirection="column">
        <Alert variant="info">Not logged in</Alert>
        <Text>Run <Text bold>uxlint auth login</Text> to authenticate.</Text>
      </Box>
    );
  }

  const isExpired = new Date(session.metadata.expiresAt) < new Date();

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Badge variant={isExpired ? "error" : "success"}>
          {isExpired ? "Expired" : "Authenticated"}
        </Badge>
      </Box>
      <Box marginTop={1}>
        <Text bold>{session.user.name}</Text>
        <Text dimColor> ({session.user.email})</Text>
      </Box>
      {session.user.organization && (
        <Text>Organization: {session.user.organization}</Text>
      )}
      <Box marginTop={1}>
        <Text dimColor>Expires: {new Date(session.metadata.expiresAt).toLocaleString()}</Text>
      </Box>
    </Box>
  );
}
```

**Testing Priority**: MEDIUM - Visual regression test

---

## Phase 4: CLI Integration (Commands)

### 4.1 Update CLI Commands

**File**: `source/cli.tsx` (update)

```tsx
// Add auth command handler
if (cli.input[0] === 'auth') {
  const subcommand = cli.input[1];

  if (subcommand === 'login') {
    render(<LoginFlow onComplete={() => process.exit(0)} onError={() => process.exit(1)} />);
  } else if (subcommand === 'status') {
    render(<AuthStatus />);
  } else if (subcommand === 'logout') {
    const client = getUXLintClient();
    await client.logout();
    console.log('Logged out successfully');
  } else {
    console.error('Unknown auth command. Use: login, status, or logout');
    process.exit(1);
  }
}
```

### 4.2 Update Help Text

**File**: `source/cli.tsx` (update help)

```typescript
const cli = meow(`
  Usage
    $ uxlint [options]
    $ uxlint auth <command>

  Auth Commands
    login                   Authenticate with UXLint Cloud
    logout                  Log out from UXLint Cloud
    status                  Show current authentication status

  Options
    --interactive, -i       Run in interactive mode (wizard + UI)
    --config, -c <path>     Path to config file (default: .uxlintrc.{json,yml})
    --output, -o <path>     Output path for report (overrides config)
    --version, -v           Show version
    --help, -h              Show this help

  Examples
    $ uxlint                                  # Run analysis (requires .uxlintrc)
    $ uxlint --interactive                    # Run wizard if no config
    $ uxlint auth login                       # Authenticate with UXLint Cloud
    $ uxlint auth status                      # Check authentication status
`);
```

### 4.3 Environment Configuration

**File**: `.env` (update)

```bash
# UXLint Cloud OAuth Configuration
# Client ID (optional override, normally injected at build time)
# UXLINT_CLOUD_CLIENT_ID=uxlint-cli-dev

# API Base URL (optional override for local development)
UXLINT_CLOUD_API_BASE_URL=http://localhost:54321/functions/v1/cli-api
```

---

## Phase 5: Testing & Documentation

### 5.1 Test Priorities

**CRITICAL (Must have 100% coverage)**:
- ✅ PKCE generation (SHA-256, Base64URL encoding)
- ✅ Token manager (load/save/delete session)
- ✅ UXLintClient (singleton, login/logout/refresh flow)

**HIGH (Must have >80% coverage)**:
- ✅ OAuth HTTP client (with MSW mocking)
- ✅ Keychain service (with mock)
- ✅ OAuth flow orchestration

**MEDIUM (Nice to have >60% coverage)**:
- ✅ UI components (visual regression)
- ✅ Browser service (with mock)
- ✅ Callback server (with mock)

### 5.2 Test File Structure

```
tests/infrastructure/auth/
├── pkce-generator.spec.ts
├── token-manager.spec.ts
├── keychain-service.spec.ts
├── oauth-http-client.spec.ts
├── oauth-flow.spec.ts
└── uxlint-client.spec.ts

tests/components/auth/
├── login-flow.spec.tsx
└── auth-status.spec.tsx
```

### 5.3 MSW Setup

**File**: `tests/mocks/oauth-server.ts`

```typescript
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const mockTokenResponse = {
  access_token: 'mock_access_token',
  token_type: 'Bearer',
  expires_in: 3600,
  refresh_token: 'mock_refresh_token',
  id_token: 'eyJhbGci...', // Mock JWT
  scope: 'openid profile email uxlint:api',
};

export const handlers = [
  http.post('http://localhost:54321/functions/v1/cli-api/auth/v1/oauth/token', () => {
    return HttpResponse.json(mockTokenResponse);
  }),
];

export const server = setupServer(...handlers);
```

### 5.4 Update Package.json Scripts

```json
{
  "scripts": {
    "test": "npm run prettier && npm run xo && npm run test:coverage",
    "test:coverage": "c8 --reporter=text --reporter=lcov ava",
    "test:watch": "ava --watch",
    "test:auth": "ava tests/infrastructure/auth/**/*.spec.ts"
  }
}
```

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Install dependencies
- [ ] Create data models (auth-session, user-profile, token-set, pkce-params, auth-error)
- [ ] Create PKCE generator utility
- [ ] Write unit tests for models and PKCE
- [ ] Run quality gates: `npm run compile && npm run format && npm run lint`

### Phase 2: Services
- [ ] Implement keychain service (interface + production + mock)
- [ ] Implement browser service (interface + production + mock)
- [ ] Implement OAuth HTTP client
- [ ] Implement callback server
- [ ] Implement OAuth flow orchestrator
- [ ] Implement token manager
- [ ] Implement UXLintClient singleton
- [ ] Write unit tests with MSW for HTTP calls
- [ ] Run quality gates

### Phase 3: UI Components
- [ ] Create LoginFlow component
- [ ] Create AuthStatus component
- [ ] Create error/fallback components
- [ ] Write visual regression tests
- [ ] Run quality gates

### Phase 4: CLI Integration
- [ ] Update cli.tsx with auth commands
- [ ] Update help text
- [ ] Update .env configuration
- [ ] Test CLI commands manually
- [ ] Run quality gates

### Phase 5: Testing & Documentation
- [ ] Ensure 80%+ test coverage
- [ ] Write integration tests
- [ ] Update README.md with auth commands
- [ ] Update CLAUDE.md if needed
- [ ] Run full test suite: `npm test`
- [ ] Manual testing: login, status, logout flows
- [ ] Test browser fallback scenario
- [ ] Test token refresh flow

---

## Common Issues & Solutions

### Issue: Keytar not available

**Symptom**: `Cannot find module 'keytar'`

**Solution**:
```bash
npm rebuild keytar
# Or reinstall
npm uninstall keytar && npm install keytar
```

### Issue: Browser doesn't open

**Symptom**: `AuthenticationError: BROWSER_FAILED`

**Solution**: Fallback to manual URL display (already handled in LoginFlow component)

### Issue: Port already in use

**Symptom**: Callback server fails to start

**Solution**: oauth-callback library tries multiple ports automatically (8000-9000 range)

### Issue: Token refresh fails

**Symptom**: `AuthenticationError: REFRESH_FAILED`

**Solution**: Force re-login (current session is cleared automatically)

### Issue: Tests fail with "Cannot read property 'getPassword' of undefined"

**Symptom**: Keychain mock not injected

**Solution**: Use dependency injection, create client with mock services in tests:

```typescript
const client = new UXLintClient(
  new MockTokenManager(new MockKeychainService()),
  new MockOAuthFlow(),
  mockConfig
);
```

---

## Performance Targets

Monitor these metrics during implementation:

- ✅ Login flow: <60 seconds (network-dependent)
- ✅ Status check: <2 seconds
- ✅ Token refresh: <5 seconds
- ✅ Keychain access: <500ms per operation
- ✅ Browser launch: <2 seconds

---

## Next Steps

After completing implementation:

1. Run `/speckit.tasks` to generate dependency-ordered tasks.md
2. Execute tasks in order, marking complete as you go
3. Update this quickstart with lessons learned
4. Celebrate! 🎉

---

**Quickstart Status**: ✅ Ready for Implementation
**Estimated Effort**: 2-3 days for experienced TypeScript developer
**Blockers**: None (all research complete, contracts defined)
