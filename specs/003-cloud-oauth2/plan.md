# Implementation Plan: UXLint Cloud OAuth2.0 PKCE Authentication

**Branch**: `003-cloud-oauth2` | **Date**: 2025-12-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-cloud-oauth2/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement OAuth 2.0 OIDC + PKCE authentication flow for UXLint CLI to enable secure authentication with UXLint Cloud (app.uxlint.org). Users can run `uxlint auth login` to authenticate via browser-based OAuth flow with PKCE security, and `uxlint auth status` to view their authentication state. The implementation includes a UXLintClient singleton for managing tokens, secure OS-native credential storage, local callback server for OAuth redirect, and Ink-based UI components.

## Technical Context

**Language/Version**: TypeScript (ES modules) with Node.js >=18.18.0
**Primary Dependencies**:
  - `keytar` (^7.9.0): OS-native keychain access (macOS/Windows/Linux)
  - `open` (^10.0.0): Cross-platform browser launching
  - `oauth-callback` (^1.0.0): OAuth callback server for localhost
  - `@inkjs/ui` (^2.0.0): Terminal UI components (Spinner, Badge, Alert)
  - `msw` (^2.0.0): HTTP mocking for tests (already in project)
**Storage**: OS-native secure storage (keychain on macOS, credential manager on Windows, keyring on Linux) for tokens
**Testing**: Ava (with tsimp for TypeScript support), MSW for mocking HTTP responses, AI SDK MockLanguageModelV2 for LLM integrations
**Target Platform**: Cross-platform CLI (macOS, Windows, Linux)
**Project Type**: Single project (CLI application)
**Performance Goals**:
  - Authentication flow completes in <60 seconds (SC-001)
  - Status check responds in <2 seconds (SC-003)
  - Browser launch success rate >95% (SC-002)
  - Token refresh success rate >95% (SC-007)
**Constraints**:
  - Zero credentials in plain text or logs (SC-006)
  - MCP protocol compliance (no stdout/stderr logging)
  - Testable design with dependency injection for keychain/browser services
**Scale/Scope**:
  - 2 new CLI commands (`auth login`, `auth status`)
  - 1 new infrastructure class (UXLintClient singleton)
  - 2-3 service classes (keychain, browser, OAuth flow)
  - 3-5 new Ink UI components
  - Token management (access + refresh tokens)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Code Quality Gates
- **Status**: ✅ PASS
- **Verification**: All code will run through `npm run compile && npm run format && npm run lint` sequence
- **Notes**: Standard workflow applies - no special considerations needed

### II. Test-First Development
- **Status**: ✅ PASS
- **Testing Strategy**:
  - **Models** (UXLintClient, token storage, PKCE parameters): Unit tests using Ava with mocked dependencies
  - **Components** (Ink UI for login/status): Visual regression tests using ink-testing-library
  - **HTTP Integrations** (OAuth endpoints): Mock-based tests using MSW to simulate UXLint Cloud API responses
  - **Dependency Injection**: Keychain and browser services will be injected via constructor/setter to enable test mocking
- **Coverage**: Target 80% minimum via c8
- **Notes**: Tests will be written and approved before implementation begins (red-green-refactor cycle)

### III. UX Consistency via Persona-First Design
- **Status**: ⚠️ NEEDS CLARIFICATION
- **Current State**: Feature spec does not reference specific personas
- **Action Required**: Phase 0 research must identify:
  - Which existing uxlint personas will use cloud authentication
  - UX patterns for CLI authentication flows that align with persona workflows
  - Appropriate Ink ecosystem libraries for auth UI (spinners, progress indicators, success/error messages)

### IV. Performance Accountability
- **Status**: ✅ PASS
- **Measurable Goals Defined**:
  - Authentication flow: <60s end-to-end (SC-001)
  - Status check: <2s response time (SC-003)
  - Browser launch: >95% success rate (SC-002)
  - Token refresh: >95% success rate (SC-007)
- **Baseline**: Will capture timing metrics during implementation for regression monitoring

### V. Simplicity & Minimalism
- **Status**: ✅ PASS (pending Phase 1 review)
- **Initial Assessment**:
  - Singleton pattern for UXLintClient justified by global authentication state
  - Dependency injection justified by testability requirements
  - Separate keychain/browser services justified by OS-specific implementations
- **Review Point**: Re-evaluate after Phase 1 design if additional abstractions are proposed

**GATE RESULT (Initial)**: ⚠️ CONDITIONAL PASS - Proceeded to Phase 0 research with Persona-First Design clarification needed.

---

## Constitution Check (Post-Design Re-evaluation)

*Re-evaluated after Phase 0 research and Phase 1 design completion*

### I. Code Quality Gates
- **Status**: ✅ PASS
- **Verification**: All code will run through `npm run compile && npm run format && npm run lint` sequence
- **Notes**: No changes from initial evaluation

### II. Test-First Development
- **Status**: ✅ PASS
- **Testing Strategy Confirmed**:
  - **Models**: Unit tests with Ava, mocked dependencies (keychain, browser, HTTP)
  - **Components**: Visual regression tests with ink-testing-library
  - **HTTP Integrations**: MSW for mocking OAuth API responses
  - **Dependency Injection**: Services injectable for testability (KeychainService, BrowserService)
