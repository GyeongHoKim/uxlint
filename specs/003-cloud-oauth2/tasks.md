# Implementation Tasks: UXLint Cloud OAuth2.0 PKCE Authentication

**Feature Branch**: `003-cloud-oauth2`
**Generated**: 2025-12-18
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

## Overview

This document provides dependency-ordered implementation tasks for the OAuth 2.0 PKCE authentication feature. Tasks are organized by user story to enable independent implementation and testing. The project follows **Test-First Development** (TDD): all tests must be written and approved before implementation.

**User Stories**:
- **US1** (P1): Initial Login - Core OAuth 2.0 PKCE flow with browser authentication
- **US2** (P2): Check Authentication Status - Display current auth state and user info
- **US3** (P3): Browser Launch Fallback - Manual URL display when browser fails

**Implementation Strategy**: Deliver incrementally by user story. US1 is the MVP (Minimum Viable Product) and provides immediate value. US2 and US3 can be implemented independently after US1.

---

## Phase 1: Setup & Dependencies

**Goal**: Install dependencies and configure environment

### Dependencies Installation

- [X] T001 Install authentication dependencies: `npm install keytar open oauth-callback @inkjs/ui`
- [X] T002 Install development dependencies: `npm install --save-dev @types/keytar`
- [X] T003 Verify MSW is installed (already in project): check package.json includes `msw`
- [ ] T004 Update .env file with OAuth configuration (UXLINT_CLOUD_CLIENT_ID, UXLINT_CLOUD_API_BASE_URL)
- [ ] T005 Run quality gates to verify setup: `npm run compile && npm run format && npm run lint`

### Directory Structure

- [X] T006 [P] Create auth infrastructure directory: `source/infrastructure/auth/`
- [X] T007 [P] Create auth components directory: `source/components/auth/`
- [X] T008 [P] Create auth models directory entries in `source/models/` (no new dir needed)
- [X] T009 [P] Create auth tests directory: `tests/infrastructure/auth/`
- [X] T010 [P] Create auth component tests directory: `tests/components/auth/`

**Validation**: All directories created, dependencies installed, quality gates pass

---

## Phase 2: Foundational Models & Utilities

**Goal**: Create core data models and PKCE utilities needed by all user stories

**Constitutional Gate**: Test-First Development - Write tests before implementation

### Data Models (Blocking - Required by all user stories)

- [X] T011 **TEST**: Write unit tests for AuthenticationSession model in `tests/models/auth-session.spec.ts` (validation, expiry check)
- [X] T012 Create AuthenticationSession model in `source/models/auth-session.ts` with version, user, tokens, metadata
- [X] T013 Implement `isValidSession()` type guard in `source/models/auth-session.ts`
- [X] T014 Implement `isSessionExpired()` function in `source/models/auth-session.ts` with buffer parameter
- [ ] T015 **TEST**: Write unit tests for UserProfile model in `tests/models/user-profile.spec.ts`
- [X] T016 [P] Create UserProfile interface in `source/models/user-profile.ts` with id, email, name, organization, picture, emailVerified
- [ ] T017 **TEST**: Write unit tests for TokenSet model in `tests/models/token-set.spec.ts`
- [X] T018 [P] Create TokenSet interface in `source/models/token-set.ts` with accessToken, tokenType, expiresIn, refreshToken, idToken, scope
- [ ] T019 **TEST**: Write unit tests for PKCEParameters model in `tests/models/pkce-params.spec.ts`
- [X] T020 [P] Create PKCEParameters interface in `source/models/pkce-params.ts` with codeVerifier, codeChallenge, codeChallengeMethod, state
- [ ] T021 **TEST**: Write unit tests for AuthenticationError in `tests/models/auth-error.spec.ts`
- [X] T022 [P] Create AuthError enum and AuthenticationError class in `source/models/auth-error.ts`

### PKCE Utilities (Blocking - Required by US1)

- [X] T023 **TEST**: Write unit tests for PKCE generator in `tests/infrastructure/auth/pkce-generator.spec.ts` (verify SHA-256, Base64URL encoding, randomness)
- [X] T024 Create PKCE generator utility in `source/infrastructure/auth/pkce-generator.ts` with `generatePKCEParameters()` function
- [X] T025 Implement `base64URLEncode()` helper function in `source/infrastructure/auth/pkce-generator.ts`
- [X] T026 Verify PKCE generation produces 43-128 character code verifier (add assertion in tests)

### Export Models

- [X] T027 [P] Update `source/models/index.ts` to export all auth models (AuthenticationSession, UserProfile, TokenSet, PKCEParameters, AuthenticationError)

