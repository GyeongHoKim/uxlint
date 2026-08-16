# Implementation Plan: Context Diet

**Branch**: `006-context-diet` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-context-diet/spec.md`

## Summary

Two changes to what each model call carries: capture the page structure in code instead of asking the model to dictate it back, and offer only the tools the analysis can act on at the stage it has reached.

Phase 0 measured both against real intercepted request bodies. Today's shape sends 30 tool definitions on every request and, from the third request onward, carries the accessibility tree **twice** in the same body — once as the capture tool's result and again as the argument of the echo call. Removing the echo also removes a model round trip that exists only to move text the system already had. On the fixture: 54,852 bytes across 3 requests becomes 9,491 across 2.

The verification approach is the other half of this plan. Measuring at the intercepted transport boundary makes every success criterion enforceable in CI with no provider account, which is what lifts this feature out of the baseline dependency that has now delayed verification on two consecutive features.

## Technical Context

**Language/Version**: TypeScript (ES modules, `node16` resolution), Node >=22.22.2

**Primary Dependencies**: `ai@7.0.60`, `@ai-sdk/mcp@2.0.30`, `chrome-devtools-mcp@1.7.0` (all existing). Test-only: `msw@2.15.0` and `@ai-sdk/openai`, both already present

**Storage**: Report JSON/markdown at the configured output path; Winston log files

**Testing**: Ava against precompiled `dist/`; `MockLanguageModelV4` for unit-level model behaviour; **msw-intercepted provider endpoint for the end-to-end context measurements**; ink-testing-library for components; c8 for coverage

**Target Platform**: Linux (CI and development)

**Project Type**: Single-project CLI

**Performance Goals**: Total request bytes per analysed page down ≥40% against the recorded baseline (SC-002); measurement reproducible byte-for-byte across runs (SC-008); no wall-clock regression

**Constraints**: The recorded snapshot must be byte-identical to the browser's output, at any size (SC-001). The tool array is re-sent in full on every request, so filtering must happen before the call, not in the prompt

**Scale/Scope**: 1–10 pages per run, up to 20 iterations per page

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Verdict |
| --- | --- | --- |
| **I. Code Quality Gates** | `compile → format → lint`, then full `npm test` before push | ✅ Pass |
| **II. Test-First Development** | Every change here is observable in a request body, so tests come first and are deterministic. The new harness is itself test infrastructure, built before the code it measures | ✅ Pass |
| **III. UX Consistency via Persona-First Design** | Spec carries three personas. No UI surface changes; the interactive progress display is unaffected because tool *results* still flow through the same callbacks | ✅ Pass |
| **IV. Performance Accountability** | The whole feature is a performance goal with a measured baseline. Phase 0 already produced numbers (83% on a fixture) rather than estimates | ✅ Pass |
| **V. Simplicity & Minimalism** | Removes a tool, removes a prompt step, removes a reminder branch. The one addition is a stage-to-tools mapping. Net less code | ✅ Pass |

**No violations. Complexity Tracking table omitted.**

Worth recording: the E2E harness is new test infrastructure, which is complexity. It earns its place by converting four criteria from "measured by hand, once, if someone remembers" into "checked on every commit" — and by measuring the real serialised request rather than an approximation taken above the provider client.

## Project Structure

### Documentation (this feature)

```text
specs/006-context-diet/
├── plan.md              # This file
├── research.md          # Phase 0 output — R1-R5, measured
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── stage-tools.md   # Which tools each stage offers
├── checklists/requirements.md
├── baseline.md          # Created by the first task
├── spec.md
└── tasks.md             # Created by /speckit-tasks
```

### Source Code (repository root)

```text
source/
├── models/
│   └── analysis-stage.ts        # NEW — stages and the tools each offers
└── services/
    ├── ai-service.ts            # MODIFIED — capture in code, per-stage tools,
    │                            #   setPageSnapshot removed, reminder branch removed
    └── mcp-client.ts            # MODIFIED — narrow the adapted tool set

tests/
├── models/analysis-stage.spec.ts        # NEW
├── services/ai-service.spec.ts          # MODIFIED
├── mocks/handlers/provider.ts           # NEW — Responses API handlers, scriptable
├── mocks/provider-recorder.ts           # NEW — captures request bodies, reports sizes
└── e2e/context-budget.spec.ts           # NEW — the measured criteria
```

**Structure Decision**: The existing layout holds. The stage model is a pure model so the stage→tools mapping is unit-testable without a browser or a provider; everything else is a subtraction from `ai-service.ts`. The new mock handlers live beside the existing `tests/mocks/handlers/oauth.ts` rather than inventing a second convention.

## Design Decisions

### D1. The snapshot is captured where the tool result arrives

The capture tool's result is intercepted as it comes back from the browser server and written straight to the report builder. The model still sees the result — that is how it analyses the page — it simply is not asked to repeat it. `setPageSnapshot` is deleted, and the prompt's step 3 with it.

Byte-identity (SC-001) follows from never re-serialising: the string the server returned is the string stored.

### D2. Stage decides the tool set, and the loop decides the stage

Three stages: not yet loaded, loaded but not captured, ready to judge. The loop tracks which one it is in from what has succeeded so far, and builds the tool map for that stage on each iteration. Per R4 this needs no SDK step-control feature — the loop already makes one call per iteration.

The sequence becomes structural: capture is not offered before navigation has succeeded, so it cannot be called early. That is what lets the reminder branch go.

### D3. Filtering happens at the client, not the server

The pinned browser server does have category switches, but its performance category is exactly what 007 needs. Narrowing at the client (`tools({schemas})`) achieves the requirement without a setting the next feature has to undo, and per R3 the cost being removed is per-request either way.

### D4. The harness records, it does not assert

The msw handler captures bodies and hands them to the test; the assertions live in the tests. Keeping the recorder assertion-free is what lets the same recorder serve the size measurement, the tool-count check, the duplicate-snapshot check and the reminder-absence check.

### D5. Measurement is committed, not observed

The baseline is a number in `baseline.md` produced by running the harness on this branch's merge-base. SC-008 requires two runs to agree, which is what makes it a baseline rather than an anecdote.

## Open Risks

| Risk | Evidence | Handling |
| --- | --- | --- |
| Fixture size flatters the ratio | Phase 0 used a 6,800-char stand-in | First task fixes a representative fixture and records why that size |
| Removing the echo tool changes model behaviour, not just plumbing | The prompt changes too | Scripted E2E covers the mechanics; SC-010 covers the live judgement, as an optional runbook |
| Provider shape drift breaks the harness silently | R2 showed two validation failures with opaque messages | Handler asserts it was actually called; a test that intercepts nothing must fail, not pass |
| Stage tracking mis-detects a failed navigation | US3 scenario 3 | Stage advances on observed tool success, not on the model claiming it |

## Constitution Re-Check (post-design)

Re-evaluated after the Phase 1 artefacts below.

| Principle | Post-design | Verdict |
| --- | --- | --- |
| I | Unchanged | ✅ |
| II | Improved: the criteria that were hardest to test are now the ones with the most direct assertions | ✅ |
| III | No UI change; progress callbacks still fire on tool execution | ✅ |
| IV | Baseline is the first task and is reproducible without credentials | ✅ |
| V | Net subtraction in `source/`; the addition is test infrastructure that replaces manual measurement | ✅ |

**No violations.**
