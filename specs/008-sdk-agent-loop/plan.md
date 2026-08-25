# Implementation Plan: SDK Agent Loop

**Branch**: `008-sdk-agent-loop` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-sdk-agent-loop/spec.md`

## Summary

Replace the hand-written agent loop in `AIService.analyzePage` (manual
iteration counter, three-valued result classifier, single-step-per-call
workaround documented as load-bearing) with the AI SDK's native loop control
(`ToolLoopAgent` + declarative stop conditions), keeping observable behaviour
frozen: same rendered reports, same statuses, same transcript shape. Absorb
the long-standing timeout gap with a per-page time bound owned by the run
(raced timer, not delegated cancellation), and scope report accumulation to an
analysis run instead of the module singleton.

Everything delegated here was verified against the installed `ai@7.0.60`
dist output, not documentation — see [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript (ES modules), Node.js >=22.22.2 (dev/CI on 24 via `.nvmrc`)

**Primary Dependencies**: `ai@7.0.60` (`ToolLoopAgent`, `stepCountIs`/`isStepCount`, `hasToolCall`, `prepareStep`, `TimeoutConfiguration`), `@ai-sdk/mcp@2.0.30`, `zod/v4`

**Storage**: N/A (report file output unchanged; measurement JSON side-files unchanged)

**Testing**: Ava against precompiled `dist/` (`@ava/typescript`, `compile: false`); `MockLanguageModelV4` from `ai/test`; ink-testing-library for UI; c8 coverage

**Target Platform**: CLI (interactive Ink TTY + non-TTY CI runner)

**Project Type**: cli

**Performance Goals**:

- Bound expiry closes the page within bound + 5 s wall clock even when every wrapped call hangs forever (spec SC-003)
- Shipped default bound ≥10× headroom over measured healthy page durations (spec SC-004; baseline captured during implementation)
- Per-page request bytes within ±1% of pre-swap measurements for identical scripted interactions (spec SC-006)

**Constraints**: Observable behaviour frozen (spec SC-001 byte-identical rendered reports across four canonical cases); transcript validity rules (digest adjacency) non-negotiable (some providers reject malformed transcripts); stdout is MCP-protocol-reserved — logging stays file-only

**Scale/Scope**: One service rewrite (`source/services/ai-service.ts`), run-assembly change rippling to two callers (`ci-runner.ts`, `hooks/use-analysis.ts`), stage-machine module reused as-is, test suite extension

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
| --- | --- | --- |
| I. Code Quality Gates | ✅ Pass | compile → format → lint after every task; plus full `npm test` before push (004 lesson: build-only type errors reached CI) |
| II. Test-First Development | ✅ Pass | `MockLanguageModelV4` suites written first (red), including stop-condition, bound-expiry, and isolation cases; existing behavioural assertions in `tests/services/ai-service.spec.ts` must survive with mechanical adaptation only (SC-002). Multi-step mock sequencing verified as a research task R7 before red tests |
| III. Persona-First Design | ✅ Pass | Spec names both personas (CI operator, interactive developer); US2 serves the first, US3 the second |
| IV. Performance Accountability | ✅ Pass | Measurable goals above; no evidence-free constants — provisional 600 s bound explicitly marked for baseline calibration |
| V. Simplicity & Minimalism | ✅ Pass | Net code deletion: removes manual loop, classifier, reminder logic, and the load-bearing comment. One deliberate simplification choice (keep constructor-injected builder closure instead of adopting generic `toolsContext` plumbing) justified in research R6 |

## Project Structure

### Documentation (this feature)

```text
specs/008-sdk-agent-loop/
├── plan.md              # This file
├── research.md          # Phase 0 output — SDK primitives verified in dist/
├── data-model.md        # Phase 1 output — run/page/stage entities
├── contracts/           # Phase 1 output — internal module contracts
│   └── aiservice-contract.md
├── quickstart.md        # Phase 1 output — validation guide
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
source/
├── models/
│   └── analysis-stage.ts      # Stage machine — REUSED AS-IS (data-driven, already loop-agnostic)
├── services/
│   ├── ai-service.ts          # Loop replaced with ToolLoopAgent; processAgentResult deleted;
│   │                          # measureOnceReadable moves into prepareStep; page bound added
│   ├── report-builder.ts      # Class unchanged; exported singleton removed (R6)
│   ├── measurement.ts         # withDeadline pattern extracted/reused for page bound
│   └── mcp-client.ts          # Amended in review: close() releases the
│                              # memoised transport (identity-checked reset)
├── ci-runner.ts               # Owns a per-run builder via run assembly (R6)
└── hooks/use-analysis.ts      # Same ownership change

tests/
├── services/ai-service.spec.ts     # Extended: multi-step scripts, stop conditions, bound, isolation
├── e2e/context-budget.spec.ts      # Reused technique: SC-001/SC-006 capture harness
└── components/…                    # US3 activity-display assertions
```

**Structure Decision**: Single-project layout unchanged. All changes land on the
existing analysis path; no new modules except a small run-assembly export in
`ai-service.ts` and (if extraction proves cleaner than import) a deadline
helper shared with `measurement.ts`.

## Complexity Tracking

> No constitutional violations to justify. One anti-complexity note: the spec's
> FR-009 does not require adopting the SDK's generic `toolsContext`
> parameterisation — `AIService` already injects the builder through its
> constructor and closes over the instance field in `createReportTools`. Making
> tool functions generic over a context type would add type parameter noise to
> every adapted MCP tool for zero behavioural gain. Rejected as unjustified
> complexity (Constitution V); see research R6.
