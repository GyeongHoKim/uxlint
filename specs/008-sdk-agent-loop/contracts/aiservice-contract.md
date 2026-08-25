# Contract: AIService & Run Assembly

Feature: 008-sdk-agent-loop · Date: 2026-08-24
Audience: consumers of the analysis path — `source/ci-runner.ts`,
`source/hooks/use-analysis.ts`, tests.

This feature changes **who constructs** the analysis objects and removes two
module exports. Everything else about the consumed contract is frozen.

## Removed module surface (`services/ai-service.ts`, `services/report-builder.ts`)

| Removed | Replacement |
| --- | --- |
| `getAIService(config, verdict)` (cached, singleton builder) | `createAIService(config, verdict)` — fresh pair per run, see below |
| `resetAIService()` (test cache clear) | not needed; construct per test |
| exported `reportBuilder` singleton from `report-builder.ts` | run-owned instance returned by `createAIService` |

## New: run assembly

```ts
type AnalysisRun = {
  aiService: AIService;      // per-run instance
  reportBuilder: ReportBuilder; // per-run accumulator, same class as today
};

type AIServiceOverrides = {
  model?: LanguageModelV4;
  client?: MCPClient;
  builder?: ReportBuilder;
};

`overrides` exists for tests. Production calls omit it, so every run owns a
freshly constructed builder; injecting one shared builder carries its
retained analyses across runs, which is exactly what such a test opts into.

function createAIService(
  config: UxLintConfig,
  verdict: PreflightVerdict | undefined,
  overrides?: AIServiceOverrides,
): Promise<AnalysisRun>;
```

- Caller order of operations (unchanged semantics): `setProvenance` on
  `reportBuilder` → per page `aiService.analyzePage(...)` →
  `reportBuilder.generateFinalReport()` → `reportBuilder.saveReport(path)`.
- `AIService.close()` releases its MCP client and marks the instance closed.
  It no longer resets any shared state. A closed instance returns a failed
  `PageAnalysis` for further calls exactly as today (B4 guard retained).
- Two runs created back-to-back are fully isolated (spec US1-5).

## Preserved: `analyzePage`

```ts
analyzePage(config: UxLintConfig, page: Page,
  onProgress?: AnalysisProgressCallback): Promise<PageAnalysis>
```

- Signature, return shape, status semantics: unchanged (spec FR-005/FR-010).
- Failure recording: failed pages returned AND recorded in the run's report;
  earlier pages never discarded.

### `AnalysisProgressCallback`

Stage vocabulary unchanged: existing stages keep their meanings and payload
shapes. The activity display (US3) is served through the same callback with
concrete activity messages sourced from tool lifecycle events; no new stage
values are required by this contract. Any addition must be additive and
default-tolerant for CI callers that ignore messages.

## Preserved invariants (asserted by tests, not trust)

1. Transcript adjacency: measurement digest appears after the exchange it
   comments on in captured request messages.
2. Per-request tool definitions = current stage's tools only.
3. Stage advances only on observed tool outcomes.
4. Page close-out happens once, after all of a step's observations are
   applied, regardless of concurrent execution resolution order.
5. Stored snapshot bytes == browser output bytes.
6. Finding origin assigned by receiving code, never accepted from model input.
7. Page bound fires when the bounded call is the only pending work
   (plain-process verification, outside test runner).
8. Late-arrival safety: observations from an expired page's abandoned engine
   call are discarded after that page's close-out — no cross-page
   contamination within a run.