**Validation**: All model tests pass, PKCE generator verified with cryptographic tests, quality gates pass

---

## Phase 3: User Story 1 - Initial Login (P1) 🎯 MVP

**Story Goal**: Developer runs `uxlint auth login`, browser opens to OAuth authorization page, completes authentication, and CLI securely stores credentials.

**Independent Test Criteria**:
- ✅ User can run `uxlint auth login` command
- ✅ Browser automatically opens to app.uxlint.org authorization page
- ✅ After completing browser authentication, CLI confirms success
- ✅ Credentials are stored in OS keychain (not plain text)
- ✅ Already-logged-in users see notification and re-auth option
- ✅ All tests pass with 80%+ coverage for US1 components

**Acceptance Scenarios** (from spec.md):
- AS1.1: User not logged in → `uxlint auth login` → browser opens to authorization page
- AS1.2: User completes login in browser → browser shows success → CLI confirms authentication
- AS1.3: User completes auth → credentials stored securely in keychain
- AS1.4: User already logged in → `uxlint auth login` → notification shown, re-auth option provided

### Service Interfaces

- [ ] T028 **TEST**: Write unit tests for KeychainService interface in `tests/infrastructure/auth/keychain-service.spec.ts` (mock implementation)
- [ ] T029 Create IKeychainService interface in `source/infrastructure/auth/keychain-service.ts` with getPassword, setPassword, deletePassword, isAvailable methods
- [ ] T030 **TEST**: Write unit tests for BrowserService interface in `tests/infrastructure/auth/browser-service.spec.ts` (mock implementation)
- [ ] T031 [P] Create IBrowserService interface in `source/infrastructure/auth/browser-service.ts` with openUrl, isAvailable methods

### Keychain Service Implementation

- [ ] T032 **TEST**: Write unit tests for KeytarKeychainService in `tests/infrastructure/auth/keychain-impl.spec.ts` (test with mock keytar)
- [ ] T033 Create KeytarKeychainService class in `source/infrastructure/auth/keychain-impl.ts` implementing IKeychainService
- [ ] T034 Implement getPassword method using keytar in `source/infrastructure/auth/keychain-impl.ts`
- [ ] T035 Implement setPassword method using keytar in `source/infrastructure/auth/keychain-impl.ts`
- [ ] T036 Implement deletePassword method using keytar in `source/infrastructure/auth/keychain-impl.ts`
- [ ] T037 Implement isAvailable method checking keytar availability in `source/infrastructure/auth/keychain-impl.ts`
- [ ] T038 Add error handling for keychain access failures in `source/infrastructure/auth/keychain-impl.ts` (throw AuthenticationError with KEYCHAIN_ERROR code)

### Mock Keychain (Testing)

- [ ] T039 [P] [US1] Create MockKeychainService class in `source/infrastructure/auth/keychain-mock.ts` with in-memory storage Map
- [ ] T040 [P] [US1] Implement all IKeychainService methods using Map in `source/infrastructure/auth/keychain-mock.ts`
- [ ] T041 [P] [US1] Add `clear()` method to MockKeychainService for test cleanup

### Browser Service Implementation

- [ ] T042 **TEST**: Write unit tests for OpenBrowserService in `tests/infrastructure/auth/browser-impl.spec.ts`
- [ ] T043 [P] [US1] Create OpenBrowserService class in `source/infrastructure/auth/browser-impl.ts` implementing IBrowserService
- [ ] T044 [P] [US1] Implement openUrl method using `open` library in `source/infrastructure/auth/browser-impl.ts`
- [ ] T045 [P] [US1] Implement isAvailable method in `source/infrastructure/auth/browser-impl.ts` (always true, `open` handles platform detection)
- [ ] T046 [P] [US1] Add error handling for browser launch failures in `source/infrastructure/auth/browser-impl.ts` (throw AuthenticationError with BROWSER_FAILED code)

### Mock Browser (Testing)

- [ ] T047 [P] [US1] Create MockBrowserService class in `source/infrastructure/auth/browser-mock.ts` with openedUrls array
- [ ] T048 [P] [US1] Implement openUrl method tracking URLs in array in `source/infrastructure/auth/browser-mock.ts`
- [ ] T049 [P] [US1] Add `shouldFail` flag to simulate browser launch failure in `source/infrastructure/auth/browser-mock.ts`
- [ ] T050 [P] [US1] Add `clear()` method to MockBrowserService for test cleanup

### OAuth HTTP Client

