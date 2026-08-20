---

description: "Task list for 007-deterministic-audit"
---

# Tasks: Deterministic Audit

**Input**: Design documents from `/specs/007-deterministic-audit/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/measurement.md](./contracts/measurement.md), [quickstart.md](./quickstart.md)

**Tests**: Included and mandatory. Constitution II is non-negotiable. Every test here runs without a browser and without a provider account, because Phase 0 recorded the real replies — the fixtures are captured output, not hand-written strings. Feature 006 shipped two defects that passed every test, both because a double was friendlier than the real thing.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Exact file paths are given in every task

## Path Conventions

Single project: `source/` and `tests/` at repository root, compiled to `dist/`. Ava runs against `dist/`, so `npm run build` precedes any test run.

---

## Phase 1: Fixtures from Phase 0 (BLOCKING — nothing is written by hand)

**Purpose**: Every parser in this feature reads text the server produced. The fixtures must be that text, captured, or the tests will agree with the parser instead of checking it.

- [X] T001 Create `tests/fixtures/lighthouse-reply.ts` exporting the audit's reply text exactly as recorded in `research.md` R1 — both the `navigation` and `snapshot` mode variants, including the `URL: undefined` line snapshot mode emits. Wrap them in the adapter's real result shape using the existing `tests/fixtures/mcp-result.ts` helper, not as bare strings
- [X] T002 [P] Create `tests/fixtures/lighthouse-report.json` from the real Lighthouse result recorded in Phase 0, trimmed to the accessibility category and the four failing audits (`color-contrast`, `html-has-lang`, `image-alt`, `landmark-one-main`) with their `details.debugData.impact`, `details.items` and `lighthouseVersion: "13.4.1"` intact. Keep at least one audit with `score: null` so the not-applicable case is covered by real data
- [X] T003 [P] Create `tests/fixtures/trace-reply.ts` with both recorded trace replies — the `NAVIGATION_0` one carrying LCP and CLS, and the `NO_NAVIGATION` one carrying CLS only. The second is what proves FR-006a; without it the per-metric absence path has no test
- [X] T004 [P] Add a malformed-reply set to `tests/fixtures/lighthouse-reply.ts`: a reply with no `### Reports` section, one whose report path does not exist on disk, and one whose JSON is truncated. These drive the `unparseable` route of the contract

**Checkpoint**: The real replies are available to tests. No source file has changed yet.

---

## Phase 2: Foundational — the measurement types (BLOCKING for all stories)

**Purpose**: The types every story depends on. Pure, no I/O, no model.

- [X] T005 Create `source/models/measurement.ts` with `Measured<T>`, `NotTakenReason`, `AxeImpact`, `Violation`, `AuditResult`, `TraceResult` and `PageMeasurement` per `data-model.md` §2. `Measured` is a discriminated union — a `T | undefined` cannot distinguish "audited and clean" from "never audited", which is the distinction FR-006 exists for
- [X] T006 Add `impactToSeverity` to `source/models/measurement.ts` as a total `Record<AxeImpact, FindingSeverity>` per `data-model.md` §3. Write it as data, not a `switch` with a default, so a new impact value fails to compile instead of silently becoming `low`
- [X] T007 [P] Create `tests/models/measurement.spec.ts` asserting the severity table against the impacts actually observed in Phase 0 — `color-contrast` serious → high, `image-alt` critical → critical, `landmark-one-main` moderate → medium (research R2)

**Checkpoint**: `npm run compile` passes. The vocabulary exists; nothing uses it.

---

## Phase 3: User Story 1 — Accessibility problems are measured, not guessed (P1)

**Goal**: The audit runs on every page that loads, and its violations become findings without passing through the model.

**Independent test**: Run an analysis against `probe/fixture.html` and confirm the rendered report contains a `color-contrast` finding on that page. The defect is planted, so the expected finding is known before the run.

### Tests first

