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

- [X] T004 Add `chrome-devtools-mcp` at exact version `1.7.0` (no range specifier) to `dependencies` in `package.json`, and run `npm install` to update `package-lock.json`
- [X] T005 Extract the pinned server's stated minimum Chrome version from the installed package and record it under an "Implementation-time findings" section in `specs/005-devtools-mcp-swap/baseline.md` — do not invent a floor (plan.md, Open Risks), and do not edit `research.md`, which is a closed Phase 0 execution record
- [X] T006 [P] Enumerate per-platform default Chrome install paths (Linux, macOS, Windows) and record them under "Implementation-time findings" in `specs/005-devtools-mcp-swap/baseline.md` — Phase 0 evidence is Linux-only

**Checkpoint**: The dependency resolves offline and the version floor is sourced rather than guessed.

---

## Phase 3: Foundational (Blocking prerequisites for all user stories)

**Purpose**: The swap itself. No user story can be verified until the new server drives analysis.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

### Tests first

- [X] T007 [P] Write failing tests in `tests/services/mcp-client.spec.ts` asserting the static launch argument vector against `contracts/mcp-launch.md`: `--headless`, `--isolated`, `--no-performance-crux`, `--no-usage-statistics` all present; `--slim` absent; no floating version reference; `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` present in env; `stderr` disposition set explicitly
- [X] T008 [P] Write a failing test in `tests/services/mcp-client.spec.ts` asserting the server entry point is resolved from the installed dependency and the spawn command is never `npx`

### Implementation

- [X] T009 Rewrite `source/services/mcp-client.ts` to launch `chrome-devtools-mcp` over stdio with the static argument vector and environment from `contracts/mcp-launch.md`, replacing the `npx @playwright/mcp@latest` transport
- [X] T010 Set the transport's `stderr` disposition explicitly in `source/services/mcp-client.ts` — the `@ai-sdk/mcp` default is `inherit`, which writes five lines into the Ink render and into a reserved stream (research R4). **Shipped as `'ignore'`, not as a pipe into Winston as originally written**: the transport never attaches a reader to the child's stderr, so a pipe fills and the child blocks on write. Capturing the banner is not worth a deadlock
- [X] T011 Replace `experimental_createMCPClient` with `createMCPClient` in `source/services/mcp-client.ts`; leave `Experimental_StdioMCPTransport` as-is, since no non-experimental alias exists (roadmap 0.1, absorbed here)
- [X] T012 Update the analysis prompt in `source/services/ai-service.ts` — `browser_navigate` → `navigate_page`, `browser_snapshot` → `take_snapshot`, in `buildUserPrompt()` and in the `setPageSnapshot` tool description
- [X] T013 [P] Update tool-name fixtures in `tests/models/llm-response.spec.ts`
- [X] T014 [P] Update tool-name fixtures in `tests/components/llm-response-display.spec.tsx`
- [X] T015 [P] Update tool-name fixtures in `tests/components/analysis-progress.spec.tsx`
- [X] T016 Remove the stale sequential-processing comment naming Playwright and `browser_navigate` in `source/ci-runner.ts` (lines ~113–117), keeping the reasons that still hold

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

