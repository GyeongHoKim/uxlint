---

description: "Task list for 006-context-diet"
---

# Tasks: Context Diet

**Input**: Design documents from `/specs/006-context-diet/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included and mandatory. Constitution II is non-negotiable. Unusually for this project, the measurement harness is itself a prerequisite rather than a check on the way out — the baseline cannot be captured without it, so it is built first and against unchanged code.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Exact file paths are given in every task

## Path Conventions

Single project: `source/` and `tests/` at repository root, compiled to `dist/`. Ava runs against `dist/`, so `npm run build` precedes any test run.

---

## Phase 1: Measurement harness (BLOCKING — built before any source change)

**Purpose**: Everything this feature claims is a number read from a request body. The harness produces those numbers, and it must exist before the code changes so the baseline measures the current behaviour.

**Unlike 005's baseline this needs no credentials, no browser and no network** — which is the whole reason the criteria are enforceable this time.

- [X] T001 Create `tests/mocks/handlers/provider.ts` with msw handlers speaking the **Responses API** (`POST https://api.openai.com/v1/responses`), scriptable per-request, following the structure of the existing `tests/mocks/handlers/oauth.ts`. Responses must carry `usage.input_tokens`/`output_tokens` and text parts must carry `annotations: []` — omitting either fails validation with an error naming JSON parsing rather than protocol shape (research R2)
- [X] T002 Create `tests/mocks/provider-recorder.ts` that captures each intercepted request body and exposes per-request `bytes`, `toolNames` and `structureOccurrences` per `data-model.md` §3. Keep it assertion-free — one recorder serves the size, tool-count, duplication and reminder checks
- [X] T003 Add a guard in `tests/mocks/provider-recorder.ts` so a test that intercepts **zero** requests fails rather than passing vacuously — a handler pointed at the wrong endpoint would otherwise satisfy every assertion (research R2, plan Open Risks)
- [X] T004 Create `tests/e2e/context-budget.spec.ts` that drives a full page analysis against the intercepted provider and reports the measurements without asserting thresholds yet
- [X] T005 Fix the fixture page structure at a representative size and **create** `specs/006-context-diet/baseline.md`, recording what size was chosen and why — Phase 0 used a 6,800-character stand-in, which may flatter the ratio (plan Open Risks)

**Checkpoint**: A run of the harness prints numbers for unchanged code.

---

## Phase 2: Baseline (BLOCKING — on this branch, after Phase 1, before any source change)

**Measured here rather than on the merge-base, and that distinction matters.** Phase 1 adds test files only, so `source/` at this point is byte-for-byte the merge-base — the measurement is equivalent. Checking out the merge-base would instead delete the harness that does the measuring, which is what an earlier draft of these tasks told the implementer to do, having copied the shape of 005's baseline without noticing that 005's harness was the product itself.

- [X] T006 On this branch with Phase 1 complete and `source/` unchanged, run `tests/e2e/context-budget.spec.ts` and record median request bytes per page, tool count per request, and requests per page in `specs/006-context-diet/baseline.md`. Confirm `git diff <merge-base> -- source/` is empty before recording, so the numbers provably describe unchanged behaviour
- [X] T007 Run the measurement a second time on the same commit and confirm the numbers are identical, recording both in `specs/006-context-diet/baseline.md` (SC-008). A measurement that drifts cannot support a threshold
- [X] T008 Derive and record the SC-002 threshold (baseline × 0.6) in `specs/006-context-diet/baseline.md`

**Checkpoint**: The threshold is a committed number derived from measured behaviour, reproducible by anyone.

---

## Phase 3: Foundational — the stage model

**Purpose**: Both P1 stories depend on knowing which stage a page's analysis is in.

### Tests first

- [X] T009 [P] Write failing unit tests in `tests/models/analysis-stage.spec.ts` for the transitions in `data-model.md` §2: `unloaded` → `loaded` on observed navigation success, `loaded` → `analysable` on a non-empty capture, and that an error result advances nothing
- [X] T010 [P] Write a failing unit test in `tests/models/analysis-stage.spec.ts` asserting each stage maps to a non-empty tool set matching `contracts/stage-tools.md`, and that stages are one-way within a page