- [ ] T051 **TEST**: Write unit tests for OAuthHttpClient in `tests/infrastructure/auth/oauth-http-client.spec.ts` (use MSW to mock HTTP responses)
- [ ] T052 [US1] Create OAuthHttpClient class in `source/infrastructure/auth/oauth-http-client.ts`
- [ ] T053 [US1] Implement exchangeCodeForTokens method in `source/infrastructure/auth/oauth-http-client.ts` (POST /token with authorization_code grant)
- [ ] T054 [US1] Implement refreshAccessToken method in `source/infrastructure/auth/oauth-http-client.ts` (POST /token with refresh_token grant)
- [ ] T055 [US1] Implement getOpenIDConfiguration method in `source/infrastructure/auth/oauth-http-client.ts` (GET /.well-known/openid-configuration)
- [ ] T056 [US1] Add error handling for HTTP failures in `source/infrastructure/auth/oauth-http-client.ts` (parse OAuth error responses, throw AuthenticationError)
- [ ] T057 [US1] Setup MSW handlers in `tests/mocks/oauth-server.ts` for token endpoint, OIDC config endpoint

### Callback Server

- [ ] T058 **TEST**: Write unit tests for CallbackServer in `tests/infrastructure/auth/callback-server.spec.ts` (mock oauth-callback library)
- [ ] T059 [US1] Create CallbackServer class in `source/infrastructure/auth/callback-server.ts`
- [ ] T060 [US1] Implement waitForCallback method using oauth-callback library in `source/infrastructure/auth/callback-server.ts`
- [ ] T061 [US1] Add state verification in waitForCallback in `source/infrastructure/auth/callback-server.ts` (throw INVALID_RESPONSE if state mismatch)
- [ ] T062 [US1] Implement stop method in `source/infrastructure/auth/callback-server.ts` (oauth-callback handles cleanup)
- [ ] T063 [US1] Add timeout handling (default 5 minutes) in `source/infrastructure/auth/callback-server.ts`
- [ ] T064 [US1] Add error handling for port conflicts in `source/infrastructure/auth/callback-server.ts` (oauth-callback tries multiple ports)

### OAuth Flow Orchestrator

- [ ] T065 **TEST**: Write integration tests for OAuthFlow in `tests/infrastructure/auth/oauth-flow.spec.ts` (mock HTTP client, browser, callback server)
- [ ] T066 [US1] Create OAuthFlow class in `source/infrastructure/auth/oauth-flow.ts` with constructor injecting httpClient, callbackServer, browserService
- [ ] T067 [US1] Implement authorize method in `source/infrastructure/auth/oauth-flow.ts` (orchestrates full OAuth flow)
- [ ] T068 [US1] Implement PKCE parameter generation in authorize method
- [ ] T069 [US1] Implement authorization URL construction in authorize method with PKCE parameters
- [ ] T070 [US1] Implement callback server start in authorize method
- [ ] T071 [US1] Implement browser launch in authorize method with try-catch for BROWSER_FAILED
- [ ] T072 [US1] Implement callback wait in authorize method
- [ ] T073 [US1] Implement code-for-tokens exchange in authorize method
- [ ] T074 [US1] Implement refresh method in `source/infrastructure/auth/oauth-flow.ts` (refresh tokens using refresh token)
- [ ] T075 [US1] Add `buildAuthorizationUrl` private helper method in `source/infrastructure/auth/oauth-flow.ts`

### Token Manager

- [ ] T076 **TEST**: Write unit tests for TokenManager in `tests/infrastructure/auth/token-manager.spec.ts` (use MockKeychainService)
- [ ] T077 [US1] Create TokenManager class in `source/infrastructure/auth/token-manager.ts` with keychain injected
- [ ] T078 [US1] Implement loadSession method in `source/infrastructure/auth/token-manager.ts` (retrieve from keychain, parse JSON, validate)
- [ ] T079 [US1] Implement saveSession method in `source/infrastructure/auth/token-manager.ts` (serialize to JSON, store in keychain)
- [ ] T080 [US1] Implement deleteSession method in `source/infrastructure/auth/token-manager.ts` (remove from keychain)
- [ ] T081 [US1] Add error handling for corrupted sessions in loadSession (delete corrupted session, return null)
- [ ] T082 [US1] Use service name 'uxlint-cli' and account 'default' for keychain storage

### UXLintClient (Singleton)