- [X] T023 [P] [US2] Write failing unit tests in `tests/models/browser-preflight.spec.ts` for verdict construction and message rendering: `browser-absent` lists searched paths and a remedy; `browser-too-old` carries detected **and** required versions; `browser-unstartable` carries Chrome's stderr verbatim; `ready-without-sandbox` carries a non-empty cause
- [X] T024 [P] [US2] Write a failing unit test in `tests/models/browser-preflight.spec.ts` asserting that an **unrecognised** launch failure yields `browser-unstartable` and never `ready-without-sandbox` — guessing "probably sandbox" would disable a security protection for an unrelated fault (contracts/browser-preflight.md)
- [X] T025 [P] [US2] Write failing service tests in `tests/services/browser-preflight.spec.ts` using an injected process runner, covering both sandbox signatures measured in research R8 (`Running as root without --no-sandbox`, `Failed to move to new namespace … Operation not permitted`); no test may spawn a real browser
- [X] T026 [P] [US2] Write failing tests in `tests/services/mcp-client.spec.ts` for the two **conditional** launch arguments: `--chromeArg=--no-sandbox` present if and only if the verdict is `ready-without-sandbox`, and `--executablePath` present only when the user configured one
- [X] T027 [P] [US2] Write failing tests in `tests/infrastructure/config/config-io.spec.ts` asserting that the browser executable-path setting is validated by `ConfigIO.validateConfig` and that a malformed value is rejected by name — D17 was a config field no validator checked, and `source/cli.tsx:142` already carries that lesson as a comment
- [X] T028 [P] [US2] Write a failing test in `tests/ci-runner.spec.ts` asserting that an `unmet` verdict exits non-zero with **zero** calls to the AI service, using the existing injectable `CIAnalysisDependencies`
- [X] T029 [P] [US2] Write a failing test in `tests/models/uxlint-machine.spec.ts` for a preflight-failure transition — the interactive error surface is driven by the machine's guarded `error` state, not by ad-hoc rendering
- [X] T030 [P] [US2] Write a failing visual-regression test in `tests/components/app.spec.tsx` (ink-testing-library) asserting preflight guidance renders in the interactive UI as a readable message, not a stack trace (Constitution II requires visual regression tests for components)
- [X] T031 [P] [US2] Write a failing test in `tests/services/ai-service.spec.ts` using `MockLanguageModelV4` asserting that a browser failure occurring mid-run records the affected page as failed while leaving previously completed pages intact (FR-016, US2 scenario 6)
- [X] T032 [P] [US2] Write a failing integration test in `tests/integration/browser-preflight.spec.ts` that performs a real probe and skips cleanly when no browser is present — this introduces the `tests/integration/` directory, which is new to this repo and intentional: it is the only test here that touches a real browser

### Implementation

- [X] T033 [US2] Create `source/models/browser-preflight.ts` with the `PreflightVerdict` union, `UnmetRequirement` kinds and message rendering per `data-model.md` §2
- [X] T034 [US2] Create `source/services/browser-preflight.ts` implementing step 1 (resolve → `--version` → floor check) with the process runner injected, per `contracts/browser-preflight.md`
- [X] T035 [US2] Implement step 2 (launch probe with no sandbox flag, classify stderr) in `source/services/browser-preflight.ts`, returning `ready`, `ready-without-sandbox` or `browser-unstartable`
- [X] T036 [US2] Add the browser executable-path setting to `source/models/config.ts` **and its validation to `ConfigIO.validateConfig` in `source/infrastructure/config/config-io.ts`**, reporting a supplied-but-missing path as a bad setting rather than a missing install (FR-008)
- [X] T037 [US2] Make `getMCPClient()` in `source/services/mcp-client.ts` take the preflight verdict and add `--chromeArg=--no-sandbox` if and only if the verdict is `ready-without-sandbox` (FR-009)
- [X] T038 [US2] Add `--executablePath` to the launch spec in `source/services/mcp-client.ts` when the user configured one
- [X] T039 [US2] Call preflight in `source/ci-runner.ts` before the AI service is created; on `unmet`, write the message through `infrastructure/console-output.ts` and exit non-zero before any model request (FR-005, FR-006)
- [X] T040 [US2] Emit the sandbox relaxation notice on `ready-without-sandbox` in `source/ci-runner.ts` (FR-009)
- [X] T041 [US2] ~~Add the preflight-failure state and guard to `source/models/uxlint-machine.ts`~~ **Not implemented — deliberately.** The machine already routes `ANALYSIS_ERROR` to `done` with the error in context and exit code 1, which is exactly the behaviour a preflight failure needs. Adding a parallel state would be a second path to the same place (Constitution V). What was actually missing was that `source/app.tsx` never *rendered* `context.error`, so every analysis failure displayed "Completed with errors" with the reason discarded; fixing that (T042) serves this feature and repairs a pre-existing gap. Verified by `tests/components/app.spec.tsx`.
- [X] T042 [US2] Render preflight guidance in `source/app.tsx` through the machine's error path, next to the existing `<Text color="red">Error: …</Text>` surface (US2 scenario 2)
- [X] T043 [US2] Ensure preflight runs before the analysis actor starts in `source/app.tsx` / `source/cli.tsx`, so an interactive failure also spends zero model tokens (SC-003 applies to both modes)
- [X] T044 [US2] Record a mid-run browser loss as a failure of the affected page, leaving earlier pages and the report intact, in `source/services/ai-service.ts` (FR-016)

