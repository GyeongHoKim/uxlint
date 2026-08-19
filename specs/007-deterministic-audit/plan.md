# Implementation Plan: Deterministic Audit

**Branch**: `007-deterministic-audit` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-deterministic-audit/spec.md`

## Summary

The analysis asks the model to judge accessibility and performance while giving
it only an accessibility-tree text. This feature supplies the measurement and
makes the report say which of its statements are measured and which are judged.

Phase 0 ran the pinned browser server for real, and the shape of the feature
follows from what it found. The audit's reply to a tool call is a 409-byte
summary of counts and file paths — the violations are in a 156 KB JSON on disk.
So the model cannot be the one to call these tools, and it is not: **uxlint
calls them itself, and this feature adds zero tool definitions to any model
request.** What reaches the model is a ~400-byte digest of what was measured,
so it does not re-guess what is now known.

Three of Phase 0's findings changed the spec. First Contentful Paint is gone —
the trace does not report one, and the only FCP figure available is a projected
saving from a suggested fix. The audit runs in a non-reloading mode, so the
structure the model reads and the state the audit judged are one page load. And
the FR-005a bound is 60 seconds, taken from a measured 7.6 seconds per page
rather than guessed.

## Technical Context

**Language/Version**: TypeScript (ES modules, `node16` resolution), Node >=22.22.2

**Primary Dependencies**: `ai@7.0.60`, `@ai-sdk/mcp@2.0.30`, `chrome-devtools-mcp@1.7.0` — all existing, all pinned. **No new runtime dependency.** Lighthouse 13.4.1 arrives bundled inside the pinned server

**Storage**: Report JSON/markdown at the configured output path; Winston log files. Audit reports are read from the OS temp directory and their directories deleted

**Testing**: Ava against precompiled `dist/`; recorded Phase 0 replies as fixtures for the measurement parsers; feature 006's msw-intercepting harness for the context budget; ink-testing-library for the progress phase; c8 for coverage

**Target Platform**: Linux (CI and development); Chrome or Chrome for Testing must be present, as feature 005 established and its preflight enforces

**Performance Goals**: ≤ 192,000 request bytes per page (SC-007, against v4.3.0's measured 153,913); measurement adds ≤ 60 s per page (SC-008, measured at 7.6 s on a localhost fixture)

**Constraints**: Nothing labelled measured may contain model-authored text (FR-017, SC-011). A measurement failure may never fail a page or discard findings (FR-005) — this is D8's failure shape. Absence must be representable per metric, not only per measurement (FR-006a)

**Scale/Scope**: 1–10 pages per run, up to 20 model iterations per page, 4–10 violations per page observed on the fixture

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment | Verdict |
| --- | --- | --- |
| **I. Code Quality Gates** | `compile → format → lint`, then full `npm test` before push — the sequence feature 004's CI failure taught | ✅ Pass |
| **II. Test-First Development** | Every criterion is checkable without a browser or a provider: the measurement parsers run against Phase 0's recorded replies, the report against rendered markdown, the budget against intercepted requests. Tests precede implementation | ✅ Pass |
| **III. UX Consistency via Persona-First Design** | Spec carries two personas. The interactive display gains a `measuring` phase (FR-013c) because measurement is the longest wait in a run and an unlabelled one reads as a hang | ✅ Pass |
| **IV. Performance Accountability** | Both goals carry measured baselines: SC-007 against 006's recorded 153,913 bytes, SC-008 against Phase 0's 7.6 s. Neither number was guessed | ✅ Pass |
| **V. Simplicity & Minimalism** | No new dependency, no new MCP server, no new stage in the model's state machine, no tool added to any model request. One new module, one modified model file, one modified renderer | ✅ Pass |

**No violations. Complexity Tracking table omitted.**

### Principle III — Ink ecosystem discovery

The principle requires that Ink-based work search the Ink ecosystem for an
existing library before building, and that the choice be documented with its
rationale. Recorded here so the step is visible rather than assumed:

**No library is adopted, and none was needed.** The only UI change is one
member added to `analysisStages` and its label rendered by
`analysis-progress.tsx`, which already uses `ink-spinner` for exactly this
purpose. No new terminal UI pattern is introduced — no progress bar, no table,
no multi-step indicator — so there is no pattern to avoid reinventing. Pulling
in a dependency to render one more string would be the kind of unjustified
complexity Principle V prohibits.

The GitHub MCP tooling the principle names is not connected in the session that
produced this plan. That is recorded rather than glossed: had this feature
introduced a genuinely new UI surface, the search would have been a
prerequisite and the plan would have been blocked on it.

Two design choices are worth recording as deliberately *not* taken, since both
would have been complexity the constitution asks us to justify:

- **axe MCP is not added.** Lighthouse's accessibility category is axe-core, and
  Phase 0 confirmed the impact ratings arrive intact. A second source would
  duplicate rule ids for no new information.
- **The measurement tools are not exposed to the model.** Offering them would
  add two tool definitions to every request, undoing part of feature 006's
  measured 59% saving, to deliver a reply the model cannot act on.

### Re-check after Phase 1 design

Design did not change any verdict. One thing tightened: `Measured<T>` was going
to be `T | undefined` until FR-006's three states were written out, at which
point it became clear that absence has to carry a reason for the report to say
*why* a measurement is missing. That is one extra type and it removes a class
of blank-reads-as-pass bug, so V is satisfied by it rather than strained.

## Spec amendments from Phase 0

Recorded here and applied to `spec.md`; evidence in [research.md](./research.md).

| Amendment | Requirement | Evidence |
| --- | --- | --- |
| First Contentful Paint dropped; LCP and CLS recorded | FR-004, SC-004 | R4 — FCP is not an observed metric; the only figure available is a projected saving |
| Absence tracked per metric, not only per measurement | FR-006a | R4 — a trace can succeed and report no LCP |
| Audit taken in non-reloading mode; companion scores labelled | FR-012a | R3 — same accessibility result, 2.7× faster, and no second page load |
| FR-005a bound set at 60 s | SC-008 | R5 — 7.6 s measured; the audit's own internal load ceiling is 30 s |

## Project Structure

### Documentation (this feature)

```text
specs/007-deterministic-audit/
├── plan.md                    # This file
├── spec.md                    # Amended by Phase 0
├── research.md                # Phase 0 — R1-R10, measured against a live browser
├── data-model.md              # Phase 1
├── quickstart.md              # Phase 1
├── contracts/
│   └── measurement.md         # Phase 1 — the tool contract and the parsing obligations
├── probe/                     # The Phase 0 scripts, kept so the numbers reproduce
│   ├── probe.mjs              # timings and replies
│   ├── probe2.mjs             # trace metrics, abort behaviour
│   ├── probe3.mjs             # result envelope, determinism
│   ├── fixture.html           # planted accessibility defects
│   ├── fixture2.html          # a page with a real navigation, for LCP
│   └── timings.json           # recorded
├── checklists/
│   └── requirements.md
└── tasks.md                   # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
source/
├── models/
│   ├── analysis.ts            # MODIFIED — FindingOrigin, UxFinding.origin/ruleId/
│   │                          #   affectedElements, PageAnalysis.measurement,
│   │                          #   measurementNote, AnalysisStage 'measuring',
│   │                          #   RunProvenance.auditEngineVersion
│   └── measurement.ts         # NEW — Measured<T>, AuditResult, Violation,
│                              #   TraceResult, PageMeasurement, impactToSeverity
├── services/
│   ├── measurement.ts         # NEW — calls the two tools, parses replies,
│   │                          #   reads and deletes the report, builds the digest
│   ├── ai-service.ts          # MODIFIED — measure at `analysable`, inject the
│   │                          #   digest, request the one per-page note,
│   │                          #   register violations as findings
│   └── report-builder.ts      # MODIFIED — carry measurement onto the page
├── infrastructure/reports/
│   └── report-generator.ts    # MODIFIED — origin on every finding, vitals and
│                              #   scores in statistics, recurrence summary,
│                              #   the per-page note rendered as judgement
└── components/
    └── analysis-progress.tsx  # MODIFIED — the measuring phase