- [X] T008 [P] [US1] Create `tests/services/measurement-parsing.spec.ts` asserting that the recorded audit reply of T001 yields the four category scores and the `.json` report path, and that the recorded report of T002 yields exactly the four violations with their impacts and element counts. Assert `score === null` is treated as not-applicable and never as a failure
- [X] T009 [P] [US1] Add to `tests/services/measurement-parsing.spec.ts`: each malformed reply from T004 produces `{state: 'not-taken', reason: 'unparseable'}` and **throws nothing**. A wording change in a future server version must degrade the report, not break the run
- [X] T010 [P] [US1] Create `tests/services/measurement-failure.spec.ts` covering every not-taken route in the contract's failure table — page never loaded, `isError: true` returned rather than thrown, call rejected, report file missing. The `isError` case is the one feature 006 shipped a bug on; it is a returned value, not an exception
- [X] T011 [P] [US1] Assert in `tests/services/measurement-failure.spec.ts` that each not-taken route writes a **distinct** log line, so an abandoned measurement is distinguishable in the log from one that failed and from one never attempted (FR-005b). Logging goes to files only — stdout and stderr are reserved for the MCP protocol
- [X] T012 [US1] Add to `tests/services/measurement-failure.spec.ts` a test named `a measurement that never returns` (SC-008a): a tool call that never resolves is abandoned at the bound, the page records `timed-out`, and the analysis proceeds to completion
- [X] T013 [US1] Add to `tests/services/measurement-failure.spec.ts` a test named `audit failure loses nothing` (SC-005): with the audit failing on page 2 of 3, every model finding on page 2 survives and pages 1 and 3 are untouched. This is D8's failure shape, which this repository has already paid for once

### Implementation

- [X] T014 [US1] Create `source/services/measurement.ts` with a `MeasurementService` class exposing one method that takes a page and returns a `PageMeasurement`. Calls `lighthouse_audit` with `mode: 'snapshot'` — the tool's default is `navigation`, which reloads the page and would make the captured structure and the audited state two different loads (research R3)
- [X] T015 [US1] Implement the audit reply parser in `source/services/measurement.ts` per `contracts/measurement.md`: category scores from `- <Title>: <score> (<id>)`, report path from the `### Reports` line ending `.json`. Ignore the `URL:` line — it reads `undefined` in snapshot mode
- [X] T016 [US1] Implement report reading in `source/services/measurement.ts`: filter `categories.accessibility.auditRefs` to audits with `score !== null && score < 1`, taking `ruleId`, `title`, `details.debugData.impact` and `details.items.length`. An audit with no impact is skipped and logged — it has no basis for a severity, and inventing a default is the guessing this feature removes
- [X] T017 [US1] Delete the report directory after reading it, in `source/services/measurement.ts`. Each call creates a fresh random temp directory holding ~156 KB of JSON plus an HTML report; a ten-page run would otherwise leave megabytes behind every time. Derived from research R7 rather than from a requirement — it specifies no behaviour a user reads, only one they would notice by running out of disk (research R7)
- [X] T018 [US1] Apply the 60-second bound via `options.signal` on both `callTool` invocations in `source/services/measurement.ts`, per research R5. Record the constant with a comment stating it is a hang net rather than a performance target, and that it sits above the audit's own 30-second internal load ceiling
- [X] T019 [US1] Reuse the existing `readToolOutcome` in `source/services/measurement.ts` for failure detection rather than re-deriving it. The server signals failure by returning `isError: true`; feature 005 documented this and feature 006 shipped a bug by forgetting it
- [X] T020 [US1] Add `measurement` and `measurementNote` to `PageAnalysis` in `source/models/analysis.ts` per `data-model.md` §4, then update every `PageAnalysis` construction site the compiler reports. `measurement` is required, so this breaks the same way `origin` does — a page built without one could render as neither measured nor unmeasured
- [X] T021 [US1] Call the measurement service from `source/services/ai-service.ts` once the stage reaches `analysable` — after a navigation and a capture have both succeeded — and before the first model call that forms a judgement. The stage machine of feature 006 is **not** modified: stages decide which tools the model may call, and the model never calls these
- [X] T022 [US1] Register each violation as a finding in `source/services/ai-service.ts` with `origin: 'audit'`, the audit's own `title` as the description unaltered, `ruleId`, `affectedElements`, and severity from `impactToSeverity`. One finding per violation, whatever the element count (FR-013)
- [X] T023 [US1] Build the measurement digest in `source/services/measurement.ts` and inject it into the page prompt in `source/services/ai-service.ts`, in the form given in `contracts/measurement.md` (FR-015). **This belongs to US1, not US2**: without it the model is not told what was measured and re-reports the same contrast problems the audit just found, so the MVP would ship duplicate findings
- [X] T024 [US1] Remove Performance from the system prompt's category list in `source/services/ai-service.ts` and stop asking the model to judge accessibility unaided (FR-014). The model keeps everything measurement cannot reach — wording, information architecture, whether a flow makes sense for the persona
- [X] T025 [US1] Carry the measurement onto the stored page in `source/services/report-builder.ts`
- [X] T026 [US1] Create `tests/integration/planted-defect.spec.ts` with a test named `planted defect` (SC-001) driving a full analysis against the recorded fixtures and asserting the rendered markdown contains a `color-contrast` finding on the fixture page
- [X] T027 [US1] Add a test named `violation set is reproducible` (SC-003) to `tests/integration/planted-defect.spec.ts`: two analyses of the same recorded input produce identical rules, counts and severities