- [ ] T083 **TEST**: Write integration tests for UXLintClient in `tests/infrastructure/auth/uxlint-client.spec.ts` (mock all dependencies)
- [ ] T084 [US1] Create UXLintClient class in `source/infrastructure/auth/uxlint-client.ts` implementing IUXLintClient
- [ ] T085 [US1] Implement singleton pattern with getInstance static method in `source/infrastructure/auth/uxlint-client.ts`
- [ ] T086 [US1] Implement private constructor with tokenManager, oauthFlow, config injected in `source/infrastructure/auth/uxlint-client.ts`
- [ ] T087 [US1] Implement login method in `source/infrastructure/auth/uxlint-client.ts` (check existing session, execute OAuth flow, decode ID token, create session, save to keychain)
- [ ] T088 [US1] Implement logout method in `source/infrastructure/auth/uxlint-client.ts` (delete session from keychain, clear in-memory session)
- [ ] T089 [US1] Implement getStatus method in `source/infrastructure/auth/uxlint-client.ts` (load session from keychain if not in memory)
- [ ] T090 [US1] Implement isAuthenticated method in `source/infrastructure/auth/uxlint-client.ts` (check session exists and not expired)
- [ ] T091 [US1] Implement getUserProfile method in `source/infrastructure/auth/uxlint-client.ts` (throw NOT_AUTHENTICATED if no session)
- [ ] T092 [US1] Implement getAccessToken method in `source/infrastructure/auth/uxlint-client.ts` (auto-refresh if expired within 5 minutes)
- [ ] T093 [US1] Implement refreshToken method in `source/infrastructure/auth/uxlint-client.ts` (use OAuth flow refresh, update session, handle REFRESH_FAILED)
- [ ] T094 [US1] Implement decodeIdToken private method in `source/infrastructure/auth/uxlint-client.ts` (Base64URL decode JWT payload, map claims to UserProfile)
- [ ] T095 [US1] Add production dependency creation in getInstance in `source/infrastructure/auth/uxlint-client.ts` (KeytarKeychainService, OpenBrowserService, etc.)
- [ ] T096 [US1] Export getUXLintClient() singleton accessor function in `source/infrastructure/auth/uxlint-client.ts`

### OAuth Configuration

- [ ] T097 [P] [US1] Create OAuthConfig interface in `source/infrastructure/auth/oauth-config.ts` with clientId, baseUrl, endpoints, redirectUri, scopes
- [ ] T098 [P] [US1] Create defaultOAuthConfig constant in `source/infrastructure/auth/oauth-config.ts` reading from environment variables
- [ ] T099 [P] [US1] Set default baseUrl to 'https://app.uxlint.org' with UXLINT_CLOUD_API_BASE_URL override
- [ ] T100 [P] [US1] Set default clientId from UXLINT_CLOUD_CLIENT_ID or build-time injection
- [ ] T101 [P] [US1] Define default OAuth endpoints (/auth/v1/oauth/authorize, /token, /.well-known/openid-configuration)
- [ ] T102 [P] [US1] Set default redirectUri to 'http://localhost:8080/callback'
- [ ] T103 [P] [US1] Set default scopes to ['openid', 'profile', 'email', 'uxlint:api']

### Login UI Component

- [ ] T104 **TEST**: Write visual regression tests for LoginFlow component in `tests/components/auth/login-flow.spec.tsx` (use ink-testing-library)
- [ ] T105 [US1] Create LoginFlow component in `source/components/auth/login-flow.tsx` with onComplete, onError props
- [ ] T106 [US1] Implement useEffect hook calling uxlintClient.login() in `source/components/auth/login-flow.tsx`
- [ ] T107 [US1] Implement status state management (opening-browser, waiting, exchanging, success) in `source/components/auth/login-flow.tsx`
- [ ] T108 [US1] Render Spinner with "Opening browser..." message in `source/components/auth/login-flow.tsx`
- [ ] T109 [US1] Render Spinner with "Waiting for authentication..." message in `source/components/auth/login-flow.tsx`
- [ ] T110 [US1] Render Spinner with "Completing authentication..." message in `source/components/auth/login-flow.tsx`
- [ ] T111 [US1] Render success message with green checkmark when complete in `source/components/auth/login-flow.tsx`
- [ ] T112 [US1] Handle BROWSER_FAILED error by displaying manual URL in `source/components/auth/login-flow.tsx`
- [ ] T113 [US1] Handle other errors by calling onError prop in `source/components/auth/login-flow.tsx`

### CLI Integration

- [ ] T114 [US1] Update CLI parser in `source/cli.tsx` to recognize 'auth' command with subcommands
- [ ] T115 [US1] Implement 'auth login' command handler in `source/cli.tsx` rendering LoginFlow component
- [ ] T116 [US1] Handle LoginFlow onComplete callback exiting with code 0 in `source/cli.tsx`
- [ ] T117 [US1] Handle LoginFlow onError callback exiting with code 1 in `source/cli.tsx`
- [ ] T118 [US1] Update help text in `source/cli.tsx` to document 'uxlint auth login' command
- [ ] T119 [US1] Add usage examples for 'uxlint auth login' in help text

