# Research: SDK Agent Loop

Feature: 008-sdk-agent-loop · Date: 2026-08-24
Method: every claim below was verified against `node_modules/ai@7.0.60` dist
output (`dist/index.d.ts`, `dist/index.js`) and by live import — not against
documentation. This follows the roadmap's standing rule that documents are a
verification target, not a source (005/007 lessons).

---

## R1. Loop-control primitives exist and match our needs

**Decision**: Delegate to `ToolLoopAgent` from `ai`; express both endings as
declarative stop conditions.

**Verified evidence**:

- Live import of `ai@7.0.60` exports: `ToolLoopAgent`, `stepCountIs`,
  `isStepCount`, `hasToolCall`, `isLoopFinished`, `getStepTimeoutMs`.
  (`node -e "import * as ai from 'ai'"` — all present as functions.)
- `ToolLoopAgentSettings` (`dist/index.d.ts:4932`) carries: `stopWhen`
  (Arrayable; **default is already `isStepCount(20)`**), `prepareStep`,
  `activeTools`, `toolChoice`, `instructions`, `model`, `toolsContext`,
  `runtimeContext`.
- `agent.generate({...})` (`dist/index.d.ts:5165`) accepts per-call:
  `abortSignal`, `timeout`, `onStepStart`, `onStepEnd`, `onToolExecutionStart`,
  `onToolExecutionEnd`, plus the prompt/messages spread. Returns
  `GenerateTextResult` with `steps[]`, `responseMessages`, `totalUsage`.
- `hasToolCall('completePageAnalysis')` stops when *the most recent step*
  contains a tool call with that name (`dist/index.d.ts:1785-1791`) — this is
  exactly what `processAgentResult`'s `'completed'` branch hand-rolls today.
- The loop terminates naturally on finish reasons other than `tool-calls`
  (`dist/index.d.ts:~1764`) — which subsumes the classifier's `false` branch
  ("a model that stops has stopped").

**Consequence**: `processAgentResult` and its three-valued return have no
surviving responsibility. The loop becomes:

```text
stopWhen = [isStepCount(20), hasToolCall('completePageAnalysis')]
```

**Alternatives considered**:

- Custom stop condition reading an observation queue — unnecessary;
  `hasToolCall` does it natively and reads the step content, which cannot drift
  from what the model actually called.
- Staying on `generateText` with `stopWhen` added — would work, but then we
  keep re-assembling messages/steps by hand for no reason; `ToolLoopAgent` is
  the same machinery packaged for exactly this shape.

---

## R2. Timeout mechanism — the 007 trap is REAL in the SDK, half of it

This is the feature's most important research finding.

**Decision**: Do NOT rely on the SDK's `timeout.totalMs` as the page bound.
Use an owned-timer race around the whole `agent.generate()` call (the
`withDeadline` pattern already proven in `source/services/measurement.ts`),
handing the resulting signal into the agent so it can abandon its own work.
SDK `timeout.stepMs` MAY be layered underneath as inner granularity but is not
load-bearing.

**Verified evidence**:

The SDK's internal timer plumbing has two paths with opposite event-loop
properties:

1. **`totalMs` → `AbortSignal.timeout()` — unref'd.**
   `mergeAbortSignals` (`dist/index.js:2716-2722`) converts numeric timeouts
   via `AbortSignal.timeout(signal)`. Node's `AbortSignal.timeout` timers are
   unref'd: they do not keep the process alive. In generate-text
   (`dist/index.js:5327-5333`) the merged signal is built as
   `mergeAbortSignals(abortSignal, totalTimeoutMs, stepController?.signal)` —
   i.e. the total bound lives on precisely the mechanism 007 proved can
   silently never fire when bounded work is the only pending handle.