tests/
├── models/
│   └── measurement.spec.ts             # NEW — the severity table
├── services/
│   ├── measurement-parsing.spec.ts     # NEW — against Phase 0's recorded replies
│   └── measurement-failure.spec.ts     # NEW — every not-taken route, incl. timeout
├── infrastructure/reports/
│   └── report-generator.spec.ts        # MODIFIED — origin, vitals, recurrence, note
├── integration/
│   └── planted-defect.spec.ts          # NEW — SC-001 and SC-003 end to end
├── components/
│   └── analysis-progress.spec.tsx      # MODIFIED — the measuring phase
├── e2e/
│   └── context-budget.spec.ts          # MODIFIED — SC-007's new ceiling
└── fixtures/
    ├── lighthouse-reply.ts             # NEW — the real replies, in the adapter's result shape
    ├── lighthouse-report.json          # NEW — the real LHR, trimmed to the audits used
    └── trace-reply.ts                  # NEW — both recorded trace replies
```

Test paths follow the repository's existing layout, which mirrors `source/`.
The renderer's tests already live at `tests/infrastructure/reports/report-generator.spec.ts`
and are extended rather than replaced.

**Structure Decision**: The existing single-project layout is kept. Measurement
is a new service module rather than code inside `ai-service.ts`, because it is
the one part of this feature with no dependency on the model at all — it takes
a page and returns what was measured. That separation is what makes its tests
run without a provider, and it keeps `analyzePage` from growing a third
responsibility.

## Implementation order

Sequenced so that each step is verifiable before the next depends on it, and so
the highest-risk parsing work is proved against real data first.

1. **Fixtures from Phase 0.** Save the recorded replies and report as test
   fixtures. Nothing is hand-written; the bug feature 006 shipped came from a
   double that was friendlier than the real thing.
2. **`models/measurement.ts`** — the types and the severity table. Pure,
   unit-testable, no I/O.
3. **`services/measurement.ts`** — parsing, reading, deleting, digest building.
   Tested entirely against step 1's fixtures, including every malformed input.
4. **Failure and timeout paths.** Before the happy path is wired in, so that
   FR-005's guarantee is established rather than retrofitted.
5. **`models/analysis.ts`** — the model changes. `origin` is required, so the
   compiler now lists every construction site to be updated.
6. **`ai-service.ts`** — measure at `analysable`, register violations, inject
   the digest, request the note.
7. **`report-generator.ts`** — everything the reader sees. The bulk of the
   success criteria land here.
8. **`analysis-progress.tsx`** — the measuring phase.
9. **Budget re-measurement** — SC-007 against the harness, with the new figure
   recorded next to 006's.
10. **Live run** — the checks in `quickstart.md` §4, against a real site. US1 of
    feature 005 was merged unverified for want of exactly this step.

## Risks

| Risk | Handling |
| --- | --- |
| The reply format is text, and a server upgrade could change its wording | The version is pinned (005's rule). An unparseable reply degrades to `not-taken`, never an exception |
| `@ai-sdk/mcp` drops `structuredContent`, so parsing is the only route | Recorded in R8 and in the contract. Fixtures are the real replies, so a regression cannot hide |
| Measurement adds ~7.6 s per page; a 10-page run pays over a minute | Measured, stated, and left as a deliberate cost. Whether it deserves a config toggle is a decision worth making once the number exists on a real site, not now — carried into `tasks.md` as an open question, not a task |
| Existing threshold configs start failing on measured findings | FR-020 requires it be documented as a breaking change. One site-wide defect can exhaust a severity threshold on its own — the recurrence summary makes that legible, but does not soften it |
| A timeout leaves the browser busy, slowing the next call | Measured in R6. The 60 s bound is deliberately loose so a healthy run never pays it twice |