### Manual Testing & Validation

- [ ] T120 [US1] Run `npm run compile && npm run format && npm run lint` (quality gates)
- [ ] T121 [US1] Run `npm test` to verify all US1 tests pass with 80%+ coverage
- [ ] T122 [US1] **MANUAL**: Test `uxlint auth login` flow end-to-end (browser opens, login, CLI confirms)
- [ ] T123 [US1] **MANUAL**: Test already-logged-in scenario (run login twice, verify notification)
- [ ] T124 [US1] **MANUAL**: Verify credentials stored in OS keychain (check keychain app on macOS)
- [ ] T125 [US1] **MANUAL**: Test performance (<60s login flow) - measure and document
- [ ] T126 [US1] **MANUAL**: Test Ctrl+C cancellation during login (verify clean termination)

**US1 Completion Criteria**: ✅ All tests pass, manual testing complete, login flow functional, credentials securely stored

---

## Phase 4: User Story 2 - Check Authentication Status (P2)

**Story Goal**: Developer runs `uxlint auth status` to view current authentication state, user info, token expiration, and available features.

**Independent Test Criteria**:
- ✅ User can run `uxlint auth status` command
- ✅ Logged-in users see username, email, organization, token expiration
- ✅ Not-logged-in users see "Not logged in" message with instructions
- ✅ Expired token users see "Expired" status with re-auth prompt
- ✅ Status check completes in <2 seconds
- ✅ All tests pass with 80%+ coverage for US2 components

**Dependencies**: US1 must be complete (requires UXLintClient, session management)

**Acceptance Scenarios** (from spec.md):
- AS2.1: User logged in → `uxlint auth status` → displays username, login timestamp, token expiration
- AS2.2: User not logged in → `uxlint auth status` → displays "No active session" message, suggests `uxlint auth login`
- AS2.3: Token expired → `uxlint auth status` → displays expired status, last login time, re-auth prompt
- AS2.4: User logged in → `uxlint auth status` → displays available cloud features

### Status UI Component

- [ ] T127 **TEST**: Write visual regression tests for AuthStatus component in `tests/components/auth/auth-status.spec.tsx` (test logged in, logged out, expired states)
- [ ] T128 [US2] Create AuthStatus component in `source/components/auth/auth-status.tsx`
- [ ] T129 [US2] Implement useEffect hook calling uxlintClient.getStatus() in `source/components/auth/auth-status.tsx`
- [ ] T130 [US2] Implement loading state with spinner in `source/components/auth/auth-status.tsx`
- [ ] T131 [US2] Render "Not logged in" Alert with instructions when session is null in `source/components/auth/auth-status.tsx`
- [ ] T132 [US2] Render Badge with "Authenticated" or "Expired" status in `source/components/auth/auth-status.tsx`
- [ ] T133 [US2] Display user name and email in bold in `source/components/auth/auth-status.tsx`
- [ ] T134 [US2] Display organization if present in `source/components/auth/auth-status.tsx`
- [ ] T135 [US2] Display token expiration time in `source/components/auth/auth-status.tsx` (format with toLocaleString())
- [ ] T136 [US2] Display available cloud features list in `source/components/auth/auth-status.tsx` (based on scopes)
- [ ] T137 [US2] Handle expired tokens by showing "Expired" badge with re-auth message in `source/components/auth/auth-status.tsx`

### CLI Integration

- [ ] T138 [US2] Implement 'auth status' command handler in `source/cli.tsx` rendering AuthStatus component
- [ ] T139 [US2] Update help text in `source/cli.tsx` to document 'uxlint auth status' command
- [ ] T140 [US2] Add usage examples for 'uxlint auth status' in help text

### Manual Testing & Validation

- [ ] T141 [US2] Run `npm run compile && npm run format && npm run lint` (quality gates)
- [ ] T142 [US2] Run `npm test` to verify all US2 tests pass
- [ ] T143 [US2] **MANUAL**: Test `uxlint auth status` when logged in (verify correct info displayed)
- [ ] T144 [US2] **MANUAL**: Test `uxlint auth status` when not logged in (verify "Not logged in" message)
- [ ] T145 [US2] **MANUAL**: Test `uxlint auth status` with expired token (manually modify keychain or wait for expiry)
- [ ] T146 [US2] **MANUAL**: Test performance (<2s response time) - measure and document