2. **`stepMs` → ref'd `setTimeout` — reliable.**
   `setAbortTimeout` (`dist/index.js:2828-2841`) uses plain `setTimeout`
   (ref'd) to abort a per-step controller; invoked per iteration at
   `dist/index.js:5504` and in the stream path at `9593-9620`. This one does
   fire as sole pending work.

**Consequence vs spec FR-008**: property 2 ("fires even when the bounded call
is the only pending work") is satisfiable by `stepMs` alone but not by
`totalMs`. Since the page bound must cover tool executions too (spec US2-2),
and a page is many steps, the owned outer race is the only construction that
meets FR-008 outright. Our race rejects *our* await at the bound regardless of
callee behaviour (FR-008 property 1), while the abort signal gives the SDK a
chance to release resources early. Both properties hold by construction, and
US2-3/US2-4 acceptance scenarios test them directly.

**Alternatives considered**:

- SDK `timeout: {totalMs}` only — rejected: unref'd-timer path, fails US2-4.
- SDK `timeout: {stepMs: bound}` only — rejected: bounds each step separately,
  so N steps get N× the budget; the spec bounds the *page*.
- Owned race + `totalMs` belt-and-braces — accepted as harmless layering if
  desired; the owned race is authoritative either way.

---

## R3. Per-step tool exposure maps onto `prepareStep`

**Decision**: Keep `analysis-stage.ts` untouched as the single source of
truth; expose stage tools via `prepareStep`.

**Verified evidence**: `PrepareStepFunction` (`dist/index.d.ts:1637+`)
receives `{steps, stepNumber, model, instructions, messages, …}` and may
return `activeTools`, `toolChoice`, `instructions`, `messages` overrides
(`PrepareStepResult`, `dist/index.d.ts:1692-1735`). It runs before every step,
including the first.

**Design**: the service tracks the current stage exactly as today (advanced
only by observed tool results — FR-004). `prepareStep` returns
`{activeTools: toolsForStage(stage) ∩ available, toolChoice: 'auto'}`.
Completion stays offered at every stage (unchanged escape-hatch semantics).
An unloaded page still has no capture tool to call — sequence remains
structural (FR-003).

**Alternatives considered**:

- Rebuilding the tool object per step inside `prepareStep` — possible but
  pointless; `activeTools` exists precisely to narrow without changing types.
- Static full tool set — regression to pre-006 behaviour; forbidden by SC-006.

---

## R4. Measurement digest injection between steps

**Decision**: Move `measureOnceReadable` into `prepareStep`, injecting the
digest through the `messages` override.

**Verified evidence**: `PrepareStepResult.messages?: Array<ModelMessage>` —
"The override carries forward to later steps" (`dist/index.d.ts:1722-1726`).
`prepareStep` may be async (`MaybePromiseLike`).

**Design**: observations collected via `onToolExecutionEnd` (as today) are
drained when preparing the next step. If the stage just became `analysable`,
run the measurement (async, seconds) and return
`{messages: [...currentMessages, {role:'user', content: digest}]}`. The digest
lands after the assistant/tool exchange it comments on — never inside it
(FR-011 preserved byte-for-byte in transcript shape). If the loop ends before
another prepareStep (completion stop condition fired), there is nothing to
inject — identical to today's tail case.

**Alternatives considered**:

- Making measurement a deferred/model-called tool — rejected by 007 with live
  measurements (audit replies carry no actionable content; adding tool
  definitions costs request bytes for nothing).
- Injecting via `onStepFinish` — no such message-injection surface exists.

---

## R5. Progress events power the activity display (US3)

**Decision**: Drive UI activity labels from `onToolExecutionStart` /
`onToolExecutionEnd`; suppress filler while activity is reported.

**Verified evidence**: both callbacks exist on `generate()` (R1) with events
carrying `toolCall.toolName`, `toolCall.input`, `toolExecutionMs`
(`dist/index.d.ts:3141-3207`). They are the same callbacks the current code
already uses for observation — one subscription serves both purposes.

**Design**: `onProgress` gains an activity reporting path; existing stage
vocabulary unchanged (FR-010). Filler pool retained only where no engine
events exist (startup, report writing) — matches spec assumption.

---

## R6. Run-scoped state — remove the module accumulator

**Decision**: Delete the exported `reportBuilder` singleton and the
`aiServiceInstances` module cache. Introduce explicit run assembly:
`createAIService(config, verdict)` constructs a fresh `ReportBuilder` and
`AIService` pair per run and returns both. Callers (`ci-runner.ts`,
`hooks/use-analysis.ts`) own the builder for provenance/finalise/save.

**Evidence (current state)**: singleton exported at
`report-builder.ts:453`; consumed directly by `ci-runner.ts:22,50,88…` and
`use-analysis.ts:27,69…`; injected into cached services at
`ai-service.ts:804`. `close()` resets the shared builder (`ai-service.ts:187`)
— the root cause chain behind B1/B4 patches.

**Consequences**:

- Two consecutive analyses share nothing (US1-5, FR-009) by construction.
- `close()` shrinks: closes its client, marks closed; no global reset.
- Transport memoisation in `mcp-client.ts` is deliberately out of scope — it
  holds a connection, not analysis state; keeping it warm preserves
  interactive re-run latency. (Its reset hook moves from "service close" to
  explicit teardown if tests require.)
- The B4-era cache-eviction patch becomes dead code and is removed with its
  cache.

**On `toolsContext`** (spec plan note): `AIService` already receives the
builder by constructor and closes over the instance field in
`createReportTools` (`ai-service.ts:657-658`). Re-plumbing tools as generic
context consumers would add type parameters across adapted MCP tools with zero
behavioural gain. Constructor injection + per-run assembly satisfies FR-009.
Rejected `toolsContext` adoption as unjustified complexity (Constitution V).

**Alternatives considered**:

- Keeping the cache keyed by config, swapping in a fresh builder per run —
  rejected: two lifetimes (cached service vs per-run state) entangled again;
  the exact shape that produced B1/B4.

---

## R7. Test strategy under the delegated loop

**Decision**: Extend `tests/services/ai-service.spec.ts` (existing
`MockLanguageModelV4` suites) rather than replace.

**Evidence**: `MockLanguageModelV4` takes `{doGenerate, doStream}` callbacks;
the multi-step loop invokes `doGenerate` once per step, so scripted
multi-step interactions are queued responses (counter-based callback or
`mockValues`). Existing single-step fixtures remain valid as one-step scripts.

**Required red-phase cases** (written before implementation):

1. Multi-step happy path → complete status, byte-identical transcript shape
   (digest position asserted on captured request messages).
2. Budget exhaustion → partial.
3. Failed navigation → capture never offered, completion available → partial.
4. Completion + capture in one response → snapshot kept, status per evidence
   regardless of execution order.
5. Never-answering model → page closes at bound (+margin) with expiry reason;
   run continues. Includes the sole-pending-work variant (plain-process
   check, outside test runner).
6. Back-to-back analyses → second equals fresh first.
7. Activity events surfaced per executed step.

**Verification task folded into implementation TDD**: prove the queued-response
mock pattern drives the real `ToolLoopAgent` loop (first red test doubles as
this proof). If the mock shape mismatches, fix the fixture — never weaken the
assertion (006 lesson).

---

## R8. Baseline data for the shipped default bound (SC-004)

**Decision**: Capture page-duration baseline during implementation, before
fixing the default.

**Known figures**: audit in non-reloading mode ≈ 1.7 s; full measurement ≈
7.6 s/page (007 baseline); typical requests/page = 4 (006). Model-call latency
is unknown without provider credentials — same situation 006 solved by
capturing *request* facts without credentials.

**Method**: time the scripted e2e harness end-to-end per page (fixture clock,
no network) and record distribution in `baseline.md`; set default =
max(observed healthy × 10, floor). Provisional spec default 600 s stands until
then. Headroom assertion ships as a test against recorded numbers.

---

## Open items carried into tasks

- Exact abort-error classification when the owned controller fires mid-step
  (we control the rejection type from our race; classify SDK-side errors
  defensively, log file-only).
- Whether the deadline helper is extracted for sharing or imported from
  `measurement.ts` — decide at task time; do not duplicate the rationale
  comment if extracted.