**Checkpoint**: Measured accessibility findings reach the report, and the model is told what was measured so it does not re-report it. They are not yet distinguishable from judged ones in the rendered file — that is US2.

---

## Phase 4: User Story 2 — A reader can tell a fact from an opinion (P2)

**Goal**: Every finding says where it came from, and model prose never sits inside a finding labelled as measured.

**Independent test**: Render a report containing findings of every origin and confirm each carries its origin visibly, with rule identifiers on measured findings and absent on judged ones.

### Tests first

- [X] T028 [P] [US2] Add a test named `every finding states its origin` (SC-002) to `tests/infrastructure/reports/report-generator.spec.ts`, asserting against the **rendered markdown** that no finding appears without an origin, in either the per-page listing or the prioritised listing
- [X] T029 [P] [US2] Add a test named `audit wording is unaltered` (SC-011) to `tests/infrastructure/reports/report-generator.spec.ts`: the description of every finding marked measured is byte-identical to the audit's title for that rule
- [X] T030 [P] [US2] Assert the full invariant of FR-008 in `tests/infrastructure/reports/report-generator.spec.ts`: a rule identifier is present on every measured finding **and absent from every judged one**. The negative half is spec US2 acceptance scenario 3, and a renderer that printed a rule id on a judged finding would satisfy the positive half alone
- [X] T031 [P] [US2] Add a test named `one note per page` (SC-010) to `tests/infrastructure/reports/report-generator.spec.ts`: a page with violations renders exactly one model note, attributed to judgement and sitting outside the findings it discusses, whatever the violation count
- [X] T032 [P] [US2] Add a test named `one finding per rule` (SC-006) to `tests/infrastructure/reports/report-generator.spec.ts`: a rule that failed on N elements renders as one finding stating N

### Implementation

- [X] T033 [US2] Add `FindingOrigin` and the `origin`, `ruleId` and `affectedElements` fields to `UxFinding` in `source/models/analysis.ts` per `data-model.md` §1. **`origin` is required, not optional** — an optional field would allow a finding with no origin, and the first such finding would render as neither measured nor judged
- [X] T034 [US2] Update every `UxFinding` construction site the compiler now reports, including the model's `addFinding` tool in `source/services/ai-service.ts`, which sets `origin: 'judgement'`. The model does not choose its own origin: it is set by the code that received the finding
- [X] T035 [US2] Render the origin on every finding in `source/infrastructure/reports/report-generator.ts`, in both the per-page listing and the prioritised listing, with the rule id shown for measured findings only
- [X] T036 [US2] Add the per-page note to `source/services/ai-service.ts`: using the digest built in T023, ask the model for **one** note per page about the measured violation set, stored in `measurementNote`. Once per page whatever the violation count — per-violation annotation would scale model output with violation count, against the budget feature 006 established (FR-019)
- [X] T037 [US2] Render `measurementNote` in `source/infrastructure/reports/report-generator.ts` as model judgement, visibly separate from the findings it discusses, so that nothing labelled measured contains model-authored text
- [X] T038 [US2] Add a test named `no performance finding` (SC-009) to `tests/infrastructure/reports/report-generator.spec.ts`: the rendered report contains no performance finding of any origin. After this feature, performance is a number in the statistics or it is absent

**Checkpoint**: A reader can tell a measured fact from an AI judgement, in the file they actually open.

---

## Phase 5: User Story 3 — Numbers that move only when the site moves (P3)

**Goal**: The statistics carry measured scores and vitals, and say plainly when something was not measured.

**Independent test**: Analyse a page and confirm the rendered statistics carry the score and the vitals, with an explicit "not measured" wherever a measurement or a metric is missing.

### Tests first