**US2 Completion Criteria**: ✅ All tests pass, manual testing complete, status command functional, all states handled

---

## Phase 5: User Story 3 - Browser Launch Fallback (P3)

**Story Goal**: When automatic browser launch fails (restricted environments, headless servers), user receives clear instructions to manually open the authorization URL while CLI continues waiting for callback.

**Independent Test Criteria**:
- ✅ When browser launch fails, CLI displays authorization URL with instructions
- ✅ CLI continues waiting for callback even after browser failure
- ✅ User can manually open URL and complete authentication
- ✅ User can cancel with Ctrl+C for clean termination
- ✅ Browser launch success rate >95% (track in logs)
- ✅ All tests pass with 80%+ coverage for US3 components

**Dependencies**: US1 must be complete (requires OAuth flow, browser service)

**Acceptance Scenarios** (from spec.md):
- AS3.1: Browser launch fails → CLI displays authorization URL and instructions to open manually
- AS3.2: User manually opens URL → CLI detects callback and confirms login
- AS3.3: CLI waiting for auth → user cancels with Ctrl+C → clean termination

### Browser Fallback UI Component

- [ ] T147 **TEST**: Write visual regression tests for BrowserFallback component in `tests/components/auth/browser-fallback.spec.tsx`
- [ ] T148 [P] [US3] Create BrowserFallback component in `source/components/auth/browser-fallback.tsx` with url, onComplete, onCancel props
- [ ] T149 [P] [US3] Display authorization URL in highlighted box in `source/components/auth/browser-fallback.tsx`
- [ ] T150 [P] [US3] Render copy-paste instructions in `source/components/auth/browser-fallback.tsx`
- [ ] T151 [P] [US3] Render Spinner with "Waiting for authentication..." message in `source/components/auth/browser-fallback.tsx`
- [ ] T152 [P] [US3] Display "Press Ctrl+C to cancel" instruction in `source/components/auth/browser-fallback.tsx`
- [ ] T153 [P] [US3] Implement useEffect hook for callback waiting logic in `source/components/auth/browser-fallback.tsx`

### Error UI Component

- [ ] T154 **TEST**: Write visual regression tests for AuthError component in `tests/components/auth/auth-error.spec.tsx`
- [ ] T155 [P] [US3] Create AuthError component in `source/components/auth/auth-error.tsx` with error, onRetry props
- [ ] T156 [P] [US3] Display error message in Alert with error variant in `source/components/auth/auth-error.tsx`
- [ ] T157 [P] [US3] Handle BROWSER_FAILED error code specially (show BrowserFallback) in `source/components/auth/auth-error.tsx`
- [ ] T158 [P] [US3] Handle NETWORK_ERROR with retry option in `source/components/auth/auth-error.tsx`
- [ ] T159 [P] [US3] Handle USER_DENIED with friendly message (no retry) in `source/components/auth/auth-error.tsx`
- [ ] T160 [P] [US3] Display generic error message for unknown errors in `source/components/auth/auth-error.tsx`

### LoginFlow Component Updates

- [ ] T161 [US3] Update LoginFlow component in `source/components/auth/login-flow.tsx` to use BrowserFallback on BROWSER_FAILED
- [ ] T162 [US3] Update LoginFlow component to use AuthError component for all errors
- [ ] T163 [US3] Implement retry logic in LoginFlow calling uxlintClient.login() again

### Ctrl+C Handling

- [ ] T164 [US3] Add process signal handler for SIGINT in `source/cli.tsx` during auth commands
- [ ] T165 [US3] Implement clean shutdown on Ctrl+C: stop callback server, clear pending operations, exit with code 130

### Manual Testing & Validation

- [ ] T166 [US3] Run `npm run compile && npm run format && npm run lint` (quality gates)
- [ ] T167 [US3] Run `npm test` to verify all US3 tests pass
- [ ] T168 [US3] **MANUAL**: Test browser launch failure scenario (mock browser service to fail)
- [ ] T169 [US3] **MANUAL**: Verify authorization URL displayed correctly with instructions
- [ ] T170 [US3] **MANUAL**: Manually open authorization URL and complete authentication (verify CLI detects callback)
- [ ] T171 [US3] **MANUAL**: Test Ctrl+C cancellation during fallback mode (verify clean termination)
- [ ] T172 [US3] **MANUAL**: Test Ctrl+C cancellation during normal login (verify clean termination)

**US3 Completion Criteria**: ✅ All tests pass, manual testing complete, fallback functional, Ctrl+C handling works

---

## Phase 6: Polish & Cross-Cutting Concerns

**Goal**: Add logout command, optimize performance, add comprehensive documentation