### Implementation

- [X] T011 Create `source/models/analysis-stage.ts` with the stage type, the transition rules, and the stage-to-tool-name mapping from `contracts/stage-tools.md`

**Checkpoint**: The sequence is expressible as data, unit-tested, with no browser or provider involved.

---

## Phase 4: User Story 1 — The recorded snapshot is what the browser produced (P1) 🎯 MVP

**Goal**: The report's snapshot is the browser's output, not the model's retyping of it.

**Independent test**: Analyse a page and compare the recorded snapshot byte for byte with the capture tool's result.

### Tests first

- [X] T012 [P] [US1] Write a failing test in `tests/services/ai-service.spec.ts` asserting the recorded snapshot is byte-identical to the capture tool's result, for a small structure and for one exceeding 100 KB (SC-001)
- [X] T013 [P] [US1] Write a failing test in `tests/services/ai-service.spec.ts` asserting an error result from the capture tool is **not** recorded as a snapshot (FR-004)
- [X] T014 [P] [US1] Write a failing test in `tests/services/ai-service.spec.ts` asserting a second successful capture replaces the first rather than accumulating (data-model §1)
- [X] T015 [P] [US1] Write a failing test in `tests/services/ai-service.spec.ts` asserting a page whose capture never succeeded records an empty snapshot and a status that does not read as fully analysed (FR-005)

### Implementation

- [X] T016 [US1] Record the capture tool's result directly into the report builder from the `onToolExecutionEnd` callback on `generateText` in `source/services/ai-service.ts`, without re-serialising it. Match on `event.toolCall.toolName` and record only when `event.toolOutput.type` is `tool-result` — see `contracts/stage-tools.md` for the verified event shape
- [X] T017 [US1] Delete the `setPageSnapshot` tool from `createReportTools()` in `source/services/ai-service.ts`
- [X] T018 [US1] Remove step 3 of the prompt workflow in `buildUserPrompt()` in `source/services/ai-service.ts`, which instructs the model to call the now-deleted tool

**Checkpoint**: MVP. The stored snapshot is trustworthy, and the largest repeated cost is gone.

---

## Phase 5: User Story 2 — A run costs what the analysis actually uses (P1)

**Goal**: Only the tools the analysis can act on reach the request.

**Independent test**: Compare recorded request bodies before and after against the baseline.

### Tests first

- [X] T019 [P] [US2] Add assertions to `tests/e2e/context-budget.spec.ts` that median request bytes per page fall by at least the T008 threshold (SC-002)
- [X] T020 [P] [US2] Add an assertion to `tests/e2e/context-budget.spec.ts` that the page structure appears at most once in any request body (SC-003)
- [X] T021 [P] [US2] Add assertions to `tests/e2e/context-budget.spec.ts` that each request's tool array matches the stage it belongs to, for every stage (SC-004)
- [X] T022 [P] [US2] Write a failing test in `tests/services/mcp-client.spec.ts` asserting a browser server missing `navigate_page` or `take_snapshot` fails before any provider request is issued, naming the tool (SC-007, FR-010)

### Implementation

- [X] T023 [US2] Narrow the adapted tool set in `source/services/mcp-client.ts` to the two **browser-server** tools — `navigate_page` and `take_snapshot` — and fail with a message naming either that the server does not offer. `addFinding` and `completePageAnalysis` also appear in `contracts/stage-tools.md` but are built locally by `createReportTools()`, not adapted from the server; requiring them here would fail every run
- [X] T024 [US2] Build the tool map per iteration from the current stage in `source/services/ai-service.ts`, replacing the single map built once before the loop

**Checkpoint**: Requests carry the analysis, not the catalogue.

---

## Phase 6: User Story 3 — The sequence is structural (P2)

**Goal**: Order is enforced by what is offered, so the reminder can go.

### Tests first

- [X] T025 [P] [US3] Add a test to `tests/e2e/context-budget.spec.ts` scripting the provider to reply out of order, asserting the out-of-order tool was never offered (FR-007)
- [X] T026 [P] [US3] Add a test to `tests/e2e/context-budget.spec.ts` scripting the provider to stop early, asserting no request body contains reminder text (SC-005, FR-008)
- [X] T027 [P] [US3] Write a failing test in `tests/services/ai-service.spec.ts` asserting that after a failed navigation the analysis does not capture and does not record the page as analysed (FR-009)

