# Tasks: Playwright MCP Server and Client Integration

**Feature Branch**: `001-uxlint-config-interactive`
**Input**: Design documents from `/specs/001-uxlint-config-interactive/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-client.ts

**Tests**: Per Constitution v1.1.0 II, tests are MANDATORY and MUST be written BEFORE implementation:
- Models (pure TypeScript classes/functions): Unit tests using Ava
- Components (React/Ink UI): Visual regression tests using ink-testing-library
- Tests MUST fail initially (red phase) before implementation begins

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions
- **Single project**: `source/`, `tests/` at repository root
- Paths assume TypeScript + Ink CLI project structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic MCP integration structure

- [X] T001 Install MCP SDK dependencies: `@modelcontextprotocol/sdk` (^1.20.0)
- [X] T002 [P] Install AI SDK dependencies: `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `zod`
- [X] T003 [P] Verify Playwright MCP server accessibility: `npx @playwright/mcp@latest --help` (Will be verified via code execution)
- [X] T004 Create directory structure: `source/mcp/client/`, `source/hooks/`, `source/models/`, `source/config/`
- [X] T005 [P] Create test directory structure: `tests/mcp/client/`, `tests/hooks/`, `tests/models/`, `tests/integration/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core MCP client infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Create TypeScript type definitions in `source/mcp/client/types.ts` (Tool, NavigateResult, ScreenshotResult, SnapshotResult, McpConfig, BrowserType)
- [X] T007 Create error hierarchy in `source/mcp/client/errors.ts` (McpError, ConnectionError, ToolInvocationError, ServerNotAvailableError, TimeoutError)
- [X] T008 Create configuration helper in `source/mcp/client/config.ts` (getDefaultMcpConfig, getMcpConfigFromEnv, mergeMcpConfig)
- [X] T009 Create validation utilities in `source/mcp/client/validators.ts` (isValidUrl, isValidSelector, isScriptSafe, isValidTimeout)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Web Page Inspection Capability (Priority: P1) 🎯 MVP

**Goal**: Enable uxlint to automatically connect to Playwright MCP server and become ready to inspect web pages

**Independent Test**: Can initialize MCP client, connect to Playwright server, verify connection status, and cleanup properly

### Tests for User Story 1 (MANDATORY per Constitution v1.1.0) ⚠️

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**
**Strategy**: Unit tests (Ava) for MCPClient class

- [X] T010 [P] [US1] Unit test: MCPClient constructor in `tests/mcp/client/mcp-client.spec.ts`
  - Test client initialization with name and version
  - Verify initial state (not connected)
  - Verify capabilities registration

- [X] T011 [P] [US1] Unit test: MCPClient.connect() in `tests/mcp/client/mcp-client.spec.ts`
  - Test successful connection to Playwright MCP server
  - Verify connected state becomes true
  - Test connection with invalid command (should throw ConnectionError)
  - Test connection when already connected (should throw error)

- [X] T012 [P] [US1] Unit test: MCPClient.listTools() in `tests/mcp/client/mcp-client.spec.ts`
  - Test tool discovery after connection
  - Verify Playwright tools are listed (browser_navigate, browser_snapshot, etc.)
  - Test listTools() when not connected (should throw MCPError)

- [X] T013 [P] [US1] Unit test: MCPClient.close() in `tests/mcp/client/mcp-client.spec.ts`
  - Test proper connection cleanup
  - Verify connected state becomes false after close
  - Test close when not connected (should not throw)

- [X] T014 [P] [US1] Unit test: MCPClient.isConnected() in `tests/mcp/client/mcp-client.spec.ts`
  - Test connection state tracking across lifecycle

### Implementation for User Story 1

- [X] T015 [US1] Implement MCPClient class in `source/mcp/client/mcp-client.ts`
  - Import Client and StdioClientTransport from MCP SDK
  - Implement constructor(name, version) with capabilities
  - Implement connect(serverCommand, serverArgs): Promise<void>
  - Implement listTools(): Promise<Tool[]>
  - Implement callTool<T>(name, args): Promise<T>
  - Implement close(): Promise<void>
  - Implement isConnected(): boolean
  - Handle all error cases (ConnectionError, ServerNotAvailableError)

- [X] T016 [US1] Implement useMCPClient hook in `source/hooks/use-mcp-client.ts`
  - useState for client, connected, error
  - useCallback for connect function
  - useEffect for autoConnect and cleanup
  - Return { client, connected, error, connect, disconnect }

- [X] T017 [P] [US1] Integration test: Full connection lifecycle in `tests/integration/mcp-client-lifecycle.spec.ts`
  - Test real connection to Playwright MCP server
  - Verify tool discovery works
  - Test connection cleanup
  - Measure session initialization time (target: < 5s per SC-001)

**Checkpoint**: At this point, User Story 1 should be fully functional - uxlint can connect to Playwright MCP server and maintain readiness

---

## Phase 4: User Story 2 - Comprehensive Page Analysis Operations (Priority: P2)

**Goal**: Enable uxlint to perform multiple types of page inspection: navigation, screenshots, structure extraction, and behavior examination

**Independent Test**: Can perform each inspection operation type independently and verify results are appropriate

### Tests for User Story 2 (MANDATORY per Constitution v1.1.0) ⚠️

**Strategy**: Unit tests (Ava) for PlaywrightClient, integration tests for real browser operations

- [X] T018 [P] [US2] Unit test: PlaywrightClient.navigate() in `tests/mcp/client/playwright-client.spec.ts`
  - Test successful navigation with valid URL
  - Verify NavigateResult structure (success, url, title, status)
  - Test navigation with invalid URL (should throw ToolInvocationError)
  - Test navigation timeout handling

- [X] T019 [P] [US2] Unit test: PlaywrightClient.screenshot() in `tests/mcp/client/playwright-client.spec.ts`
  - Test screenshot capture
  - Verify ScreenshotResult structure (screenshot, width, height, format)
  - Test screenshot size validation (< 10MB per data-model.md)

- [X] T020 [P] [US2] Unit test: PlaywrightClient.getSnapshot() in `tests/mcp/client/playwright-client.spec.ts`
  - Test accessibility tree snapshot
  - Verify SnapshotResult structure (snapshot JSON, timestamp)
  - Test snapshot size validation (< 5MB per data-model.md)

- [X] T021 [P] [US2] Unit test: PlaywrightClient.evaluate() in `tests/mcp/client/playwright-client.spec.ts`
  - Test JavaScript execution in page context
  - Test with safe scripts (document.title, window.location)
  - Test script safety validation (reject require, import, eval)

- [X] T022 [P] [US2] Integration test: Browser operations in `tests/integration/browser-operations.spec.ts`
  - Test navigate → screenshot flow
  - Test navigate → getSnapshot flow
  - Test navigate → evaluate flow
  - Verify operation latencies (SC-003: navigation < 10s, SC-004: screenshot < 3s, SC-005: snapshot < 2s, SC-006: evaluate < 5s)

### Implementation for User Story 2

- [X] T023 [US2] Implement PlaywrightClient class in `source/mcp/client/playwright-client.ts`
  - Constructor accepting MCPClient instance
  - Implement navigate(url): Promise<NavigateResult>
  - Implement screenshot(): Promise<ScreenshotResult>
  - Implement getSnapshot(): Promise<SnapshotResult>
  - Implement click(selector): Promise<void>
  - Implement fillForm(fields): Promise<void>
  - Implement evaluate(script): Promise<unknown>
  - Implement close(): Promise<void>
  - Add parameter validation before each tool call
  - Add 30s default timeout handling

- [X] T024 [US2] Implement useBrowserAutomation hook in `source/hooks/use-browser-automation.ts`
  - Use useMCPClient internally
  - useState for playwrightClient, loading, error
  - useEffect to create PlaywrightClient when MCPClient connects
  - useCallback wrappers for navigate, screenshot, getSnapshot, evaluate
  - Loading state management
  - Error state management
  - Return { navigate, screenshot, getSnapshot, evaluate, loading, error }

- [X] T025 [P] [US2] Integration test: Multiple operation types in `tests/integration/multi-operation.spec.ts`
  - Test all operation types sequentially on same page
  - Verify each operation returns correct data format
  - Test 50 sequential operations for performance degradation (SC-008)

**Checkpoint**: At this point, User Stories 1 AND 2 should work - uxlint can connect to Playwright and perform all inspection operations

---

## Phase 5: User Story 3 - Analysis Session Management (Priority: P3)

**Goal**: Enable uxlint to maintain consistent analysis sessions where multiple page inspections are performed efficiently

**Independent Test**: Can initiate session, perform multiple operations without reinitialization, query capabilities, and exit cleanly

### Tests for User Story 3 (MANDATORY per Constitution v1.1.0) ⚠️

**Strategy**: Integration tests for session lifecycle management

- [ ] T026 [P] [US3] Integration test: Session initialization in `tests/integration/session-management.spec.ts`
  - Test session starts within 5 seconds (SC-001)
  - Verify capabilities query completes within 2 seconds (SC-002)
  - Test session readiness check

- [ ] T027 [P] [US3] Integration test: Multi-page session in `tests/integration/multi-page-session.spec.ts`
  - Navigate to page A → screenshot → navigate to page B → screenshot
  - Verify no reinitialization between pages
  - Test session maintains state appropriately

- [ ] T028 [P] [US3] Integration test: Session cleanup in `tests/integration/session-cleanup.spec.ts`
  - Test proper resource release on close
  - Verify browser process terminates
  - Test cleanup after errors
  - Test recovery from interruptions (SC-010: within 3 attempts)

### Implementation for User Story 3

- [ ] T029 [US3] Enhance useMCPClient hook in `source/hooks/use-mcp-client.ts`
  - Add listTools() wrapper to expose available operations
  - Add getCapabilities() function
  - Add reconnect() function for error recovery
  - Track connection health
  - Implement automatic cleanup on unmount

- [ ] T030 [US3] Create session manager utility in `source/models/session-manager.ts`
  - SessionState type (initializing, ready, error, closed)
  - Session lifecycle tracking
  - Operation history tracking
  - Health check mechanism
  - Reconnection logic with retry (max 3 attempts per SC-010)

- [ ] T031 [P] [US3] Integration test: Session persistence in `tests/integration/session-persistence.spec.ts`
  - Test 50+ operations without performance degradation (SC-008)
  - Monitor memory usage over session lifetime
  - Verify consistent performance metrics

**Checkpoint**: All core session management features complete - sessions are efficient and maintain state

---

## Phase 6: User Story 4 - Parameterized Inspection Requests (Priority: P4)

**Goal**: Enable users to provide specific parameters for inspection operations (focus areas, viewport sizes, information extraction)

**Independent Test**: Can request inspections with various parameter combinations and verify system honors parameters

### Tests for User Story 4 (MANDATORY per Constitution v1.1.0) ⚠️

**Strategy**: Unit tests for parameter validation, integration tests for parameterized operations

- [ ] T032 [P] [US4] Unit test: Parameter validation in `tests/mcp/client/validators.spec.ts`
  - Test URL validation (WHATWG URL Standard)
  - Test CSS selector validation
  - Test JavaScript safety validation
  - Test timeout validation (1000-300000ms range)

- [ ] T033 [P] [US4] Integration test: Parameterized screenshot in `tests/integration/parameterized-screenshot.spec.ts`
  - Test fullPage parameter (true/false)
  - Test viewport size configuration
  - Test format parameter (png/jpeg)
  - Verify parameters affect output correctly

- [ ] T034 [P] [US4] Integration test: Parameterized snapshot in `tests/integration/parameterized-snapshot.spec.ts`
  - Test with focus area selectors
  - Test depth limits
  - Verify filtered snapshot contains only requested areas

- [ ] T035 [P] [US4] Integration test: Error handling in `tests/integration/parameter-errors.spec.ts`
  - Test invalid parameters produce clear error messages (SC-009: 100%)
  - Test malformed URLs
  - Test invalid selectors
  - Test unsafe scripts
  - Test timeout values out of range

### Implementation for User Story 4

- [ ] T036 [P] [US4] Enhance validator functions in `source/mcp/client/validators.ts`
  - Implement isValidUrl(url): boolean with WHATWG validation
  - Implement isValidSelector(selector): boolean with CSS validation
  - Implement isScriptSafe(script): boolean with safety checks
  - Implement isValidTimeout(timeout): boolean with range check
  - Add detailed error messages for validation failures

- [ ] T037 [US4] Enhance PlaywrightClient in `source/mcp/client/playwright-client.ts`
  - Add optional parameters to screenshot (fullPage, format)
  - Add optional parameters to getSnapshot (focusArea)
  - Add parameter validation before all tool calls
  - Throw descriptive errors for invalid parameters

- [ ] T038 [US4] Create InspectionOptions types in `source/mcp/client/types.ts`
  - ScreenshotOptions interface (fullPage, format, timeout)
  - SnapshotOptions interface (focusArea, maxDepth, timeout)
  - NavigateOptions interface (waitUntil, timeout)
  - EvaluateOptions interface (timeout)

- [ ] T039 [US4] Update useBrowserAutomation hook in `source/hooks/use-browser-automation.ts`
  - Accept options parameters for all operations
  - Pass validated options to PlaywrightClient
  - Return clear error messages for parameter failures

- [ ] T040 [P] [US4] Integration test: Complex parameter scenarios in `tests/integration/complex-parameters.spec.ts`
  - Test multiple operations with different parameter sets
  - Verify each operation uses correct parameters independently
  - Test parameter validation doesn't affect session state

**Checkpoint**: All user stories complete - full parameterized inspection capability ready

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and prepare for production

- [ ] T041 [P] Add comprehensive JSDoc comments to all public APIs in `source/mcp/client/*.ts`
- [ ] T042 [P] Create configuration documentation in `source/config/README.md`
- [ ] T043 Create end-to-end example in `tests/integration/e2e-example.spec.ts` demonstrating full uxlint flow
- [ ] T044 [P] Add error recovery examples in `source/examples/error-recovery.ts`
- [ ] T045 [P] Add performance monitoring utilities in `source/utils/performance.ts`
- [ ] T046 Review and optimize timeout configurations based on success criteria
- [ ] T047 Run full test suite with coverage report (target: 80% per Constitution v1.1.0)
- [ ] T048 Run quickstart.md validation (verify all examples work)
- [ ] T049 [P] Update main README.md with MCP integration documentation
- [ ] T050 Run code quality gates: `npm run compile && npm run format && npm run lint`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion (T001-T005) - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (T006-T009) - Can start after Phase 2
- **User Story 2 (Phase 4)**: Depends on Foundational (T006-T009) and User Story 1 (T015-T016) - PlaywrightClient wraps MCPClient
- **User Story 3 (Phase 5)**: Depends on User Story 1 (T015-T016) - Session management uses MCPClient
- **User Story 4 (Phase 6)**: Depends on User Story 2 (T023-T024) - Parameterization extends PlaywrightClient
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Setup (Phase 1)
    ↓
Foundational (Phase 2) ← BLOCKS ALL STORIES
    ↓
User Story 1 (P1) ← MVP starts here
    ↓
User Story 2 (P2) ← Extends US1
    ↓
User Story 3 (P3) ← Extends US1
    ↓
User Story 4 (P4) ← Extends US2
    ↓
Polish (Phase 7)
```

### Within Each User Story

1. Tests MUST be written FIRST and FAIL
2. Implementation follows (tests should then PASS)
3. Integration tests verify end-to-end behavior
4. Story complete before moving to next priority

### Parallel Opportunities

#### Phase 1 (Setup)
- T002 and T003 can run in parallel (different dependencies)

#### Phase 2 (Foundational)
- T006, T007, T008, T009 can run in parallel (different files)

#### Phase 3 (User Story 1 Tests)
- T010, T011, T012, T013, T014 can run in parallel (same test file but different test cases)

#### Phase 4 (User Story 2 Tests)
- T018, T019, T020, T021, T022 can run in parallel (different test files)

#### Phase 5 (User Story 3 Tests)
- T026, T027, T028 can run in parallel (different test files)

#### Phase 6 (User Story 4 Tests)
- T032, T033, T034, T035 can run in parallel (different test files)
- T036, T038 can run in parallel (different files: validators.ts vs types.ts)

#### Phase 7 (Polish)
- T041, T042, T044, T045, T049 can run in parallel (different files)

---

## Parallel Example: User Story 1 MVP

```bash
# Step 1: Write all tests in parallel (ensure they FAIL)
Task T010: "Unit test: MCPClient constructor"
Task T011: "Unit test: MCPClient.connect()"
Task T012: "Unit test: MCPClient.listTools()"
Task T013: "Unit test: MCPClient.close()"
Task T014: "Unit test: MCPClient.isConnected()"

# Step 2: Implement (tests should now PASS)
Task T015: "Implement MCPClient class"
Task T016: "Implement useMCPClient hook"

# Step 3: Integration test
Task T017: "Integration test: Full connection lifecycle"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T005)
2. Complete Phase 2: Foundational (T006-T009) - CRITICAL
3. Complete Phase 3: User Story 1 (T010-T017)
4. **STOP and VALIDATE**: Test US1 independently
5. Deploy/demo basic MCP connection capability

**Estimated Tasks**: 17 tasks for MVP
**Estimated Effort**: 2-3 days for experienced TypeScript developer

### Incremental Delivery

1. **Foundation Ready** (T001-T009): MCP infrastructure in place
2. **MVP** (+ T010-T017): Basic connection and readiness ✅
3. **Full Inspection** (+ T018-T025): All operation types ✅
4. **Session Management** (+ T026-T031): Efficient multi-page analysis ✅
5. **Parameterization** (+ T032-T040): Full flexibility ✅
6. **Production Ready** (+ T041-T050): Polish and documentation ✅

### Parallel Team Strategy

With 3 developers after Foundational phase (T009):

- **Developer A**: User Story 1 (T010-T017) - 1-2 days
- **Developer B**: User Story 3 (T026-T031) once US1 done - 1 day
- **Developer C**: User Story 2 (T018-T025) once US1 done - 2 days

Then User Story 4 (T032-T040) - 2 days

**Total parallel time**: ~5-6 days vs 8-10 days sequential

---

## Success Metrics

Based on Success Criteria from spec.md:

- **SC-001**: Session initialization < 5s (verify in T026)
- **SC-002**: Capability discovery < 2s (verify in T026)
- **SC-003**: Page navigation < 10s (verify in T022)
- **SC-004**: Screenshot capture < 3s (verify in T022)
- **SC-005**: Snapshot extraction < 2s (verify in T022)
- **SC-006**: Evaluate operation < 5s (verify in T022)
- **SC-007**: 100% success rate normal conditions (verify in all integration tests)
- **SC-008**: 50+ operations without degradation (verify in T031)
- **SC-009**: 100% graceful error handling (verify in T035)
- **SC-010**: Recovery within 3 attempts (verify in T028)

---

## Notes

- [P] tasks = different files, no dependencies, can run in parallel
- [Story] label (US1, US2, US3, US4) maps task to specific user story
- Each user story should be independently completable and testable
- Tests MUST be written BEFORE implementation (Constitution v1.1.0 II)
- Verify tests fail initially (red phase)
- Run `npm run compile && npm run format && npm run lint` after each implementation task (Constitution v1.1.0 I)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Target 80% code coverage (Constitution v1.1.0 II)
- No linting bypasses allowed (Constitution v1.1.0 I)

---

## Total Task Count

- **Phase 1 (Setup)**: 5 tasks
- **Phase 2 (Foundational)**: 4 tasks (BLOCKING)
- **Phase 3 (User Story 1)**: 8 tasks (5 tests + 2 impl + 1 integration)
- **Phase 4 (User Story 2)**: 8 tasks (5 tests + 2 impl + 1 integration)
- **Phase 5 (User Story 3)**: 6 tasks (3 tests + 2 impl + 1 integration)
- **Phase 6 (User Story 4)**: 9 tasks (4 tests + 4 impl + 1 integration)
- **Phase 7 (Polish)**: 10 tasks

**Total**: 50 tasks

**MVP Scope**: Phases 1-3 = 17 tasks
**Full Feature Scope**: Phases 1-7 = 50 tasks

---

## Suggested MVP Scope

**Phases 1-3 (User Story 1 only)**: 17 tasks

This provides:
- ✅ MCP client connection to Playwright server
- ✅ Session initialization and readiness check
- ✅ Tool discovery capability
- ✅ Connection lifecycle management
- ✅ Basic error handling
- ✅ Foundation for all other stories

**What's NOT in MVP** (deliver in later increments):
- Page inspection operations (US2)
- Multi-page session efficiency (US3)
- Parameter customization (US4)

This MVP enables the team to validate the MCP integration architecture before building out all inspection operations.