### Logout Command

- [ ] T173 [P] Implement 'auth logout' command handler in `source/cli.tsx` calling uxlintClient.logout()
- [ ] T174 [P] Display confirmation message after logout in `source/cli.tsx`
- [ ] T175 [P] Update help text to document 'uxlint auth logout' command
- [ ] T176 [P] **TEST**: Write test for logout command in `tests/cli/auth-logout.spec.ts`

### Token Auto-Refresh (Silent)

- [ ] T177 Verify getAccessToken() auto-refreshes tokens within 5-minute window (already implemented in US1)
- [ ] T178 Add silent refresh logging to Winston logger (file only, not stdout) in `source/infrastructure/auth/uxlint-client.ts`
- [ ] T179 **TEST**: Write integration test for automatic token refresh in `tests/infrastructure/auth/token-refresh.spec.ts`

### Performance Optimization

- [ ] T180 Add performance timing to login flow in `source/infrastructure/auth/uxlint-client.ts` (start to finish)
- [ ] T181 Add performance timing to status check in `source/infrastructure/auth/uxlint-client.ts`
- [ ] T182 Log performance metrics to Winston logger (file only) for monitoring
- [ ] T183 **MANUAL**: Measure login flow performance (<60s target) and document results
- [ ] T184 **MANUAL**: Measure status check performance (<2s target) and document results

### Error Handling Improvements

- [ ] T185 [P] Add retry logic with exponential backoff for network errors in `source/infrastructure/auth/oauth-http-client.ts`
- [ ] T186 [P] Add timeout handling for HTTP requests (30s default) in `source/infrastructure/auth/oauth-http-client.ts`
- [ ] T187 [P] Add user-friendly error messages for all AuthErrorCode types in `source/models/auth-error.ts`

### Documentation

- [ ] T188 [P] Update README.md with authentication section documenting `auth login`, `auth status`, `auth logout` commands
- [ ] T189 [P] Add authentication examples to README.md (basic flow, checking status, handling errors)
- [ ] T190 [P] Document environment variables (UXLINT_CLOUD_CLIENT_ID, UXLINT_CLOUD_API_BASE_URL) in README.md
- [ ] T191 [P] Update CLAUDE.md if needed with authentication patterns (likely no changes needed)

### Security Audit

- [ ] T192 **AUDIT**: Verify no tokens logged to console or files (grep codebase for accessToken, refreshToken)
- [ ] T193 **AUDIT**: Verify keychain used for all credential storage (no plain text files)
- [ ] T194 **AUDIT**: Verify PKCE implementation uses SHA-256 and S256 method (never plain)
- [ ] T195 **AUDIT**: Verify state parameter used and validated in all OAuth flows
- [ ] T196 **AUDIT**: Verify callback server binds to localhost only (not 0.0.0.0)

### Final Testing

- [ ] T197 Run full test suite with coverage: `npm test`
- [ ] T198 Verify 80%+ code coverage achieved (check c8 report)
- [ ] T199 Run quality gates: `npm run compile && npm run format && npm run lint`
- [ ] T200 **MANUAL**: End-to-end test of complete flow (login → status → use token → logout)
- [ ] T201 **MANUAL**: Test on all supported platforms (macOS, Windows, Linux)
- [ ] T202 **MANUAL**: Test in CI environment (headless, no browser available)

---

## Task Dependency Graph

**User Story Completion Order**:

```
Setup (Phase 1) → Foundational (Phase 2) → US1 (Phase 3) → US2 (Phase 4) → US3 (Phase 5) → Polish (Phase 6)
                                               ↓              ↓              ↓
                                            (MVP)      (Independent)   (Independent)
```

**Story Dependencies**:
- **US1** (P1): Depends on Setup + Foundational (no user story dependencies)
- **US2** (P2): Depends on US1 (requires UXLintClient, session management)
- **US3** (P3): Depends on US1 (requires OAuth flow, browser service)
- **Polish** (Phase 6): Depends on US1 (requires all core infrastructure)

**US2 and US3 can be implemented in parallel** after US1 is complete.

---

## Parallel Execution Opportunities

### Within US1 (Phase 3):

**After T027 (Model exports), can parallelize**:
- [P] T028-T031: Service interfaces (KeychainService, BrowserService)
- [P] T039-T041: Mock implementations (MockKeychain, MockBrowser)
- [P] T097-T103: OAuth configuration

**After T050 (Mocks complete), can parallelize**:
- [P] T032-T038: KeytarKeychainService implementation
- [P] T042-T046: OpenBrowserService implementation
- [P] T051-T057: OAuthHttpClient implementation
- [P] T058-T064: CallbackServer implementation

