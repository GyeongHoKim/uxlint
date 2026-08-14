---
description: 'Task list for the CI gate feature'
---

# Tasks: CI Gate — Fail Runs That Breach Severity Thresholds

**Input**: Design documents from `/specs/004-ci-gate/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Included and **mandatory**. Constitution II makes test-first non-negotiable for this project — tests are written and confirmed failing before the implementation they cover. This is not the template's optional case.

**Organization**: Grouped by user story so each ships independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 from [spec.md](spec.md)
- Exact file paths in every description

## Path Conventions

Single project: `source/` and `tests/` at repository root, per plan.md Structure Decision. Note this repo uses `source/`, not `src/`.

---

## Phase 1: Setup

**Purpose**: Nothing to scaffold — no new dependencies, no new tooling (plan.md Technical Context). This phase exists only to pin the baseline the regression guarantee is measured against.

- [X] T001 Capture current exit behaviour as a baseline: run the CLI against a config with findings, one with none, and one containing an unreachable URL; record exit codes in `specs/004-ci-gate/baseline.md` for SC-004 to be checked against later

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `Thresholds` type and the exit-code seam. Every user story reads one and writes the other.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Write failing unit tests for `Thresholds` validation in `tests/models/thresholds.spec.ts` covering: integer/non-negative rules, boolean rules, unknown-key rejection, non-object `thresholds`, and absent-vs-zero distinction (data-model.md validation rules)
- [X] T003 [P] Write failing unit tests for the `GateResult` shape in `tests/models/gate-result.spec.ts` asserting `evaluated` is populated even when `passed` is true (FR-009). **Deferred to Phase 3** — the assertion needs `evaluateGate`, which is T014, and a test that only constructs a type literal would assert nothing TypeScript does not already enforce. Landed with T012/T015 instead
- [X] T004 Create `source/models/thresholds.ts` with the `Thresholds` type, the severity→field lookup (FR-002), the two coverage defaults (`failOnPartialPage`/`failOnFailedPage` default `true`, FR-003), and the validation predicate — makes T002 pass
- [X] T005 Create `source/models/gate-result.ts` with the `Breach` union (severity / partial-pages / failed-pages) and the `GateResult` type — makes T003 pass
- [X] T006 Add the optional `thresholds` property to `UxLintConfig` in `source/models/config.ts`, leaving `isUxLintConfig` unchanged (research R2 records why the divergence is deliberate)
- [X] T007 Write a failing test in `tests/ci-runner.spec.ts` asserting `runCIAnalysis` **resolves to** `0` on success and `1` when analysis throws, and never calls `process.exit` — the first test `ci-runner` has ever had, and it must fail before T008 because today the function returns `void` and exits the process
- [X] T008 Change `runCIAnalysis` in `source/ci-runner.ts` to return an exit code instead of calling `process.exit`, and make `source/cli.tsx:145` perform the exit — behaviour-preserving refactor, no gate logic yet (research R1). Makes T007 pass

**Checkpoint**: Exit status is now a value a test can read. User stories can begin.

---

## Phase 3: User Story 1 — Block a run that exceeds a severity budget (Priority: P1) 🎯 MVP

**Goal**: A configured severity budget stops the pipeline, and the log says which budget and by how much.

**Independent Test**: Set `maxCritical: 0`, run against a target producing critical findings, confirm non-zero exit and that stdout names the limit and the count. Ships on its own — a team adopting only this gets a working gate.

### Tests for User Story 1 ⚠️

> Write these FIRST and confirm they fail.

- [X] T009 [P] [US1] Write failing tests for `evaluateGate` severity counting in `tests/models/gate-result.spec.ts`: count above limit breaches, count below passes, **count equal to limit passes** (FR-006, the boundary), absent threshold is not evaluated, `0` threshold with 0 findings passes
- [X] T010 [P] [US1] Write a failing test in `tests/models/gate-result.spec.ts` asserting every breached threshold appears in `breaches`, not just the first (FR-007)
- [X] T011 [P] [US1] Write a failing test in `tests/models/gate-result.spec.ts` asserting findings from partial and failed pages are counted, using a report fixture whose findings come only from a failed page (FR-011, research R3)
- [X] T012 [P] [US1] Write a failing test in `tests/models/gate-result.spec.ts` asserting an absent `thresholds` yields `passed: true` with empty `evaluated`, so FR-004 holds at the evaluator level
- [X] T013 [P] [US1] Write a failing performance test in `tests/models/gate-result.spec.ts` for the SC-006 budget on a fixture of 500 findings across 50 pages. **Do not assert a bare 50ms wall clock** — a loaded CI runner will flake it. Calibrate first (time a trivial loop in the same process) and assert the evaluator's time against that, or assert a generous ceiling and log the observed figure so a real regression is still visible. The budget is the design target; the test's job is to catch an order-of-magnitude regression, not to police jitter

### Implementation for User Story 1

- [X] T014 [US1] Implement `evaluateGate(report, thresholds)` in `source/models/gate-result.ts` following data-model.md derivation steps 1–3 and 6, tallying `report.prioritizedFindings` — makes T009–T013 pass (SC-002)
- [X] T015 [P] [US1] Write failing tests in `tests/models/gate-result.spec.ts` for the verdict renderer: a breached run lists every breach, a passing run still lists evaluated thresholds (FR-009, SC-003)
- [X] T016 [US1] Implement the verdict renderer in `source/models/gate-result.ts` producing the exact layout in `contracts/config-thresholds.md` (breach lines and the passing summary) — makes T015 pass (SC-003)
- [X] T017 [US1] Wire `evaluateGate` into `source/ci-runner.ts` after `saveReport`, returning non-zero on breach — the report must already be on disk when the gate runs (FR-005, FR-010, SC-002)
- [X] T018 [US1] Print the rendered verdict from `source/cli.tsx` after the MCP transport closes and immediately before exit, and mirror it to the Winston logger (research R4)
- [X] T019 [US1] Write a test asserting the ordering — report written, then verdict printed, then exit — in `tests/ci-runner.spec.ts`. The stdout/MCP constraint makes this ordering load-bearing, so it must not rest on convention (plan.md Risks)

**Checkpoint**: US1 is functional. A team can adopt severity budgets and nothing else.

---

## Phase 4: User Story 2 — Treat incomplete coverage as a failure (Priority: P1)

**Goal**: Failed and partial pages fail the run when configured to, and the log names them with reasons.

**Independent Test**: Point a config at an unreachable URL with `failOnFailedPage: true`; confirm non-zero exit and that stdout names the page and its recorded reason. Testable without any severity budget configured.

### Tests for User Story 2 ⚠️

- [X] T020 [P] [US2] Write failing tests in `tests/models/gate-result.spec.ts` for coverage breaches: `failOnPartialPage` with partial pages breaches, `failOnFailedPage` with failed pages breaches, both disabled with no severity limits passes (US2 scenarios 1–3)
- [X] T021 [P] [US2] Write a failing test in `tests/models/gate-result.spec.ts` asserting a failed-page breach carries each page's recorded `error` string (FR-008)
- [X] T022 [P] [US2] Write a failing test in `tests/models/gate-result.spec.ts` asserting `analyzedNothing` fails the gate **even when both coverage flags are `false`** (FR-012 — this is why it is a separate field, not a breach kind)

### Implementation for User Story 2

- [X] T023 [US2] Extend `evaluateGate` in `source/models/gate-result.ts` with derivation steps 4–5 (FR-003) and the `analyzedNothing` rule from step 1, which data-model.md defines concretely as `analyzedPages` empty and `partialPages` empty and `report.pages.length > 0` — makes T020–T022 pass (FR-012, SC-007)
- [X] T024 [US2] Extend the renderer in `source/models/gate-result.ts` to emit the coverage breach lines and the nothing-analysed line from `contracts/config-thresholds.md`
- [X] T025 [US2] Report failed and partial counts as a warning in the passing path too, so disabling coverage gating still surfaces them (US2 scenario 3)

**Checkpoint**: Both P1 stories work. The gate is complete in behaviour.

---

## Phase 5: User Story 3 — Understand and adopt the gate without trial and error (Priority: P2)

**Goal**: A malformed `thresholds` block stops the run before analysis, naming the offending key.

**Independent Test**: Supply `maxCritcal: 0` and confirm the run refuses to start and names the key — no browser, no model call.

### Tests for User Story 3 ⚠️

- [ ] T026 [P] [US3] Write failing tests in `tests/infrastructure/config/config-io.spec.ts` for each rejected input in the `contracts/config-thresholds.md` table, asserting the message names the offending key and value (FR-013)
- [ ] T027 [P] [US3] Write a failing test in `tests/infrastructure/config/config-io.spec.ts` asserting a valid `thresholds` block parses identically from `.uxlintrc.yml` and `.uxlintrc.json` (FR-001, US3 scenario 3)
- [ ] T028 [P] [US3] Write a failing test in `tests/infrastructure/config/config-io.spec.ts` asserting a config with no `thresholds` key still validates and yields `thresholds: undefined` (FR-004)

### Implementation for User Story 3

- [ ] T029 [US3] Extend `ConfigIO.validateConfig` in `source/infrastructure/config/config-io.ts` to validate `thresholds` via the T004 predicate, throwing `ConfigurationError` with the file path and offending field — makes T026–T028 pass. Hand-written, matching the existing idiom (research R2)
- [ ] T030 [US3] Confirm validation runs before any MCP client or browser is created by tracing the `cli.tsx` → `loadConfig` → `runCIAnalysis` order; add a test asserting a malformed config rejects without constructing an AI service (SC-005)

**Checkpoint**: All three stories done. Misconfiguration is loud and free.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T031 Surface threshold results in interactive mode without changing its exit status, in `source/hooks/use-analysis.ts` and the relevant component (FR-014). Lives in Polish rather than a user story by design — spec Assumptions records why: a person watching a terminal already sees the findings, so this exists only so the two modes agree about what the thresholds mean
- [ ] T032 [P] Document the `thresholds` block in `README.md`: schema, defaults, absent-vs-zero, and a worked example (FR-015)
- [ ] T033 [P] Add the `thresholds` example to the config samples in `README.md` for both YAML and JSON
- [ ] T034 Verify SC-004 against the T001 baseline: all three no-thresholds runs exit exactly as recorded
- [ ] T035 Run `npm run test:coverage` and confirm the 80% c8 floor still holds
- [ ] T036 Run quality gates in constitution order: `npm run compile` → `npm run format` → `npm run lint`
- [ ] T037 Walk `specs/004-ci-gate/quickstart.md` scenarios 1–6 manually and record outcomes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: blocks every user story. T004/T005 give the types; T007 gives the exit-code seam
- **US1 (Phase 3)** and **US2 (Phase 4)**: both depend only on Phase 2
- **US3 (Phase 5)**: depends on T004 (the validation predicate) — otherwise independent
- **Polish (Phase 6)**: depends on the stories being delivered

### User Story Dependencies

- **US1 (P1)**: after Phase 2. No dependency on other stories.
- **US2 (P1)**: after Phase 2. Extends the same `evaluateGate` function as US1, so if both are worked at once they share `source/models/gate-result.ts` — sequence them or expect a merge. Behaviourally independent.
- **US3 (P2)**: after T004. Touches config validation only; no overlap with US1/US2 files.

### Within Each Story

Tests written and failing → evaluator logic → renderer → wiring. Models before services before CLI.

### Parallel Opportunities

- T002 and T003 are different files → parallel
- T009–T013 are all test cases in one file but independent → can be authored in parallel, applied as one edit
- **US3 can run fully parallel with US1/US2** — different files entirely (`config-io.ts` vs `gate-result.ts`)
- T032 and T033 are both README but different sections → sequence if edits collide

---

## Parallel Example: Foundational Phase

```bash
# Different files, no shared state:
Task: "Write failing Thresholds validation tests in tests/models/thresholds.spec.ts"   # T002
Task: "Write failing GateResult shape tests in tests/models/gate-result.spec.ts"       # T003
```

## Parallel Example: US3 alongside US1

```bash
# US3 touches config validation; US1 touches the evaluator. No file overlap.
Task: "Extend ConfigIO.validateConfig for thresholds in source/infrastructure/config/config-io.ts"  # T029
Task: "Implement evaluateGate in source/models/gate-result.ts"                                      # T014
```

---

## Implementation Strategy

### MVP (US1 only)

1. Phase 1 → Phase 2 → Phase 3
2. **Stop and validate**: quickstart scenarios 1 and 2 (breach fails, equality passes)
3. Shippable: severity budgets work, coverage gating not yet configurable

### Incremental Delivery

1. Phase 2 → the exit-code seam alone is worth landing; it makes `ci-runner` testable for the first time
2. + US1 → severity budgets (MVP)
3. + US2 → coverage gating; the gate is now behaviourally complete
4. + US3 → misconfiguration becomes loud
5. + Polish → docs, interactive surfacing, regression verification

### Suggested Commit Grouping

Phase 2 is one commit (`refactor:` — behaviour-preserving). Each story is one or two `feat:` commits. Docs are `docs:`. This keeps every commit reviewable and lets the exit-code refactor be reviewed apart from the feature that motivated it.

---

## Notes

- `[P]` = different files, no dependencies
- Every test task must be confirmed **failing** before its implementation task starts (Constitution II). The 4.0.1 work showed XO's type-aware rules will flag tests referencing not-yet-existing APIs — that is expected during the red phase, and it is why test and implementation land in the same commit rather than a separate red commit
- Commit after each task or logical group; conventional commits are enforced by commitlint
- `source/`, not `src/` — the template's path convention does not match this repo
