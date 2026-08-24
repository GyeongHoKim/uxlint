# Tasks: SDK Agent Loop

**Input**: Design documents from `/specs/008-sdk-agent-loop/`
(plan.md · research.md · data-model.md · contracts/aiservice-contract.md · quickstart.md)

**Prerequisites**: plan.md ✅ · spec.md ✅ · research.md ✅ (SDK primitives verified against installed `ai@7.0.60`) · data-model.md ✅ · contracts/ ✅

**Tests**: INCLUDED — Constitution II (Test-First) is non-negotiable in this repo. Every story phase starts with red-phase tests; SC-002 additionally pins all existing behavioural assertions.

**Organization**: By user story. US1 is behaviour preservation — its "new" tests are preservation pins plus one genuinely new capability (run isolation); US2 adds the page bound; US3 the activity display.

## Format: `[ID] [P?] [Story?] Description`

- **[P]** Can run in parallel (different files, no dependency on incomplete work)
- **[US*]** Maps to spec.md user stories; Setup/Foundational/Polish carry none

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Freeze the "before" picture while the manual loop still runs, and arm the gates this feature is judged by.

- [x] T001 Record pre-swap baselines in `specs/008-sdk-agent-loop/baseline.md`: drive the scripted interaction harness (`tests/e2e/context-budget.spec.ts` technique) against the CURRENT build for the four canonical scripts — happy path, budget exhaustion, failed navigation, mid-run page failure — and record (a) rendered markdown per case with volatile fields normalised (timestamps replaced by fixed sentinels; document the normalisation in the file), (b) total per-page request bytes per case, (c) end-to-end wall-clock per page for SC-004 timing data. Commit the fixtures and the baseline file.
- [x] T001 Record pre-swap baselines in `specs/008-sdk-agent-loop/baseline.md`: drive the scripted interaction harness (`tests/e2e/context-budget.spec.ts` technique) against the CURRENT build for the four canonical scripts — happy path, budget exhaustion, failed navigation, mid-run page failure — and record (a) rendered markdown per case with volatile fields normalised (timestamps replaced by fixed sentinels; document the normalisation in the file), (b) total per-page request bytes per case, (c) end-to-end wall-clock per page for SC-004 timing data. Commit the fixtures and the baseline file. *(Done: `tests/e2e/agent-loop-baseline.spec.ts` is dual-mode — capture on first run, permanent compare gate afterwards. happy-path 160,911 bytes matches the roadmap's corrected 007 figure exactly.)*
- [x] T002 [P] Gate analysis-path coverage in `package.json` (SC-007): add a `test:coverage:gate` script running c8 with `--check-coverage` over exactly the modules this feature touches (ai-service, report-builder, measurement, config, config-builder, analysis-stage, tool-output — plus the deadline helper once T003 creates it), all four metrics at the existing 80% thresholds. The shared `test:coverage` stays report-only: measured reality is 74.98% lines repository-wide (branches already pass at 82.29%), so a global gate today fails the build on D18 debt that predates this feature. Confirm the gate script exits zero now and nonzero when a threshold is broken. *(Done; both directions observed in-session. SC-007 amended in spec with rationale.)*

**Checkpoint**: Baselines committed; coverage gate active. The "before" is now immutable evidence.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Two primitives every story builds on. No story work before this phase.

**⚠️ CRITICAL**: US2's bound and US1's engine swap both assume these exist.

- [x] T003 Extract the owned-deadline race from `source/services/measurement.ts` into a shared helper (e.g. `source/services/deadline.ts`): ref'd `setTimeout` timer owned by the caller, raced against the awaited promise, controller handed to the callee, timer cleared in `finally`, typed expiry error. Keep `MeasurementTimeout` semantics and message intact for measurement callers; move, don't copy, the explanatory comment about unref'd `AbortSignal.timeout`. All existing `measurement*.spec.ts` tests stay green untouched.
- [x] T004 Add the configurable page bound to the config model in `source/models/config.ts` (+ validation and defaults where config parsing lives): `.uxlintrc` key `analysis.pageTimeLimitMs`, a positive integer of milliseconds on `UxLintConfig`, provisional default 600000, rejected as non-positive, documented as subject to SC-004 calibration. No behaviour reads it yet. Quality gates: `npm run compile && npm run format && npm run lint`.

**Checkpoint**: Deadline primitive + config surface exist. Stories can begin.

---

## Phase 3: User Story 1 — Same reports, different engine (Priority: P1) 🎯 MVP

**Goal**: The analysis loop is driven by the toolkit's native loop control with declarative stop conditions, and report state belongs to a run instance — with rendered output frozen to the T001 baselines.

**Independent Test**: Scripted fixtures produce byte-identical (normalised) rendered reports versus `baseline.md`; two consecutive analyses in one process equal fresh single runs.

### Tests for User Story 1 ⚠️ RED FIRST

> Write these before touching `source/services/`. Preservation pins (T005) will largely pass against the old loop — that is their job: they freeze behaviour so the swap cannot drift. T006 goes red until the run assembly exists.

- [ ] T005 [P] [US1] Preservation-pin suites in `tests/services/ai-service.spec.ts`, extending the existing `MockLanguageModelV4` patterns with queued multi-step responses (counter-based callback): (1) multi-step happy path → `complete` status and findings intact; (2) budget exhaustion without completion → `partial`; (3) failed navigation → capture tool never offered across all captured requests, completion remains available, page ends `partial`; (4) completion + capture invoked in one response → snapshot kept and status decided from evidence regardless of execution order; (5) transcript-shape pins on captured request messages: measurement-digest user message sits strictly AFTER the assistant/tool exchange of the step that made the page readable, and per-request tool definitions match the observed stage exactly. Assert on rendered/captured artefacts, not internal objects (005 lesson).
- [ ] T006 [P] [US1] Isolation suite in `tests/services/run-isolation.spec.ts` (new file): two back-to-back analyses via the new run assembly → second report equals a fresh single run's report; closing the first service does not affect the second; a closed instance still answers further `analyzePage` calls with a failed `PageAnalysis` naming the cause (B4 guard retained). RED: `createAIService` does not exist yet.

### Implementation for User Story 1

- [ ] T007 [US1] Run assembly in `source/services/ai-service.ts`: export `createAIService(config, verdict)` returning `{aiService, reportBuilder}` with a fresh `ReportBuilder` per call; delete the `aiServiceInstances` cache, `getAIService`, `resetAIService`, and the exported `reportBuilder` singleton in `source/services/report-builder.ts` (class stays). Update callers `source/ci-runner.ts` and `source/hooks/use-analysis.ts` to own the returned builder for provenance/finalise/save; shrink `close()` to client teardown + closed flag (no global reset). Update any test helpers importing the removed exports.
- [ ] T008 [US1] Engine swap in `source/services/ai-service.ts`: replace the manual `while` loop with a `ToolLoopAgent` whose settings carry `stopWhen: [isStepCount(20), hasToolCall('completePageAnalysis')]`; map the stage machine onto `prepareStep` (`activeTools` = `toolsForStage(stage)` ∩ available, completion always offered); advance the stage only from observations gathered in `onToolExecutionEnd` (existing `observeTool`/`recordCapture` pipeline unchanged); move `measureOnceReadable` into `prepareStep`, injecting the digest via the `messages` override so it lands strictly after its exchange; delete `processAgentResult` outright; finalise the page once after `generate()` resolves using the accumulated stage + completion signal (close-out stays outside tools, order-independent). Delete the load-bearing comment with the machinery it described.
- [ ] T009 [US1] Equivalence verification against `specs/008-sdk-agent-loop/baseline.md`: rerun the T001 harness on the swapped engine; all four cases byte-identical after the documented normalisation; per-page request bytes within ±1%. Any diff is treated as a regression first — a legitimate difference requires written justification in this feature directory before acceptance (SC-001, SC-006). FR-010 behavioural pins: `tests/ci-runner.spec.ts` and `tests/hooks/use-analysis.spec.tsx` pass without behavioural edits — they are the standing evidence that both frontends' flows are untouched; any adaptation to them must be justified in this directory. Run full quality gates + `npm test`.

**Checkpoint**: User Story 1 stands alone: same reports, no hand-written loop, no shared state. This is the MVP — stop and validate here before continuing.

---

## Phase 4: User Story 2 — One stuck page cannot stall the run (Priority: P2)

**Goal**: Each page carries an owned wall-clock bound; expiry closes that page `partial` with the reason recorded and the run proceeds.

**Independent Test**: A fixture whose model call never resolves closes at bound (+≤5 s) with the expiry reason; subsequent pages still appear; the run terminates itself.

### Tests for User Story 2 ⚠️ RED FIRST

- [ ] T010 [P] [US2] Bound-expiry suites in `tests/services/page-bound.spec.ts` (new file): (1) never-resolving model response → page closes `partial` with expiry named as reason, remaining pages analysed, run self-terminates within bound + 5 s; (2) expiry while a tool execution is in flight → same close-out (bound covers the whole page); (3) callee ignores the abort signal entirely (fixture that never observes it) → our await still returns at the bound (FR-008 property 1); (4) healthy page under default bound → bound never trips; (5) a lifecycle event from an expired page's abandoned engine call arrives after that page's close-out → it is discarded: neither the closed page's record nor the next page's record changes (F1 red test — observation-scoping rule).
- [ ] T011 [P] [US2] Sole-pending-work demonstration outside the test runner (US2-4): a plain `node` script under `scripts/` (e.g. `scripts/page-bound-solo-check.mjs`) that leaves the bounded call as the only pending handle and prints proof the bound fired; expected output documented in the script header. RED until T012 wires the bound; kept as a permanent regression demo, not a skipped test.

### Implementation for User Story 2

- [ ] T012 [US2] Page bound in `source/services/ai-service.ts`: wrap `agent.generate()` in the T003 deadline helper configured from the T004 config field; hand the derived signal into `generate()` so the SDK can abandon work early; on expiry classify the page `partial` with the expiry as recorded reason and continue the run; implement a generation-scoped observation buffer so events arriving after a page's close-out — e.g. from an expired page's abandoned engine call — are discarded instead of applied to the run's state (F1 guard); keep the measurement inner bound subordinate (page bound dominates whichever elapses first, each recording its own reason); log expiry file-only (stdout is protocol-reserved). Verify T010 goes green including case (5), and T011's plain-process demonstration passes against the wired bound.
- [ ] T013 [US2] Calibrate the shipped default (SC-004): apply the ≥10× headroom rule over the T001(c) timings in `baseline.md`; replace the provisional 600000 ms default if the data dictates; ship the headroom assertion as a test reading the recorded numbers. Quality gates + affected suites.

**Checkpoint**: Stories 1 and 2 both stand alone: identical reports AND a run that cannot be stalled by one page.

---

## Phase 5: User Story 3 — The terminal shows the work (Priority: P3)

**Goal**: During active steps the interactive display names the real work (tool executions, measurements) sourced from lifecycle events; filler survives only where no events exist.

**Independent Test**: Rendered progress against a scripted analysis shows ≥1 concrete activity label per executed step and zero filler messages during active work.

### Tests for User Story 3 ⚠️ RED FIRST

- [ ] T014 [P] [US3] Activity-display suite with ink-testing-library in the existing component tests (e.g. `tests/components/analysis-progress.spec.tsx` or the file where progress rendering lives): scripted multi-step analysis renders ≥1 concrete activity label per executed step; while a tool execution is reported, no random filler string from the waiting-messages pool appears; the distinct measurement-phase presentation introduced by 007 is preserved verbatim.

### Implementation for User Story 3

- [ ] T015 [US3] Activity surfacing: forward `onToolExecutionStart`/`onToolExecutionEnd` events through `AnalysisProgressCallback` as concrete activity messages (additive payloads; existing stage vocabulary unchanged per contract); gate the filler pool in `source/constants/waiting-messages.ts` consumption sites to eventless phases only (startup, report writing); CI runner unaffected (ignores messages). Verify T14 green; run interactive smoke if a terminal is available.

**Checkpoint**: All three stories independently functional.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Residue removal, documentation, whole-system validation.

- [ ] T016 Dead-code sweep: confirm `processAgentResult`, the iteration counter, reminder-message logic, the `aiServiceInstances` cache, and B4-era eviction comments are fully gone; remove now-unused exports (including anything in barrel files referencing deleted symbols); `npm run lint` must show zero unused-symbol warnings on touched paths.
- [ ] T017 [P] Documentation: README config section gains the page-bound option (`analysis.pageTimeLimitMs`: name, type, default, calibration note); architecture note that the agent loop is toolkit-native; `.uxlintrc.ROADMAP.md` Phase 4 entry annotated as implemented with corrections discovered during implementation (repo convention: roadmap is a verification target).
- [ ] T018 Final validation per `quickstart.md`: full `npm test` (build + prettier + xo + ava), the `test:coverage:gate` script exiting zero (SC-007) and demonstrably nonzero when a covered file's threshold is broken, equivalence re-run (T009 artefacts current), optional live smoke with credentials + Chrome if available. Conventional commit(s) per task group throughout, per husky/commitlint.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)**: none — start immediately. T002 independent of T001.
- **Foundational (2)**: depends on nothing except wanting T001's timings later for T013; T003 ∥ T004.
- **US1 (3)**: depends on Phase 2 (T006 needs T007's factory to compile-green; T008 needs T003's helper only indirectly). T005/T006 precede T007/T008 (red → green). T009 last.
- **US2 (4)**: depends on US1's engine (bounds wrap `generate()`) — T010–T011 can be written in parallel with US1 implementation but only go green after T012, which requires T008.
- **US3 (5)**: depends on US1's lifecycle events existing (T008); independent of US2.
- **Polish (N)**: after all stories.

### User Story Dependencies

- **US1 (P1)**: Foundational only. Independently deliverable (MVP).
- **US2 (P2)**: Builds on US1's `generate()` seam; independently testable once T012 lands.
- **US3 (P3)**: Builds on US1's event callbacks; independent of US2.

### Within Each Story

Red tests before implementation; implementation before verification tasks; quality gates after every task (`compile → format → lint`), full `npm test` before push (004 lesson).

### Parallel Opportunities

- T001 ∥ T002 (Setup)
- T003 ∥ T004 (Foundational)
- T005 ∥ T006 (different files)
- T010 ∥ T011 (different files); writable during US1, executable after T012
- T014 parallel with late US2 work (different layer)

---

## Parallel Example: User Story 1

```text
# Red phase together (different files):
Task: "Preservation-pin suites in tests/services/ai-service.spec.ts"   # T005
Task: "Isolation suite in tests/services/run-isolation.spec.ts"        # T006

# Then sequential core:
Task: "Run assembly in source/services/ai-service.ts + caller updates" # T007
Task: "Engine swap (ToolLoopAgent) in source/services/ai-service.ts"   # T008
Task: "Equivalence verification vs baseline.md"                        # T009
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 → Phase 2 → Phase 3 (T001–T009)
2. STOP: validate byte-equivalence + isolation. Ship-worthy state: behaviour identical, machinery halved.
3. US2/US3 land as follow-up increments on the same branch or immediate successors.

### Incremental Delivery

Each story checkpoint is a valid stopping point; no story leaves the tree red. US2 is the reliability increment (CI-facing), US3 the UX increment (interactive-facing).

### Risk Notes (from research.md — carry into execution)

- T008 is the highest-risk edit: it is exactly the "behaviour-preserving modification mass" 007's review lesson warns about. Every touched assertion gets the break-it-and-watch-it-fail treatment before trusting green.
- If queued-response mocking mismatches the real loop shape (R7), fix the fixture — never weaken the assertion (006 lesson).
- Any byte-diff in T009 is a regression until proven otherwise, in writing.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to spec user story for traceability
- Verify red before green on every ⚠️ suite; break-to-verify guards before trusting passing regressions (007 review lesson 4: compile-breaking sabotage silently tests stale dist — sabotage in a way that compiles, watch ava fail, then restore)
- Commit after each task or logical group (conventional commits)
- Stop at checkpoints to validate stories independently