- [X] T039 [P] [US3] Add a test named `absent measurement` (SC-004) to `tests/infrastructure/reports/report-generator.spec.ts` covering three cases against the rendered markdown: a page measured fully, a page whose audit failed, and a page whose trace succeeded but reported no LCP. No page may render a measurement it did not take as a number
- [X] T040 [P] [US3] Add a trace-parsing test to `tests/services/measurement-parsing.spec.ts` using both recorded replies from T003: `NAVIGATION_0` yields LCP and CLS, `NO_NAVIGATION` yields CLS with LCP `not-taken`. Assert that `- LCP breakdown:` is **not** read as a metric — it is a heading, and a loose match on `LCP` consumes it
- [X] T041 [P] [US3] Add a test asserting no FCP value is ever produced. The only FCP figure in the reply is `estimated metric savings: FCP 0 ms`, a projected saving from a suggested fix; parsing it as the page's FCP would fabricate the kind of number this feature exists to remove (research R4)

### Implementation

- [X] T042 [US3] Implement the trace call and metric parsing in `source/services/measurement.ts`: one `performance_start_trace` call with `reload: true, autoStop: true` — the server records, waits and stops by itself, so `performance_stop_trace` is never called. Ordered **after** the audit, because the trace reloads the page
- [X] T043 [US3] Wrap each metric in `Measured` independently of the trace itself (FR-006a), so a trace that succeeded with no LCP is recorded as taken at the trace level and not-taken at the metric level
- [X] T044 [US3] Render the per-page statistics in `source/infrastructure/reports/report-generator.ts`: accessibility score, LCP and CLS, with absence rendered as words rather than as zero or blank
- [X] T045 [US3] Label the companion scores (SEO, best practices, agentic browsing) as taken in snapshot mode in `source/infrastructure/reports/report-generator.ts` (FR-012a). They are degraded by that mode — SEO scored 50 against 75 in navigation mode — and an unlabelled number invites a comparison that is not valid
- [X] T046 [US3] Add the recurrence summary to `source/infrastructure/reports/report-generator.ts` per FR-013b: every rule that failed on more than one page, with the page count. **Derive it from the findings at render time** — a stored copy is a second source of truth that can disagree with the findings it summarises
- [X] T047 [US3] Add `auditEngineVersion` to `RunProvenance` in `source/models/analysis.ts`, read from the report's own `lighthouseVersion` rather than hardcoded, and render it in the report header beside the existing browser provenance
- [X] T048 [US3] Add a test to `tests/infrastructure/reports/report-generator.spec.ts` asserting the recurrence summary counts pages, not findings, and that it never reports a rule the findings do not contain

**Checkpoint**: The report carries an external reference point. Feature 010's baseline work now has something stable to compare.

---

## Phase 6: The person watching

**Purpose**: Measurement is the longest wait in a run. An unlabelled wait of that length is indistinguishable from the hang T018 exists to prevent.

- [X] T049 [P] Add `measuring` to `analysisStages` in `source/models/analysis.ts`, between `capturing` and `analyzing`, and include it in `isAnalysisInProgress`
- [X] T050 Report the measuring phase from `source/services/ai-service.ts` via the existing progress callback, naming the page being measured
- [X] T051 Render the phase in `source/components/analysis-progress.tsx`, and say so when a measurement is abandoned rather than moving on silently (FR-013d)
- [X] T052 Add a test named `measuring phase` (SC-009a) to `tests/components/analysis-progress.spec.tsx` asserting against what the display renders, not against the state that drove it

---

## Phase 7: Budget, gate and the live run

