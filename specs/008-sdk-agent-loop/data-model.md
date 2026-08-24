# Data Model: SDK Agent Loop

Feature: 008-sdk-agent-loop · Date: 2026-08-24

Behaviour-preserving refactor: no persisted schema changes. Entities below are
runtime structures; the report file format, finding shape (including `origin`
and `ruleId`), measurement records, and gate thresholds are all frozen by
spec SC-001.

## Entities

### Analysis Run *(new explicit boundary — previously implicit global)*

One execution of the analysis over a configuration.

| Aspect | Content |
| --- | --- |
| Owns | one `ReportBuilder` instance, one `AIService` instance, the page time bound configuration |
| Lifetime | created at run start (`createAIService`), discarded after finalise/save; consecutive runs share nothing |
| Invariants | no module-level mutable state reachable from it; `close()` releases its client and marks it closed without touching any other run's state |
| Replaces | module-level `reportBuilder` singleton + `aiServiceInstances` cache |

### PageAnalysis *(unchanged)*

Existing shape: pageUrl, features, snapshot, findings[], analysisTimestamp,
status, measurement, error?. Statuses: `complete` / `partial` / `failed`.

**State transitions (preserved exactly):**

| Transition | Trigger | Resulting status |
| --- | --- | --- |
| → complete | completion tool called **AND** stage reached `analysable` (successful non-empty capture) | `complete` |
| → partial | budget exhausted without completion; navigation failed then exited via escape hatch; capture empty/failed; **NEW:** page bound expired | `partial` (expiry recorded via existing error/reason channel) |
| → failed | exception during the page's analysis | `failed`, earlier pages preserved |

New transition only adds a *reason source* for `partial`; no status value is
added or renamed.

### Page Stage *(existing `analysis-stage.ts`, reused as-is)*

`unloaded → loaded → analysable`, advanced solely by observed tool results:

| From | Advancing tool | Requirement | To |
| --- | --- | --- | --- |
| unloaded | `navigate_page` | succeeded | loaded |
| loaded | `take_snapshot` | succeeded AND non-empty output | analysable |
| analysable | — (terminal) | — | — |

Completion tool offered at every stage. Measurement tools offered at none
(called by code, not model).

### Stop Conditions *(new runtime concept, replaces classifier)*

Declarative pair driving loop termination:

1. Step-budget cap — equivalent to today's twenty iterations.
2. Completion detection — most recent step contains a
   `completePageAnalysis` call.

Natural termination on non-tool-call finish reasons also applies (SDK
built-in), subsuming the old "model stopped → stop" branch.

### Page Time Bound *(new runtime concept)*

Per-page wall-clock limit owned by the run.

| Property | Value |
| --- | --- |
| Configuration | `.uxlintrc` key `analysis.pageTimeLimitMs` — positive integer milliseconds |
| Default | provisional 600000 ms; shipped value = baseline calibration (research R8) |
| Coverage | whole page bound: model calls AND tool executions AND measurement |
| Guarantee | fires as sole pending work in the process; does not depend on callees honouring cancellation |
| On expiry | owned race rejects → page closed `partial` with the expiry recorded as its reason → run proceeds to next page; late observations from the abandoned engine call are discarded |

## Validation Rules

- Observation scoping: lifecycle events from an expired page's abandoned
  engine call MUST be discarded after that page's close-out — no observation
  may attach to a closed page or leak into another page's record.
- Digest message adjacency: any injected user message sits strictly after the
  assistant/tool exchange of the step it comments on.
- Snapshot recording: only successful, non-empty capture results are stored;
  stored bytes identical to browser output.
- Finding origin: set by receiving code (`judgement` / `audit`), never by the
  model.
- Request bytes: tool definitions per request limited to current-stage tools
  (SC-006 envelope).