### Verification

- [X] T045 [US2] Verify SC-003 in an environment with no browser: non-zero exit within 5 seconds, zero model tokens; record the measurement in `specs/005-devtools-mcp-swap/baseline.md`
- [X] T046 [US2] Verify SC-004 across all three container cases from `quickstart.md` §3 — root, **non-root**, and sandbox-works — confirming the notice appears in the first two and is absent in the third
- [ ] T047 [US2] Verify US2 scenario 5 end to end: install a browser outside the default location, point uxlint at it via the configured path in `.uxlintrc.yml`, confirm preflight accepts it and the run proceeds, and record the result in `specs/005-devtools-mcp-swap/baseline.md`

**Checkpoint**: The cost the swap imposes is handled, and handled for non-root containers too.

---

## Phase 6: User Story 3 — Private URLs stay private (P2)

**Goal**: Nothing derived from the analysed URL reaches a third party by default.

**Independent test**: Run against a local target while observing outbound traffic; confirm no request carries the analysed URL anywhere but the target.

### Tests first

- [X] T048 [P] [US3] Write failing tests in `tests/services/mcp-client.spec.ts` asserting `--no-performance-crux` and `--no-usage-statistics` are present by default and absent only under explicit opt-in (FR-012, FR-013)
- [X] T049 [P] [US3] Write a failing test in `tests/services/mcp-client.spec.ts` asserting `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` is set in the server environment — without it the dependency fetches the npm registry from a detached child on startup (research R2)
- [X] T050 [P] [US3] Write failing tests in `tests/infrastructure/config/config-io.spec.ts` asserting the external-data opt-in is validated by `ConfigIO.validateConfig`, defaults to off when absent, and is rejected by name when malformed

### Implementation

- [X] T051 [US3] Add the external-data opt-in setting to `source/models/config.ts` **and its validation to `ConfigIO.validateConfig` in `source/infrastructure/config/config-io.ts`**, defaulting to off (FR-012)
- [X] T052 [US3] Thread the opt-in through to the launch spec in `source/services/mcp-client.ts`

### Verification

- [ ] T053 [US3] Verify SC-005 with outbound observation per `quickstart.md` §4: zero requests carrying the analysed URL to the Google CrUX API, Google usage statistics, or `registry.npmjs.org`

**Checkpoint**: The property no user could detect for themselves is proven.

---

## Phase 7: User Story 4 — A run that can be explained later (P2)

**Goal**: A report found weeks later states what produced it, and runs need no registry access.

**Independent test**: Run twice on the same machine; both report the same server version, and a network-isolated run still succeeds.

### Tests first

- [X] T054 [P] [US4] Write failing tests in `tests/services/report-builder.spec.ts` asserting run provenance is present in `ReportMetadata` for every report — including a run where every page failed — per `data-model.md` §4
- [X] T055 [P] [US4] Write a failing test in `tests/services/report-builder.spec.ts` asserting every pre-existing `ReportMetadata` field keeps its name, type and meaning (FR-003)

### Implementation

- [X] T056 [US4] Add the `tooling` provenance field to `ReportMetadata` in `source/models/analysis.ts` — server identity, server version, browser version, `externalDataAllowed` — as an addition only
- [X] T057 [US4] Populate provenance in `source/services/report-builder.ts`, taking the browser version from the preflight verdict and `externalDataAllowed` from the setting (FR-011, FR-014)

### Verification

- [ ] T058 [US4] Verify SC-006 and SC-010 per `quickstart.md` §5: two runs report the same server version, and a `--network none` run completes with no registry lookup