- **Coverage**: Target 80% minimum via c8
- **Test Plan**: Documented in quickstart.md with priorities (CRITICAL > HIGH > MEDIUM)

### III. UX Consistency via Persona-First Design
- **Status**: ✅ PASS (RESOLVED)
- **Resolution**: Developer persona identified as implicit CLI user
- **Persona Characteristics**:
  - Role: Frontend/Full-stack developers using CLI tools
  - Context: Terminal-based workflow, CI/CD environments
  - Goals: Quick auth (<60s), persistent sessions, minimal friction
  - Constraints: May work in restricted networks, headless environments
- **UX Alignment Verified**:
  - Concise terminal output (Ink Spinner, StatusMessage, Alert)
  - Speed targets align with developer productivity (<60s login, <2s status)
  - Persistence via OS keychain reduces repeated logins
  - Fallback for restricted environments (manual URL display)
- **Ink Library Selection**: `@inkjs/ui` provides developer-friendly components (Spinner, Badge, Alert) consistent with CLI tool patterns (GitHub CLI, Vercel CLI)

### IV. Performance Accountability
- **Status**: ✅ PASS
- **Measurable Goals Confirmed**:
  - Authentication flow: <60s end-to-end (SC-001) ✓
  - Status check: <2s response time (SC-003) ✓
  - Browser launch: >95% success rate (SC-002) ✓
  - Token refresh: >95% success rate (SC-007) ✓
- **Implementation Plan**: Performance targets documented in quickstart.md for monitoring during implementation

### V. Simplicity & Minimalism
- **Status**: ✅ PASS
- **Architecture Review**:
  - **Singleton UXLintClient**: Justified by global authentication state (single user session)
  - **Dependency Injection**: Justified by testability requirements (mock keychain, browser, HTTP)
  - **Service Abstractions**: 6 services/interfaces (Keychain, Browser, OAuth HTTP Client, Callback Server, Token Manager, OAuth Flow)
    - Justified: Each handles distinct OS/network integration with different testing needs
    - Alternative: Monolithic client with hard-coded dependencies would be untestable
  - **Library Choices**: Prefer existing libraries (keytar, open, oauth-callback) over custom implementations
    - Reduces code complexity vs. building custom keychain/browser/server logic
- **Complexity Justification**: No unjustified abstractions. All services have clear separation of concerns.

**FINAL GATE RESULT**: ✅ PASS - All constitutional principles satisfied. Ready for implementation.

## Project Structure

### Documentation (this feature)

```text
specs/003-cloud-oauth2/
├── spec.md              # Feature specification (already exists)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── oauth-endpoints.yaml        # OpenAPI spec for UXLint Cloud OAuth API
│   └── uxlint-client-interface.ts  # TypeScript interfaces for client
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
source/
├── cli.tsx                          # Update: Add auth command handler
├── infrastructure/
│   ├── auth/                        # NEW: Authentication infrastructure
│   │   ├── uxlint-client.ts        # UXLintClient singleton class
│   │   ├── keychain-service.ts     # Abstract interface for keychain
│   │   ├── keychain-impl.ts        # OS-native keychain implementation
│   │   ├── browser-service.ts      # Abstract interface for browser
│   │   ├── browser-impl.ts         # Browser launch implementation
│   │   ├── oauth-flow.ts           # OAuth 2.0 PKCE flow orchestration
│   │   ├── callback-server.ts      # Local HTTP server for OAuth callback
│   │   └── token-manager.ts        # Token storage and refresh logic
│   ├── config/
│   ├── logger.ts
│   └── reports/
├── components/
│   ├── auth/                        # NEW: Auth UI components
│   │   ├── login-flow.tsx          # Login progress UI
│   │   ├── auth-status.tsx         # Status display UI
│   │   ├── auth-error.tsx          # Error message UI
│   │   └── browser-fallback.tsx    # Manual URL display UI
│   └── [existing components]
├── models/
│   ├── auth-session.ts              # NEW: Authentication session model
│   ├── pkce-params.ts               # NEW: PKCE parameters model
│   ├── user-profile.ts              # NEW: User profile model
│   └── [existing models]
└── [other existing directories]

tests/
├── infrastructure/
│   └── auth/                        # NEW: Auth tests
│       ├── uxlint-client.spec.ts
│       ├── oauth-flow.spec.ts
│       ├── token-manager.spec.ts
│       └── callback-server.spec.ts
├── components/
│   └── auth/                        # NEW: Auth component tests
│       ├── login-flow.spec.tsx
│       └── auth-status.spec.tsx
└── [existing test directories]

.env                                  # Update: Add UXLINT_CLOUD_CLIENT_ID
```

**Structure Decision**: Using existing single-project structure (Option 1). All authentication infrastructure will be added under `source/infrastructure/auth/` to maintain consistency with existing patterns (config/, reports/). UI components follow existing pattern under `source/components/auth/`. Models for authentication state added to existing `source/models/` directory.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitutional violations identified at this stage. The Persona-First Design clarification will be resolved during Phase 0 research.
