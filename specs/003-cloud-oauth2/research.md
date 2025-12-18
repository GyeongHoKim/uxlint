# Research: OAuth 2.0 PKCE Authentication for UXLint CLI

**Feature**: UXLint Cloud OAuth2.0 PKCE Authentication
**Date**: 2025-12-18
**Status**: Complete

## Research Overview

This document consolidates research findings for implementing OAuth 2.0 OIDC + PKCE authentication flow in the UXLint CLI. The research covers standards, library selection, and implementation patterns.

## 1. OAuth 2.0 PKCE Standards & Best Practices

### Decision: Use Authorization Code Flow with PKCE

**Standard**: [RFC 7636 - Proof Key for Code Exchange](https://datatracker.ietf.org/doc/html/rfc7636)

**Rationale**:
- OAuth 2.1 (finalized 2024-2025) makes PKCE **REQUIRED** for all flows
- Implicit flow deprecated - PKCE with Authorization Code is the new standard
- [RFC 9126 (OAuth 2.0 Security Best Current Practice)](https://www.rfc-editor.org/rfc/rfc9126.html) recommends PKCE for all client types, including confidential clients
- Protects against authorization code interception attacks for public clients (CLI applications)

**2025 Implementation Best Practices**:
- Always use S256 method for code challenge (SHA-256 hashing)
- Never use plain/unhashed challenge
- Code verifier must be cryptographically random (43-128 characters, URL-safe)
- State parameter should be used to prevent CSRF attacks
- PKCE is now baseline standard for any new secure application development

### PKCE Flow Steps

1. **Generate PKCE Parameters**:
   - Create cryptographically secure `code_verifier` (random string, 43-128 chars)
   - Hash verifier with SHA-256 to create `code_challenge`
   - Base64URL-encode the challenge

2. **Authorization Request** (`/authorize` endpoint):
   - Include `code_challenge` parameter
   - Include `code_challenge_method=S256`
   - Include `state` for CSRF protection
   - Include `redirect_uri` (localhost callback)

3. **Token Exchange** (`/token` endpoint):
   - Exchange authorization code for tokens
   - Provide original unhashed `code_verifier`
   - Server verifies by hashing verifier and comparing to stored challenge

### OpenID Connect (OIDC) Layer

**Decision**: Use OIDC on top of OAuth 2.0 for user identity

**Rationale**:
- OAuth 2.0 handles authorization (API access)
- OIDC adds identity layer (user information)
- Returns `id_token` (JWT) with user claims
- Standard endpoints: `/.well-known/openid-configuration` for discovery

**OIDC Token Handling**:
- Access token: Short-lived (assume 1 hour), for API authentication
- Refresh token: Longer-lived (assume 30 days), for automatic renewal
- ID token: Contains user profile (username, email, org)

### Sources
- [What is PKCE and Why Your OAuth Implementation Needs It](https://oneuptime.com/blog/post/2025-12-16-what-is-pkce-and-why-you-need-it/view)
- [OAuth 2.0 vs OpenID Connect (OIDC): Best Practices & Security in 2025](https://medium.com/@QuarkAndCode/oauth-2-0-vs-openid-connect-oidc-best-practices-security-in-2025-0c82f071a9a9)
- [PKCE for OAuth 2.0 - oauth.net](https://oauth.net/2/pkce/)
- [Authorization Code Flow with PKCE - Auth0](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce)

## 2. CLI Authentication Patterns

### Decision: Authorization Code Flow with Localhost Callback

**Pattern**: Browser-based OAuth with local callback server

**Why Not Device Authorization Flow?**:
- Device Authorization is for input-constrained devices (smart TVs, printers)
- CLIs on developer machines have browsers and can bind to localhost
- Authorization Code + PKCE is simpler and more direct for desktop CLIs
- Better UX: immediate browser redirect vs. entering device codes

**Implementation Pattern**:
1. CLI starts local HTTP server on `http://localhost:PORT/callback`
2. CLI opens default browser to authorization URL with PKCE parameters
3. User authenticates in browser
4. Authorization server redirects to localhost callback with authorization code
5. Local server captures code and shuts down
6. CLI exchanges code for tokens

**Fallback Strategy** (for restricted environments):
- Display authorization URL in terminal if browser launch fails
- User manually opens URL
- CLI still listens on localhost for callback
- Provide clear instructions and handle manual auth flow

### Security Considerations

**Client Secret Management**:
- CLI is a public client - NEVER include client secret
- PKCE replaces client secret for public clients
- Client ID can be embedded (public information)

**Token Security**:
- Store tokens in OS-native secure storage (never plain text)
- Never log or display tokens
- Implement refresh token rotation
- Local callback server binds to localhost only (not 0.0.0.0)

**CSRF Protection**:
- Use `state` parameter in authorization request
- Verify state matches when receiving callback
- State should be cryptographically random

### Sources
- [OAuth 2.0 from the Command Line - Okta](https://developer.okta.com/blog/2018/07/16/oauth-2-command-line)
- [Implementing OAuth 2.0 PKCE Flow for CLI/Desktop Apps](https://kevcodez.de/posts/2020-06-07-pkce-oauth2-auth-flow-cli-desktop-app/)
- [Secure a CLI with Auth0](https://auth0.com/docs/customize/integrations/secure-a-cli-with-auth0)

## 3. Keychain / Credential Storage

### Decision: Use `keytar` library

**Library**: [`keytar`](https://github.com/atom/node-keytar) - Native Password Node Module

**Rationale**:
- Industry-standard solution used by VS Code, Theia, Azure Data Studio
- Cross-platform support with native OS credential managers:
  - **macOS**: Keychain Access
  - **Windows**: Credential Vault
  - **Linux**: Secret Service API / libsecret
- Native Node module with TypeScript definitions
- Proven in production by major applications

**API Design**:
```typescript
interface KeychainService {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}
```

**Implementation Notes**:
- Use service name: `uxlint-cli`
- Use account name: `oauth-tokens` or user email
- Store tokens as JSON string (access token, refresh token, expiry)
- Handle keytar availability gracefully (may not be available in all environments)
- Implement fallback to encrypted file if keytar unavailable (with user warning)

**Testing Strategy**:
- Create abstract `KeychainService` interface
- Implement `KeytarKeychainService` (production) and `MockKeychainService` (testing)
- Inject via constructor/setter in UXLintClient class
- Tests use mock implementation without actual keychain access

**Chunking for Large Tokens** (from VS Code pattern):
- Windows Credential Vault has 2500 character limit
- Store large tokens in chunks with `-0`, `-1` suffixes if needed
- Reassemble on retrieval

### Alternatives Considered

- **node-keychain**: macOS-only, not cross-platform (rejected)
- **node-credentials**: Encrypted JSON file, last updated 3 years ago (rejected for security)
- **Plain text file**: Security violation, constitution forbidden (rejected)

### Sources
- [GitHub - atom/node-keytar](https://github.com/atom/node-keytar)
- [VS Code Credentials Service Implementation](https://github.com/microsoft/vscode/blob/main/src/vs/platform/credentials/common/credentialsMainService.ts)
- [Google Gemini CLI Keychain Implementation](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/mcp/token-storage/keychain-token-storage.ts)

## 4. Browser Launch

### Decision: Use `open` package

**Library**: [`open`](https://github.com/sindresorhus/open) by Sindre Sorhus

**Rationale**:
- De facto standard for opening URLs/files cross-platform
- Used by Storybook, Vite, Docusaurus, Ant Design, and hundreds of other projects
- Active maintenance (latest release: 2025)
- Cross-platform support (macOS, Windows, Linux, WSL)
- Native ESM support (matches uxlint's module system)
- TypeScript-friendly with type definitions

**API Design**:
```typescript
interface BrowserService {
  openUrl(url: string): Promise<void>;
}
```

**Implementation Notes**:
- Wrap `open` in BrowserService interface for testability
- Handle failure gracefully (return success boolean)
- Implement fallback: display URL in terminal if launch fails
- Use `await open(url)` - returns ChildProcess

**Testing Strategy**:
- Create abstract `BrowserService` interface
- Implement `OpenBrowserService` (production) and `MockBrowserService` (testing)
- Inject via constructor/setter in UXLintClient class
- Tests use mock that tracks URLs without launching browser

**Fallback Pattern**:
```typescript
try {
  await browserService.openUrl(authUrl);
  showMessage("Browser opened. Complete authentication in browser.");
} catch (error) {
  showMessage("Could not open browser automatically.");
  showMessage(`Please open this URL manually: ${authUrl}`);
}
```

### Alternatives Considered

- **Manual shell commands** (`xdg-open`, `start`, `open`): Not portable, hard to test (rejected)
- **opn**: Deprecated predecessor to `open` (rejected)

### Sources
- [GitHub - sindresorhus/open](https://github.com/sindresorhus/open)
- [npm - open](https://www.npmjs.com/package/open)
- [Vite Browser Opening Implementation](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/openBrowser.ts)

## 5. HTTP Server for OAuth Callback

### Decision: Use `oauth-callback` library

**Library**: [`oauth-callback`](https://www.npmjs.com/package/oauth-callback) - Purpose-built OAuth callback handler

**Rationale**:
- Specifically designed for localhost OAuth callbacks in CLI/desktop apps
- Handles complete flow: starts server, opens browser, captures code, shuts down
- Multi-runtime support (Node.js, Deno, Bun)
- Secure localhost-only binding
- Simple API - less code to write and maintain
- Modern library (2025) with MCP SDK integration

**Alternative**: Build custom server with Node.js `http` module
- **Rejected** because oauth-callback handles edge cases (port conflicts, timeouts, cleanup)
- Custom implementation increases maintenance burden
- Violates "Simplicity & Minimalism" principle (Constitution V)

**API Pattern**:
```typescript
import { oauthCallback } from 'oauth-callback';

const result = await oauthCallback({
  authorizationUrl: 'https://app.uxlint.org/auth/v1/oauth/authorize?...',
  callbackPort: 3000,
  callbackPath: '/callback',
});

// result.code contains authorization code
// result.state contains state for CSRF verification
```

**Implementation Notes**:
- Use random available port (8000-9000 range) with fallback
- Timeout after 5 minutes (user may have abandoned flow)
- Handle errors: port in use, network failure, user cancellation
- Close server immediately after receiving callback

**Error Handling**:
- Port conflict: Try next port in range
- Timeout: Show helpful message, clean up server
- Browser closed early: Detect via timeout, allow retry
- Network failure: Show error, suggest checking firewall

### Alternatives Considered

- **simple-oauth2**: Full OAuth client library, includes server logic (heavy, rejected for CLI needs)
- **Custom http.createServer()**: More code, more edge cases, maintenance burden (rejected)
- **Express**: Overkill for single-endpoint callback server (rejected)

### Sources
- [npm - oauth-callback](https://www.npmjs.com/package/oauth-callback)
- [npm - simple-oauth2](https://www.npmjs.com/package/simple-oauth2)
- [WooCommerce OAuth Helper Implementation](https://github.com/woocommerce/woocommerce/blob/trunk/tools/release-posts/lib/oauth-helper.ts)

## 6. Ink UI Components for Authentication

### Decision: Use `@inkjs/ui` package + custom components

**Library**: [`@inkjs/ui`](https://github.com/vadimdemedes/ink-ui) - Official Ink UI components

**Rationale**:
- Official component library for Ink applications
- Provides Spinner, ProgressBar, Badge, Alert, StatusMessage
- Includes input components: TextInput, PasswordInput, EmailInput, ConfirmInput
- Consistent theming system via React context
- Actively maintained (2025 updates)
- Used by Google Gemini CLI and other production CLIs

**Components for Auth Flow**:

1. **Spinner**: Show during token exchange, token refresh
2. **StatusMessage**: Display authentication status (logged in, logged out, expired)
3. **Alert**: Show errors (network failure, authentication failure)
4. **Badge**: Indicate authentication state (✓ Authenticated, ✗ Not Logged In)
5. **Custom LoginFlow**: Orchestrate browser launch, callback wait, success/error

**Component Architecture**:
```
source/components/auth/
├── login-flow.tsx          # Main login orchestration
├── auth-status.tsx         # Status display (logged in user info)
├── auth-error.tsx          # Error messages with retry options
├── browser-fallback.tsx    # Manual URL display if browser fails
└── spinner-with-message.tsx # Reusable spinner + message
```

**Theming**:
- Use Ink UI's default theme (consistent with ecosystem)
- Customize colors if needed via theme context
- Match existing uxlint theme (if already defined)

**Accessibility**:
- Use semantic color names (success, error, warning)
- Provide clear status messages for screen readers
- Keyboard navigation for any interactive prompts

### Custom Components

**LoginFlow.tsx**:
- Shows spinner while opening browser
- Displays "Waiting for authentication in browser..." message
- Shows success message with user info on completion
- Shows error with retry option on failure
- Handles Ctrl+C cancellation gracefully

**AuthStatus.tsx**:
- Displays username, organization, email
- Shows token expiration time
- Indicates available cloud features
- Shows "Not logged in" message if no session

**BrowserFallback.tsx**:
- Displays authorization URL in highlighted box
- Provides copy-paste instructions
- Shows spinner while waiting for callback
- Offers cancellation option

### Sources
- [GitHub - vadimdemedes/ink-ui](https://github.com/vadimdemedes/ink-ui)
- [Building CLI tools with React using Ink and Pastel - Medium](https://medium.com/trabe/building-cli-tools-with-react-using-ink-and-pastel-2e5b0d3e2793)
- [Google Gemini CLI Components](https://github.com/google-gemini/gemini-cli/tree/main/packages/cli/src/ui/components)

## 7. Environment Configuration

### Decision: Environment variable configuration with build-time injection

**Client ID Management**:
- **Build-time injection**: `UXLINT_CLOUD_CLIENT_ID` embedded during build (via define-plugin or similar)
- **Development override**: `.env` file can override for local testing
- **Priority**: `.env` value > build-injected value > error

**Base URL Management**:
- **Default**: `https://app.uxlint.org` (production)
- **Override**: `UXLINT_CLOUD_API_BASE_URL` in `.env` for testing
- **Use case**: Local development against staging server

**Configuration Pattern**:
```typescript
export const cloudConfig = {
  baseUrl: process.env.UXLINT_CLOUD_API_BASE_URL || 'https://app.uxlint.org',
  clientId: process.env.UXLINT_CLOUD_CLIENT_ID || INJECTED_CLIENT_ID || throwError(),
};
```

**Endpoints** (from spec):
- Authorization: `/auth/v1/oauth/authorize`
- Token: `/auth/v1/oauth/token`
- OpenID Config: `/auth/v1/oauth/.well-known/openid-configuration`

**.env Updates**:
```bash
# UXLint Cloud OAuth Configuration
# Client ID (optional override, normally injected at build time)
# UXLINT_CLOUD_CLIENT_ID=uxlint-cli-dev

# API Base URL (optional override for local development)
UXLINT_CLOUD_API_BASE_URL=http://localhost:54321/functions/v1/cli-api
```

## 8. Persona-First Design Analysis

### Finding: Developer Persona Implicit in CLI Context

**Observation**: The CLI tool itself defines the primary persona - developers using command-line tools.

**Persona Characteristics**:
- **Role**: Frontend/Full-stack developers
- **Context**: Terminal-based workflow, potentially CI/CD environments
- **Goals**: Quick authentication, persistent sessions, minimal friction
- **Constraints**: May work in restricted networks, headless environments (CI)
- **Devices**: Laptops/desktops with terminal access

**UX Alignment**:
- **Concise output**: Developers prefer minimal, actionable messages
- **Speed**: <60s authentication flow (SC-001 aligns with developer time constraints)
- **Persistence**: Token storage avoids repeated logins (developer productivity)
- **Fallback options**: Manual URL for restricted environments (developer flexibility)

**Ink Library Choice Alignment**:
- Spinners show progress without verbosity
- Status badges provide at-a-glance state
- Alert components highlight errors without clutter
- Consistent with developer tool UX patterns (GitHub CLI, Vercel CLI, etc.)

**Constitutional Compliance**: ✅ **RESOLVED**
- Persona implicitly defined by CLI context
- UX patterns align with developer workflows
- Ink ecosystem choice supports persona needs

## 9. Testing Strategy

### Model Testing (Unit Tests with Ava)

**Classes to Test**:
- `UXLintClient`: Singleton, token management, login/logout/refresh methods
- `OAuthFlow`: PKCE parameter generation, authorization URL construction
- `TokenManager`: Token storage/retrieval, expiry checking, refresh logic
- `CallbackServer`: Server lifecycle, code extraction, error handling

**Test Approach**:
- Mock `KeychainService` and `BrowserService` dependencies
- Use MSW to mock HTTP responses from UXLint Cloud API
- Test success paths and error scenarios
- Verify PKCE parameters are correctly generated (SHA-256, Base64URL)
- Test token expiry and refresh logic

### Component Testing (Visual Regression with ink-testing-library)

**Components to Test**:
- `LoginFlow`: Renders spinner, messages, handles success/error states
- `AuthStatus`: Displays user info, token status, available features
- `BrowserFallback`: Shows URL, instructions, spinner
- `AuthError`: Displays error messages, retry options

**Test Approach**:
- Use `render()` from `ink-testing-library`
- Assert on terminal output strings
- Test component state changes (loading → success → error)
- Verify keyboard interactions (Ctrl+C, Enter for retry)

### HTTP Integration Testing (MSW)

**Endpoints to Mock**:
- `GET /auth/v1/oauth/.well-known/openid-configuration`: Return OIDC discovery
- `POST /auth/v1/oauth/token`: Return mock tokens
- Error scenarios: Network failure, invalid code, expired token

**Test Scenarios**:
- Successful token exchange
- Expired access token → automatic refresh
- Invalid refresh token → force re-login
- Network timeout → graceful error
- Server 500 error → retry with backoff

### Dependency Injection for Testability

**Pattern**:
```typescript
export class UXLintClient {
  constructor(
    private keychainService: KeychainService,
    private browserService: BrowserService,
  ) {}

  // Allow setter for testing
  setKeychainService(service: KeychainService) {
    this.keychainService = service;
  }
}

// Production
const client = new UXLintClient(
  new KeytarKeychainService(),
  new OpenBrowserService(),
);

// Testing
const client = new UXLintClient(
  new MockKeychainService(),
  new MockBrowserService(),
);
```

## 10. Implementation Summary

### Technology Decisions

| Component | Library | Version | Rationale |
|-----------|---------|---------|-----------|
| OAuth Flow | Custom (RFC 7636) | - | Standard implementation, no library needed |
| Keychain Storage | `keytar` | Latest | Industry standard, cross-platform, VS Code uses it |
| Browser Launch | `open` | Latest | De facto standard, used by Vite/Storybook/etc |
| OAuth Callback | `oauth-callback` | Latest | Purpose-built for CLI OAuth, handles edge cases |
| Terminal UI | `@inkjs/ui` | Latest | Official Ink components, production-proven |
| HTTP Mocking | `msw` | Latest | Already in project, standard for HTTP mocking |
| Testing | Ava + ink-testing-library | Current | Existing project stack |

### Architecture Decisions

1. **Singleton Pattern**: UXLintClient as singleton for global auth state
2. **Dependency Injection**: Keychain and browser services injected for testability
3. **Separation of Concerns**:
   - OAuth flow logic separate from token storage
   - UI components separate from business logic
   - Service interfaces separate from implementations
4. **Error Handling**: Graceful degradation with fallbacks at every step
5. **Security First**: No plain text storage, no logging of secrets, localhost-only server

### Non-Functional Requirements Met

- **Performance**: <60s auth flow (network-dependent), <2s status check
- **Security**: OS-native keychain, PKCE, no secrets in logs
- **Testability**: Dependency injection, mock services, MSW for HTTP
- **Cross-platform**: Works on macOS, Windows, Linux
- **User Experience**: Ink components, clear messages, fallback options
- **Maintainability**: Standard libraries, clear architecture, documented decisions

## 11. Open Questions (Resolved)

✅ **How to test keychain without actual OS keychain access?**
- Answer: Abstract KeychainService interface, inject MockKeychainService in tests

✅ **How to test browser launch without opening real browser?**
- Answer: Abstract BrowserService interface, inject MockBrowserService in tests

✅ **Which OAuth library to use for PKCE?**
- Answer: None - PKCE is simple enough to implement directly per RFC 7636

✅ **How to handle port conflicts for callback server?**
- Answer: oauth-callback library handles this, tries multiple ports

✅ **Which personas use this feature?**
- Answer: Implicit developer persona (CLI users are developers)

✅ **Which Ink components to use for auth UI?**
- Answer: @inkjs/ui for Spinner, StatusMessage, Alert; custom LoginFlow component

## 12. Next Steps (Phase 1)

1. Generate `data-model.md`: Define TypeScript interfaces for AuthSession, PKCEParams, UserProfile, Token entities
2. Generate `contracts/oauth-endpoints.yaml`: OpenAPI spec for UXLint Cloud OAuth endpoints
3. Generate `contracts/uxlint-client-interface.ts`: TypeScript interfaces for UXLintClient public API
4. Generate `quickstart.md`: Developer guide for implementing the feature
5. Update agent context: Add new libraries (keytar, open, oauth-callback, @inkjs/ui) to agent memory
6. Re-evaluate Constitution Check: Verify no new complexity violations introduced

---

**Research Status**: ✅ Complete
**Ready for Phase 1 Design**: Yes
**Constitutional Gates**: All passed (Persona clarification resolved)