- [X] T053 Update the ceiling in `tests/e2e/context-budget.spec.ts` to 192,000 bytes (SC-007) and record the measured figure for this feature beside feature 006's 153,913 in a new `specs/007-deterministic-audit/baseline.md`. Measured with the same harness, so the comparison is between like and like
- [X] T054 Confirm in `tests/e2e/context-budget.spec.ts` that this feature adds **no browser tool** to any model request. The measurement tools are called by uxlint and offered to the model at no stage, so a regression there would quietly undo part of feature 006. The per-request count is 2, 2, 3, 3 rather than 2, 2, 2, 2: the third is `noteOnMeasuredIssues`, a local tool offered only at the `analysable` stage. Stating it as "zero tool definitions" was wrong — zero *browser* tools, one local one
- [X] T055 Add a gate test to `tests/models/gate-result.spec.ts` asserting measured findings count toward the severity thresholds on the same terms as any other finding (FR-020)
- [X] T056 Document the breaking change in `README.md` and the release notes: thresholds tuned against guessed findings will see different counts, and one site-wide accessibility defect can exhaust a severity threshold on its own. The recurrence summary makes that legible; it does not soften it
- [X] T057 Document the audit in `README.md` — what is measured, what "measured" and "judged" mean in the report, and that the trace adds roughly 6 seconds per page
- [X] T058 Run the live checks in `quickstart.md` §4 against a real site and record the result in `specs/007-deterministic-audit/baseline.md`, including the per-page wall clock on a real page rather than a localhost fixture, and confirm it against the 60-second ceiling of SC-008. **Feature 005's US1 was merged unverified for want of exactly this step**
- [X] T059 Record the coverage for every file this feature adds or changes in `specs/007-deterministic-audit/baseline.md`, read from the text reporter, **and assert every one of them clears the 80% minimum on all four metrics** (Constitution II). The bar is asserted here rather than inferred from the exit status: `test:coverage` omits `--check-coverage`, so its exit code is always 0 (D18, out of scope here). Recording a number below the bar and moving on would be a constitution violation, not a note
- [X] T060 Run `npm test` in full before pushing, not the three quality-gate commands alone. Feature 004 recorded a CI failure from a type-aware lint rule that only fires after `build`

---

## Open question — deliberately not a task

**Should measurement be configurable per run?** Phase 0 measured 7.6 seconds per page against a localhost fixture, so a ten-page run against a real site will cost meaningfully more. Whether that deserves a config toggle is a decision worth making once T058 has produced a real-site number — adding one now would be config surface designed against a fixture. Raise it after T058, not before.

---

## Dependencies

```text
Phase 1 (fixtures)  ──▶ Phase 2 (types) ──▶ Phase 3 (US1) ──▶ Phase 4 (US2) ──▶ Phase 5 (US3)
                                                   │                                  │
                                                   └────────▶ Phase 6 (progress) ◀─────┘
                                                                     │
                                                                     ▼
                                                              Phase 7 (budget, gate, live)
```

- **Phases 1 and 2 block everything.** Nothing can be parsed before the recorded replies exist, and nothing can be typed before the vocabulary does.
- **US2 depends on US1** for something to label. Shipped alone it would still be honest — it would mark today's report as entirely judgement — but it would have no measured findings to distinguish. The digest and the prompt change moved into US1 (T023, T024) because without them the MVP produces duplicate findings, which is a correctness problem rather than a presentation one.
- **US3 depends on US1** for the measurement pipeline, not for its findings.
- **Phase 6 depends only on US1**, so the progress phase can be built as soon as measurement exists.
- **T055 depends on US1**. T053 and T054 depend on US2 for the note, but the digest they also measure arrives in US1 (T023), so a budget check run at the US1 checkpoint is meaningful rather than premature.

## Parallel opportunities

- **Phase 1**: T002, T003, T004 are three separate files — fully parallel after T001 establishes the fixture module.
- **Phase 3 tests**: T008, T009, T010 are parallel; T011, T012 and T013 extend T010's file and follow it.
- **Phase 4 tests**: T028–T032 all extend the rendering spec and are parallel with each other only if written as separate files; as written they share one file and should be sequential.
- **Phase 5 tests**: T039, T040 and T041 touch two different files and are parallel.
- **Across stories**: T049 is independent of everything in Phases 3–5 and can be done at any point after Phase 2.

## Implementation strategy

**MVP is User Story 1 alone.** It delivers the thing the feature exists for: accessibility findings that were measured rather than guessed, with a rule id and an element count, and a report that no longer invents contrast judgements from an accessibility tree. Shipped by itself it is already an improvement in correctness — the findings are not yet visibly distinguished from the model's own, but they are no longer duplicated by it.

**US2 is what makes it trustworthy**, and is the smallest possible next increment — it is rendering plus the model's per-page note. The prompt change that stops the model guessing at what is now known moved into US1, because an MVP that reports the same defect twice is not a smaller feature, it is a wrong one.

**US3 is the smallest slice and the one feature 010 needs.** It can be deferred without weakening either of the first two.

Each phase ends at a checkpoint where the feature is coherent: findings measured (US1), findings attributed (US2), numbers reported (US3). Stopping at any checkpoint leaves a shippable product rather than a half-migrated one.