### Within US2 (Phase 4):

**After US1 complete, can parallelize**:
- [P] T127-T137: AuthStatus component (no dependencies)
- [P] T138-T140: CLI integration (depends on component)

### Within US3 (Phase 5):

**After US1 complete, can parallelize**:
- [P] T147-T153: BrowserFallback component
- [P] T154-T160: AuthError component
- [P] T161-T163: LoginFlow updates (depends on components)
- [P] T164-T165: Ctrl+C handling (independent)

### Within Polish (Phase 6):

**All tasks can be parallelized**:
- [P] T173-T176: Logout command
- [P] T177-T179: Auto-refresh (if not already done)
- [P] T180-T184: Performance optimization
- [P] T185-T187: Error handling improvements
- [P] T188-T191: Documentation
- [P] T192-T196: Security audit

---

## Implementation Strategy

### MVP Scope (Minimum Viable Product)

**Deliver US1 first** for immediate value:
- ✅ Developers can authenticate with UXLint Cloud
- ✅ Credentials securely stored in OS keychain
- ✅ Browser-based OAuth flow works on developer machines

**MVP Deliverables**: Tasks T001-T126 (Phase 1-3)

**Estimated Effort**: 2-3 days for experienced TypeScript developer

### Incremental Delivery

**After MVP (US1)**:
1. **Add US2** (auth status command) - Independent increment, 0.5 day effort
2. **Add US3** (browser fallback) - Independent increment, 0.5 day effort
3. **Add Polish** (logout, optimizations, docs) - Final polish, 1 day effort

**Total Estimated Effort**: 4-5 days for complete implementation

### Testing Strategy

**Test-First Development (TDD)**:
1. Write test for component/function (red phase)
2. Run test, verify it fails
3. Implement component/function (green phase)
4. Run test, verify it passes
5. Refactor if needed, verify test still passes
6. Run quality gates: `npm run compile && npm run format && npm run lint`

**Test Coverage Targets**:
- **CRITICAL** (100% coverage required):
  - PKCE generation (T023-T026)
  - Token manager (T076-T082)
  - UXLintClient (T083-T096)
- **HIGH** (>80% coverage required):
  - OAuth HTTP client (T051-T057)
  - OAuth flow (T065-T075)
  - Keychain service (T032-T038)
- **MEDIUM** (>60% coverage acceptable):
  - UI components (T104-T113, T127-T137, T147-T160)
  - Browser service (T042-T046)

**Manual Testing**:
- Performed after each user story completion
- Focus on end-to-end flows, performance, edge cases
- Test on multiple platforms (macOS, Windows, Linux)

---

## Summary

**Total Tasks**: 202 tasks
- **Setup**: 10 tasks (T001-T010)
- **Foundational**: 17 tasks (T011-T027)
- **US1** (P1 - MVP): 99 tasks (T028-T126)
- **US2** (P2): 20 tasks (T127-T146)
- **US3** (P3): 26 tasks (T147-T172)
- **Polish**: 30 tasks (T173-T202)

**Parallel Opportunities**: 47 tasks marked with [P] can be executed in parallel

**Test-First Tasks**: 32 test tasks (marked with **TEST**) must be written before implementation

**Story Breakdown**:
- US1: Core OAuth flow with browser authentication (MVP)
- US2: Status checking and user info display (independent)
- US3: Browser fallback for restricted environments (independent)

**Independent Test Criteria**:
- Each user story has clear acceptance scenarios
- Each user story can be tested independently
- Each user story delivers standalone value

**Constitutional Compliance**:
- ✅ Test-First Development: All tests written before implementation
- ✅ Code Quality Gates: Compile → Format → Lint after each change
- ✅ Performance Accountability: Clear targets and measurement tasks
- ✅ Simplicity & Minimalism: Justified abstractions, prefer existing libraries

**Ready for Implementation**: Yes - All design artifacts complete, tasks dependency-ordered, acceptance criteria defined

---

**Next Steps**:
1. Begin with Phase 1 (Setup) - Install dependencies
2. Complete Phase 2 (Foundational) - TDD for models and PKCE
3. Implement US1 (MVP) - Core OAuth flow
4. Validate US1 with manual testing
5. Proceed to US2 and US3 in parallel
6. Complete with Polish phase

**Success Criteria**:
- ✅ All 202 tasks completed
- ✅ 80%+ test coverage achieved
- ✅ All manual tests pass
- ✅ Quality gates pass
- ✅ Performance targets met (<60s login, <2s status)
- ✅ Security audit passes (no leaked credentials)
