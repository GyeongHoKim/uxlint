---

description: "Task list for 005-devtools-mcp-swap"
---

# Tasks: Single Browser Server — Swap to chrome-devtools-mcp

**Input**: Design documents from `/specs/005-devtools-mcp-swap/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included and mandatory. Constitution II (Test-First Development) is non-negotiable — tests are written and must fail before implementation. This is not an optional TDD election.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are given in every task

## Path Conventions

Single project: `source/` and `tests/` at repository root, compiled to `dist/`. Ava runs against `dist/`, so `npm run build` precedes any test run.

---

## Phase 1: Baseline (BLOCKING — must complete on `main`, before any source change)

**Purpose**: SC-001 and SC-007 compare against the current release. Once the swap lands this evidence is unrecoverable.

**⚠️ This phase runs on `main`, not on the feature branch.** 004's lesson was that the first act of measuring is what finds the environment problems; do not defer it.

- [ ] T001 Define the fixed baseline target set (publicly reachable, reproducible on another machine) and record it with the rationale in `specs/005-devtools-mcp-swap/baseline.md`
- [ ] T002 On `main`, run analysis three times against the target set and record per page — status, snapshot length, finding count, wall-clock ms — in `specs/005-devtools-mcp-swap/baseline.md`
- [ ] T003 Compute and record median per-page wall-clock and the derived SC-007 threshold (baseline × 1.2) in `specs/005-devtools-mcp-swap/baseline.md`

**Checkpoint**: Baseline exists and is committed. Every later claim about "no regression" is now falsifiable.

---

## Phase 2: Setup (Dependency)

**Purpose**: Bring the pinned server in; take nothing out yet.

- [ ] T004 Add `chrome-devtools-mcp` at exact version `1.7.0` (no range specifier) to `dependencies` in `package.json`, and run `npm install` to update `package-lock.json`
- [ ] T005 Extract the pinned server's stated minimum Chrome version from the installed package and record it in `specs/005-devtools-mcp-swap/research.md` under R7 — do not invent a floor (plan.md, Open Risks)
- [ ] T006 [P] Enumerate per-platform default Chrome install paths (Linux, macOS, Windows) and record them in `specs/005-devtools-mcp-swap/research.md` — Phase 0 evidence is Linux-only

**Checkpoint**: The dependency resolves offline and the version floor is sourced rather than guessed.

---

## Phase 3: Foundational (Blocking prerequisites for all user stories)

**Purpose**: The swap itself. No user story can be verified until the new server drives analysis.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

### Tests first

- [ ] T007 [P] Write failing tests in `tests/services/mcp-client.spec.ts` asserting the launch argument vector against `contracts/mcp-launch.md`: `--headless`, `--isolated`, `--no-performance-crux`, `--no-usage-statistics` all present; `--slim` absent; no floating version reference; `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` present in env; `stderr` disposition set explicitly
- [ ] T008 [P] Write a failing test in `tests/services/mcp-client.spec.ts` asserting the server entry point is resolved from the installed dependency and the spawn command is never `npx`

### Implementation

- [ ] T009 Rewrite `source/services/mcp-client.ts` to launch `chrome-devtools-mcp` over stdio with the static argument vector and environment from `contracts/mcp-launch.md`, replacing the `npx @playwright/mcp@latest` transport
- [ ] T010 Set the transport's `stderr` disposition explicitly in `source/services/mcp-client.ts` and pipe the server's startup banner into the Winston logger — the `@ai-sdk/mcp` default is `inherit`, which writes five lines into the Ink render and into a reserved stream (research R4)
- [ ] T011 Replace `experimental_createMCPClient` with `createMCPClient` in `source/services/mcp-client.ts`; leave `Experimental_StdioMCPTransport` as-is, since no non-experimental alias exists (roadmap 0.1, absorbed here)
- [ ] T012 Update the analysis prompt in `source/services/ai-service.ts` — `browser_navigate` → `navigate_page`, `browser_snapshot` → `take_snapshot`, in `buildUserPrompt()` and in the `setPageSnapshot` tool description
- [ ] T013 [P] Update tool-name fixtures in `tests/models/llm-response.spec.ts`
- [ ] T014 [P] Update tool-name fixtures in `tests/components/llm-response-display.spec.tsx`
- [ ] T015 [P] Update tool-name fixtures in `tests/components/analysis-progress.spec.tsx`
- [ ] T016 Remove the stale sequential-processing comment naming Playwright and `browser_navigate` in `source/ci-runner.ts` (lines ~113–117), keeping the reasons that still hold

**Checkpoint**: Analysis runs on the new server. US1 becomes verifiable.

---

## Phase 4: User Story 1 — The analysis keeps working after the engine change (P1) 🎯 MVP

**Goal**: A user's existing configuration produces the same kind of report it did before.

**Independent test**: Re-run the Phase 1 target set and confirm every structural property of the baseline still holds.

- [ ] T017 [US1] Run the baseline target set on the feature branch three times and record results alongside the Phase 1 numbers in `specs/005-devtools-mcp-swap/baseline.md`
- [ ] T018 [US1] Verify SC-001 — no page moved from completed to partial or failed versus baseline — and record the comparison in `specs/005-devtools-mcp-swap/baseline.md`
- [ ] T019 [US1] Verify SC-002 — every completed page carries a non-empty snapshot — and record it in `specs/005-devtools-mcp-swap/baseline.md`
- [ ] T020 [US1] Verify SC-007 — median per-page wall-clock within 20% of the threshold recorded in T003 — and record the result in `specs/005-devtools-mcp-swap/baseline.md`; a larger regression must be explained before proceeding, not after (Constitution IV)
- [ ] T021 [US1] Confirm findings remain attributed to the correct page URL across a multi-page run (US1 scenario 4) from the reports recorded in T017, and note the result in `specs/005-devtools-mcp-swap/baseline.md`
- [ ] T022 [US1] Confirm the interactive terminal still reports navigation, capture and analysis activity (US1 scenario 5) by running `node dist/cli.js --interactive`, and note the result in `specs/005-devtools-mcp-swap/baseline.md`

**Checkpoint**: MVP. The swap is behaviour-preserving and proven so against recorded numbers.

---

## Phase 5: User Story 2 — An environment without a usable browser fails immediately and says why (P1)

**Goal**: Preflight stops a doomed run before any model request, with a message the user can act on.

**Independent test**: Run with no browser present; confirm a non-zero exit before analysis, zero model tokens, and a message naming the missing browser.

### Tests first

- [ ] T023 [P] [US2] Write failing unit tests in `tests/models/browser-preflight.spec.ts` for verdict construction and message rendering: `browser-absent` lists searched paths and a remedy; `browser-too-old` carries detected **and** required versions; `browser-unstartable` carries Chrome's stderr verbatim; `ready-without-sandbox` carries a non-empty cause
- [ ] T024 [P] [US2] Write a failing unit test in `tests/models/browser-preflight.spec.ts` asserting that an **unrecognised** launch failure yields `browser-unstartable` and never `ready-without-sandbox` — guessing "probably sandbox" would disable a security protection for an unrelated fault (contracts/browser-preflight.md)
- [ ] T025 [P] [US2] Write failing service tests in `tests/services/browser-preflight.spec.ts` using an injected process runner, covering both sandbox signatures measured in research R8 (`Running as root without --no-sandbox`, `Failed to move to new namespace … Operation not permitted`); no test may spawn a real browser
- [ ] T026 [P] [US2] Write a failing test in `tests/services/ci-runner.spec.ts` (or the existing CI runner spec) asserting that an `unmet` verdict exits non-zero with **zero** calls to the AI service — the injectable `CIAnalysisDependencies` already supports this
- [ ] T027 [P] [US2] Write a failing integration test in `tests/integration/browser-preflight.spec.ts` that performs a real probe and skips cleanly when no browser is present

### Implementation

- [ ] T028 [US2] Create `source/models/browser-preflight.ts` with the `PreflightVerdict` union, `UnmetRequirement` kinds and message rendering per `data-model.md` §2
- [ ] T029 [US2] Create `source/services/browser-preflight.ts` implementing step 1 (resolve → `--version` → floor check) with the process runner injected, per `contracts/browser-preflight.md`
- [ ] T030 [US2] Implement step 2 (launch probe with no sandbox flag, classify stderr) in `source/services/browser-preflight.ts`, returning `ready`, `ready-without-sandbox` or `browser-unstartable`
- [ ] T031 [US2] Support a user-configured executable path in `source/models/config.ts` and `source/services/browser-preflight.ts`, reporting a supplied-but-missing path as a bad setting rather than a missing install (FR-008)
- [ ] T032 [US2] Make `getMCPClient()` in `source/services/mcp-client.ts` take the preflight verdict and add `--chromeArg=--no-sandbox` if and only if the verdict is `ready-without-sandbox` (FR-009)
- [ ] T033 [US2] Add `--executablePath` to the launch spec in `source/services/mcp-client.ts` when the user configured one
- [ ] T034 [US2] Call preflight in `source/ci-runner.ts` before the AI service is created; on `unmet`, write the message through `infrastructure/console-output.ts` and exit non-zero before any model request (FR-005, FR-006)
- [ ] T035 [US2] Emit the sandbox relaxation notice on `ready-without-sandbox` in `source/ci-runner.ts` (FR-009)
- [ ] T036 [US2] Render preflight failure guidance in the Ink UI in `source/cli.tsx` — not a stack trace, not a hang (US2 scenario 2)
- [ ] T037 [US2] Record a mid-run browser loss as a failure of the affected page, leaving earlier pages and the report intact, in `source/services/ai-service.ts` (FR-016, US2 scenario 6)

### Verification

- [ ] T038 [US2] Verify SC-003 in an environment with no browser: non-zero exit within 5 seconds, zero model tokens; record the measurement in `specs/005-devtools-mcp-swap/baseline.md`
- [ ] T039 [US2] Verify SC-004 across all three container cases from `quickstart.md` §3 — root, **non-root**, and sandbox-works — confirming the notice appears in the first two and is absent in the third

**Checkpoint**: The cost the swap imposes is handled, and handled for non-root containers too.

---

## Phase 6: User Story 3 — Private URLs stay private (P2)

**Goal**: Nothing derived from the analysed URL reaches a third party by default.

**Independent test**: Run against a local target while observing outbound traffic; confirm no request carries the analysed URL anywhere but the target.

### Tests first

- [ ] T040 [P] [US3] Write failing tests in `tests/services/mcp-client.spec.ts` asserting `--no-performance-crux` and `--no-usage-statistics` are present by default and absent only under explicit opt-in (FR-012, FR-013)
- [ ] T041 [P] [US3] Write a failing test in `tests/services/mcp-client.spec.ts` asserting `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` is set in the server environment — without it the dependency fetches the npm registry from a detached child on startup (research R2)

### Implementation

- [ ] T042 [US3] Add the external-data opt-in setting to `source/models/config.ts` and its validation to `source/infrastructure/config/`, defaulting to off (FR-012)
- [ ] T043 [US3] Thread the opt-in through to the launch spec in `source/services/mcp-client.ts`

### Verification

- [ ] T044 [US3] Verify SC-005 with outbound observation per `quickstart.md` §4: zero requests carrying the analysed URL to the Google CrUX API, Google usage statistics, or `registry.npmjs.org`

**Checkpoint**: The property no user could detect for themselves is proven.

---

## Phase 7: User Story 4 — A run that can be explained later (P2)

**Goal**: A report found weeks later states what produced it, and runs need no registry access.

**Independent test**: Run twice on the same machine; both report the same server version, and a network-isolated run still succeeds.

### Tests first

- [ ] T045 [P] [US4] Write failing tests in `tests/services/report-builder.spec.ts` asserting run provenance is present in `ReportMetadata` for every report — including a run where every page failed — per `data-model.md` §4
- [ ] T046 [P] [US4] Write a failing test in `tests/services/report-builder.spec.ts` asserting every pre-existing `ReportMetadata` field keeps its name, type and meaning (FR-003)

### Implementation

- [ ] T047 [US4] Add the `tooling` provenance field to `ReportMetadata` in `source/models/analysis.ts` — server identity, server version, browser version, `externalDataConsulted` — as an addition only
- [ ] T048 [US4] Populate provenance in `source/services/report-builder.ts`, taking the browser version from the preflight verdict and `externalDataConsulted` from the setting (FR-011, FR-014)

### Verification

- [ ] T049 [US4] Verify SC-006 and SC-010 per `quickstart.md` §5: two runs report the same server version, and a `--network none` run completes with no registry lookup

**Checkpoint**: Reports explain themselves and runs work offline.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T050 Remove `@playwright/mcp` from `package.json` if present and delete every remaining reference in `source/`, `tests/` and docs (FR-001)
- [ ] T051 Verify SC-009: `grep -ri "playwright" source/ tests/ README.md package.json` returns no matches
- [ ] T052 [P] Document the Chrome requirement, minimum version, container guidance and what a run transmits externally in `README.md` (FR-017)
- [ ] T053 [P] Document the TLS tolerance setting and its default in `README.md` (FR-015)
- [ ] T054 [P] Document the external-data opt-in and the executable path setting in `README.md`
- [ ] T055 Make TLS tolerance an explicit setting in `source/models/config.ts` mapped to `--acceptInsecureCerts`, defaulting to today's tolerant behaviour (FR-015, confirmed in clarification)
- [ ] T056 Verify SC-008: preflight adds ≤1 second in a passing environment; record the measurement in `specs/005-devtools-mcp-swap/baseline.md`
- [ ] T057 Confirm coverage of the new files (`source/models/browser-preflight.ts`, `source/services/browser-preflight.ts`, `source/services/mcp-client.ts`) meets the 80% threshold via `npm run test:coverage`, whose thresholds live in `package.json` (Constitution II)
- [ ] T058 Run the full quality gate from the repository root: `npm run compile && npm run format && npm run lint`, then `npm test` in full before pushing — build-dependent lint rules only fire after a build, which produced a local-green/CI-red in 004

---

## Dependencies & Execution Order

```text
Phase 1 (Baseline, on main)  ──┐
                               ├──> Phase 3 (Foundational: the swap)
