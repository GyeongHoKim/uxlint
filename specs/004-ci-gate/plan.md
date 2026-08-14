# Implementation Plan: CI Gate — Fail Runs That Breach Severity Thresholds

**Branch**: `004-ci-gate` | **Date**: 2026-08-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-ci-gate/spec.md`

## Summary

Give `.uxlintrc` an optional `thresholds` block — a maximum permitted count per severity plus two coverage switches — and make the non-interactive run exit non-zero when the report breaches it, naming every breach in the CI log.

The technical shape follows from one constraint: the exit status has to be testable. Today `runCIAnalysis` calls `process.exit` directly and returns nothing, which is why it has no tests. So the logic goes into a **pure evaluator** — `(UxReport, Thresholds) → GateResult`, no I/O — and `runCIAnalysis` returns an exit code that `cli.tsx` acts on. Everything risky about this feature (boundary conditions, which findings count, multi-breach output) then lives in a function Ava can call directly with a literal report.

## Technical Context

**Language/Version**: TypeScript 6.0.3, ES modules, Node >=22.22.2 (CI pinned to 24 via `.nvmrc`)

**Primary Dependencies**: none new. Uses `js-yaml` (already parsing config) and the existing `UxReport` model. Deliberately **not** adding zod to config validation — see research R2.

**Storage**: `.uxlintrc.yml` / `.uxlintrc.json`, read-only for this feature

**Testing**: Ava against precompiled `dist/`; c8 at 80%. The evaluator is a pure model → unit tests. No `MockLanguageModelV4` needed: this feature never touches the LLM path.

**Target Platform**: CLI on Linux/macOS/Windows CI runners

**Project Type**: single-project CLI

**Performance Goals**: gate evaluation ≤50ms on 500 findings across 50 pages (SC-006). Timed on the evaluator alone.

**Constraints**:

- **stdout/stderr are reserved for MCP** (`CLAUDE.md`, non-negotiable). The verdict must still reach the CI log (SC-003). Resolved in research R4: print from `cli.tsx` after the MCP transport is closed, never during analysis. This ordering is load-bearing and gets an explicit test.
- Configs without `thresholds` must exit exactly as they do in 4.0.1 (FR-004, SC-004).

**Scale/Scope**: ~4 source files touched, 2 new model files, 3 new test files. No public API beyond the config block and the exit status.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

| Principle | Status | Evidence |
| --- | --- | --- |
| **I. Code Quality Gates** (NON-NEGOTIABLE) | PASS | `compile → format → lint` after every change; unchanged from existing workflow |
| **II. Test-First** (NON-NEGOTIABLE) | PASS | The design exists to satisfy this. Evaluator is a pure model → Ava unit tests, written and failing before implementation. Extracting `process.exit` from `runCIAnalysis` (research R1) is what makes the runner testable at all — it has zero tests today |
| **III. Persona-First** | PASS | Spec names the pipeline owner (primary) and the developer who broke the build (secondary). FR-007/FR-008 exist because of the second persona: the reason must be in the log, not only the report. No Ink UI is added, so no Ink library discovery applies |
| **IV. Performance Accountability** | PASS | SC-006 gives a measured budget (≤50ms / 500 findings / 50 pages), measurable on the pure evaluator with no live run |
| **V. Simplicity** | PASS | No new dependency. Rejected zod-for-thresholds (research R2) and rejected per-breach exit codes (spec Assumptions). Two small model files and one extracted function |

**Post-Phase-1 re-evaluation**: still PASS. The design added no abstraction beyond the two entities the spec already named (`Thresholds`, `GateResult`) plus `Breach` as their shared unit. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-ci-gate/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — R1..R4
├── data-model.md        # Phase 1 — Thresholds, Breach, GateResult
├── quickstart.md        # Phase 1 — 6 validation scenarios
├── contracts/
│   └── config-thresholds.md   # Phase 1 — user-facing config + output contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 — created by /speckit-tasks, not here
```

### Source Code (repository root)

```text
source/
├── models/
│   ├── thresholds.ts        # NEW — Thresholds type + validation rules
│   ├── gate-result.ts       # NEW — Breach, GateResult, evaluateGate()
│   ├── analysis.ts          # unchanged (4.0.1 already exposes everything needed)
│   └── config.ts            # MODIFIED — optional `thresholds` on UxLintConfig
├── infrastructure/
│   └── config/
│       └── config-io.ts     # MODIFIED — validateConfig() accepts/rejects the block
├── ci-runner.ts             # MODIFIED — evaluate the gate, return an exit code
└── cli.tsx                  # MODIFIED — print the verdict, then exit

tests/
├── models/
│   ├── thresholds.spec.ts   # NEW — validation rules
│   └── gate-result.spec.ts  # NEW — evaluation, boundaries, perf budget
└── infrastructure/config/
    └── config-io.spec.ts    # MODIFIED — thresholds parsing/rejection
```

**Structure Decision** — Single project, matching the existing layout. The evaluator lives in `source/models/` rather than `source/services/` because it is a pure function over data with no dependencies, which is exactly the category Constitution II routes to Ava unit tests. Putting it in `services/` would imply I/O it does not have.

## Implementation Sequence

Test-first throughout (Constitution II). Each step's tests are written and failing before its implementation.

1. **`Thresholds` model + validation rules.** Type, defaults, and the predicate that rejects bad input. Pure; no config plumbing yet.
2. **`evaluateGate` + `GateResult`.** The whole decision, driven by literal `UxReport` fixtures. Covers: equality passes, absent vs. zero, multi-breach, findings counted across all page statuses, nothing-analysed overriding configuration, and the SC-006 timing budget.
3. **Config plumbing.** `UxLintConfig.thresholds`, `ConfigIO.validateConfig` accepting the block and rejecting unknown/malformed keys before analysis starts.
4. **Runner wiring.** `runCIAnalysis` returns an exit code instead of calling `process.exit`; `cli.tsx` prints the verdict after MCP close and exits. Test asserts the ordering — report written before verdict printed before exit.
5. **Interactive surfacing** (FR-014) and **README documentation** (FR-015).

Steps 1–2 are the feature. Steps 3–5 are wiring and can be reviewed quickly once 1–2 are green.

## Risks

| Risk | Mitigation |
| --- | --- |
| Printing the verdict corrupts MCP traffic | Print only after `aiService.close()`, from `cli.tsx`, never from the analysis path. Ordering asserted by test (research R4) |
| Upgrading breaks pipelines that have no `thresholds` | SC-004 covers three cases explicitly; step 3's tests pin absent-block behaviour before the block is read anywhere |
| The gate and the report disagree on counts | The evaluator tallies `prioritizedFindings` — the same array the report's statistics table renders from (data-model, derivation step 2) |
| `cli.tsx` has no tests today | Keep the change there mechanical: print and exit, no logic. All decisions stay in the evaluator |

## Complexity Tracking

No constitutional violations. Table intentionally empty.