### Implementation

- [X] T028 [US3] Remove the reminder-message branch from `processAgentResult` in `source/services/ai-service.ts`, and the now-unreachable `finishReason === 'stop'` handling that existed to feed it
- [X] T029 [US3] Advance the stage only on observed tool success in `source/services/ai-service.ts`, so a failed navigation leaves capture unoffered

**Checkpoint**: The loop no longer negotiates with the model about order.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T030 Run the harness on this branch and record the after-numbers beside the baseline in `specs/006-context-diet/baseline.md`, confirming SC-002 and SC-008
- [X] T031 [P] Confirm SC-006: a scripted end-to-end analysis reaches the same per-page status as the baseline recorded, in `tests/e2e/context-budget.spec.ts`
- [X] T032 [P] Update the analysis workflow description in `README.md` if it documents the removed echo step
- [X] T033 Confirm coverage of `source/models/analysis-stage.ts` and the changed regions of `source/services/ai-service.ts` meets 80% by reading `npm run test:coverage` output — the script omits `--check-coverage`, so its exit code cannot be trusted for this (D18, out of scope here)
- [X] T034 Run the full quality gate from the repository root: `npm run compile && npm run format && npm run lint`, then `npm test` in full before pushing
- [X] T035 [P] Confirm FR-011: assert in `tests/services/report-builder.spec.ts` that the report's structure and the meaning of every status field are unchanged by this feature — the same invariance check 005 added for its own additive field
- [ ] T036 ⬜ **NOT PERFORMED — release gate.** Perform SC-009: with a provider account, Chrome and the real target set, measure median findings per page and compare against the same measurement before the change; record both in `specs/006-context-diet/baseline.md`
- [X] T037 If T036 cannot be performed, record in `specs/006-context-diet/baseline.md` that SC-009 is an unmet release gate, naming what it needs. **Recording is not verifying** — this task exists so an unperformed check is visible rather than silently absent, which is how 005 shipped without its baseline

---

## Dependencies & Execution Order

```text
Phase 1 (harness)  ──> Phase 2 (baseline, on merge-base)
                              │
                              └──> Phase 3 (stage model)
                                        │
                                        ├──> Phase 4 (US1) ── MVP
                                        ├──> Phase 5 (US2)
                                        └──> Phase 6 (US3)
                                                  │
                                                  └──> Phase 7 (Polish)
```

**Story independence after Phase 3**:

- **US1** depends on Phase 3 only for the stage that gates capture; the byte-identity work is independent. It is the MVP and can ship alone.
- **US2** depends on Phase 3 for the per-stage tool map, and on Phase 2 for its threshold.
- **US3** depends on Phase 3 and on US2's per-iteration tool map — the reminder can only be removed once order is structurally enforced. **Do not take US3 before US2.**

**Sequencing notes**:

- T016–T018, T024, T028–T029 all modify `source/services/ai-service.ts`. They are in different phases and must not be parallelised with each other.
- T019–T021, T025–T026 and T031 all extend `tests/e2e/context-budget.spec.ts`, created in T004. Sequence within that file.

## Parallel Opportunities

- **Phase 3 tests**: T009 and T010 together.
- **Phase 4 tests**: T012–T015 together — four assertions in one file, but independent enough to write in one pass.
- **Phase 5 tests**: T022 is a different file from T019–T021 and can run alongside.
- **Phase 7**: T031 and T032 together.

## Implementation Strategy

**MVP scope**: Phases 1–4. That delivers a trustworthy stored snapshot and removes the single largest repeated cost, with the measurement infrastructure to prove it.

**US1 is genuinely shippable alone**, unlike 005's MVP. It fixes a correctness problem — the report claims to record what was analysed and currently records a retyping of it — and its value does not depend on the tool filtering landing.

**Recommended order**: Phase 1 → 2 → 3 → 4 → 5 → 6 → 7. The one ordering that matters is US2 before US3: removing the reminder before order is structurally enforced would leave a model that stops early with nothing to recover it.