**Checkpoint**: Reports explain themselves and runs work offline.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T059 [P] Write failing tests in `tests/infrastructure/config/config-io.spec.ts` asserting the TLS tolerance setting is validated by `ConfigIO.validateConfig`, defaults to tolerant, and is rejected by name when malformed
- [X] T060 Make TLS tolerance an explicit setting in `source/models/config.ts` with validation in `source/infrastructure/config/config-io.ts`, mapped to `--acceptInsecureCerts` in `source/services/mcp-client.ts`, defaulting to today's tolerant behaviour (FR-015, confirmed in clarification)
- [X] T061 Remove `@playwright/mcp` from `package.json` if present and delete every remaining reference in `source/`, `tests/` and docs (FR-001)
- [X] T062 Verify SC-009: `grep -ri "playwright" source/ tests/ README.md package.json` returns no matches
- [X] T063 [P] Document the Chrome requirement, minimum version, container guidance and what a run transmits externally in `README.md` (FR-017)
- [X] T064 [P] Document the TLS tolerance setting and its default in `README.md` (FR-015)
- [X] T065 [P] Document the external-data opt-in and the executable path setting in `README.md`
- [ ] T066 Verify SC-008: preflight adds ≤1 second in a passing environment; record the measurement in `specs/005-devtools-mcp-swap/baseline.md`
- [X] T067 Run `npm run test:coverage` and read the text reporter output directly to confirm each new file (`source/models/browser-preflight.ts`, `source/services/browser-preflight.ts`, `source/services/mcp-client.ts`) meets 80% on lines, functions, branches and statements. **The script's exit code cannot be trusted for this**: `package.json` configures c8 thresholds but `test:coverage` omits `--check-coverage`, so the command reports and always exits 0. That is D18, which is out of scope here — this task must therefore inspect the numbers, not the exit status (Constitution II)
- [X] T068 Run the full quality gate from the repository root: `npm run compile && npm run format && npm run lint`, then `npm test` in full before pushing — build-dependent lint rules only fire after a build, which produced a local-green/CI-red in 004

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
- **US3** depends on Phase 3. Its launch-argument tests (T048–T049) touch the same file as T007 and T026, so sequence them rather than running them concurrently.
- **US4** depends on Phase 3 for the server version, and on US2 (T033–T035) for the browser version in provenance. Provenance can land with a placeholder browser version if US4 is taken before US2, but taking US2 first avoids the rework.

**Sequencing notes**:

- T037 and T038 modify `source/services/mcp-client.ts`, which T009–T011 create. Do not parallelise across that boundary.
- `source/models/config.ts` and `source/infrastructure/config/config-io.ts` are touched by T036 (US2), T051 (US3) and T060 (Polish). These are in different phases and must not be parallelised with each other.
- T041 and T042 both serve the interactive path; T041 (machine) precedes T042 (render).

## Parallel Opportunities

- **Phase 2**: T006 runs alongside T004–T005.
- **Phase 3 tests**: T007 and T008 together; then T013, T014, T015 together (three separate fixture files).
- **Phase 5 tests**: T023–T032 are ten tasks across eight files; all can start together except T023/T024 (same file) and the mcp-client pair, which should be sequenced within their file.
- **Phase 6 tests**: T048–T050, noting T048/T049 share a file.
- **Phase 7 tests**: T054–T055 share a file; sequence within it.
- **Phase 8 docs**: T063, T064, T065 together.

## Implementation Strategy

**MVP scope**: Phases 1–4. That delivers a working swap, proven behaviour-preserving against recorded numbers, on the developer machines and CI images that already have Chrome.

**Do not ship the MVP alone.** Phase 5 (US2) is equally P1 in the spec for a reason: without preflight, the MVP converts a working slim-container CI job into one that burns twenty model round-trips and reports a `partial` page with no mention of a browser. The MVP is an internal checkpoint, not a release.

**Recommended order**: Phase 1 → 2 → 3 → 4 → 5 → 7 → 6 → 8. US4 before US3 because provenance is cheap once preflight exists, and US3's verification needs outbound traffic observation that is best done once, late, against the final launch arguments.