Phase 2 (Setup: dependency)  ──┘              │
                                              ├──> Phase 4 (US1) ── MVP
                                              ├──> Phase 5 (US2)
                                              ├──> Phase 6 (US3)
                                              └──> Phase 7 (US4)
                                                        │
                                                        └──> Phase 8 (Polish)
```

**Story independence after Phase 3**:

- **US1** depends on Phase 3 only. It is the MVP and can ship alone.
- **US2** depends on Phase 3. Independent of US3 and US4.
- **US3** depends on Phase 3. Its launch-argument tests (T040–T041) touch the same file as T007, so sequence those against Phase 3 rather than running them concurrently.
- **US4** depends on Phase 3 for the server version, and on US2 (T028–T030) for the browser version in provenance. Provenance can land with a placeholder browser version if US4 is taken before US2, but taking US2 first avoids the rework.

**Sequencing note**: T032 modifies `source/services/mcp-client.ts`, which T009–T011 create. Do not parallelise across that boundary.

## Parallel Opportunities

- **Phase 2**: T006 runs alongside T004–T005.
- **Phase 3 tests**: T007 and T008 together; then T013, T014, T015 together (three separate fixture files).
- **Phase 5 tests**: T023, T024, T025, T026, T027 all together — five different files.
- **Phase 6/7 tests**: T040–T041 together; T045–T046 together.
- **Phase 8 docs**: T052, T053, T054 together.

## Implementation Strategy

**MVP scope**: Phases 1–4. That delivers a working swap, proven behaviour-preserving against recorded numbers, on the developer machines and CI images that already have Chrome.

**Do not ship the MVP alone.** Phase 5 (US2) is equally P1 in the spec for a reason: without preflight, the MVP converts a working slim-container CI job into one that burns twenty model round-trips and reports a `partial` page with no mention of a browser. The MVP is an internal checkpoint, not a release.

**Recommended order**: Phase 1 → 2 → 3 → 4 → 5 → 7 → 6 → 8. US4 before US3 because provenance is cheap once preflight exists, and US3's verification needs outbound traffic observation that is best done once, late, against the final launch arguments.
