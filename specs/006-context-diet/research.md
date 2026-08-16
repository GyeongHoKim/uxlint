# Phase 0 Research: Context Diet

**Feature**: 006-context-diet
**Date**: 2026-08-16
**Method**: Execution. Every number below came from running the real provider client with its HTTP call intercepted, and reading the request body that would have been sent.

---

## R1. The duplicate snapshot is real, and it is in the third request

**What was run**: a two-configuration harness driving `generateText` through `@ai-sdk/openai` with `msw` intercepting the endpoint. One configuration reproduces today's shape — 30 tools offered, and a `setPageSnapshot` tool the model calls with the tree as its argument. The other offers 2 tools and no echo tool. Fixture snapshot: 6,800 characters.

**Observed**:

| Configuration | Tools offered | Requests | Total request bytes | Snapshot copies per request |
| --- | --- | --- | --- | --- |
| Today's shape | 30 | 3 | 54,852 | `[0, 1, 2]` |
| After the diet | 2 | 2 | 9,491 | `[0, 1]` |

**83% smaller.**

The `[0, 1, 2]` column is the finding. By the third request the accessibility tree appears **twice in the same body**: once as the result of the capture tool, and again as the argument of the echo call the model was asked to make. From that point every remaining turn carries both copies, because the conversation is replayed in full on each request.

That also removes a request outright: the echo call is a whole model round trip that exists only to move text the system already had.

**Note on the tool counts**: the 30 here is 2 browser tools plus 27 synthetic
stand-ins for the server's unused surface plus the echo tool — sized to
resemble a real run. The committed baseline in `baseline.md` counts a different
set (2 stubbed browser tools plus 3 local report tools) because it stubs the
server to stay deterministic. Neither is wrong; they count different things,
and `baseline.md` says which.

**Caveat on the 83%**: this is a synthetic fixture. The real ratio depends on how large a page's tree is relative to the prompt and the findings. It sits far enough above the spec's 40% floor to be confident, not far enough to restate the floor as a promise.

---

## R2. "OpenAI-compatible" is not one protocol — the client uses the Responses API

**Decision**: the interception handler must speak the **Responses API**, not Chat Completions.

**What was run**: the first probe mocked `POST /v1/chat/completions` with a `choices[]` reply. The client never called that endpoint.

**Observed**: `@ai-sdk/openai` posts to **`https://api.openai.com/v1/responses`**, and:

| | Chat Completions (assumed) | Responses (actual) |
| --- | --- | --- |
| Conversation field | `messages[]` | **`input[]`** |
| Tool shape | `{type:'function', function:{name,…}}` | **`{type:'function', name, description, parameters}`** |
| Tool result turn | `{role:'tool', …}` | **`{type:'function_call_output', call_id, output}`** |
| Reply body | `choices[].message` | **`output[]`** |
| Usage field | `prompt_tokens` / `completion_tokens` | **`input_tokens` / `output_tokens`** |

Two further details cost a probe each, and are recorded so they cost nobody else one:

- `usage` must carry `input_tokens` and `output_tokens`, or the client rejects the response as invalid JSON — an error that names neither usage nor the endpoint.
- A text reply's content part must include `annotations: []`. Omitting it fails validation the same opaque way.

**Why this matters beyond the harness**: a naive "mock an OpenAI-compatible server" would have targeted the wrong endpoint and produced a passing test that never intercepted anything, or a failing one whose error points at JSON parsing rather than at protocol shape.

---

## R3. Tool definitions are re-sent on every request, in full

**Observed**: each intercepted body carries the complete tool array — name, description and full JSON Schema for every tool — not a reference to a previously-sent set. With 30 tools that is a fixed cost paid on every turn of every page.

This is why tool filtering is worth as much as it is: the saving is per request, multiplied by iterations, multiplied by pages. It also means the measurement is straightforward — the tool array is right there in the body.

---

## R4. Stage-varying tool exposure needs no SDK feature

**Decision**: vary the `tools` map per iteration in the existing loop. Do not reach for `prepareStep`.

**Reasoning from the code**: `analyzePage` builds its `tools` object once before the loop and passes the same object to every `generateText` call. The loop already runs one call per iteration with no `stopWhen`, so moving the construction inside the loop and selecting by stage is a smaller change than introducing step-control machinery — and `prepareStep` is designed for the multi-step runs this loop deliberately avoids.

**Alternative considered**: `prepareStep` with `activeTools`. Rejected for this feature: it belongs to the SDK-driven loop that 008 introduces, and adopting it here would mean building the mechanism twice.

---

## R5. The reminder message is measurable, and is a symptom

`processAgentResult` appends "Please complete your analysis by calling addFinding…" when the model stops without finishing. Under the diet the sequence is enforced by what is offered, so the branch should become unreachable rather than merely unused.

Because the reminder is literal text in a request body, SC-005 is checked by asserting its absence across every intercepted request — no special instrumentation.

---

## Verification status

| # | Finding | Status |
| --- | --- | --- |
| R1 | Duplicate snapshot in request 3; 83% reduction on the fixture | **Executed** |
| R2 | Responses API shape, and the two validation gotchas | **Executed** — both failures reproduced, then fixed |
| R3 | Full tool definitions re-sent per request | **Executed** |
| R4 | Stage-varying tools needs no `prepareStep` | Read from the code; not yet executed |
| R5 | Reminder text is assertable from request bodies | Read from the code |

**Not executed**: anything involving a real model or real pages. No criterion depends on it — SC-009 was later rewritten as a deterministic check on the intercepted request, and the live findings comparison became the optional SC-010 runbook.

---

## Open items for Phase 1

1. **Which provider the harness pins.** The measurement runs through one provider's serialisation. Pinning the one under test keeps the numbers comparable; the reduction ratio is what the criterion is about, not the absolute byte count.
2. **Fixture snapshot size.** The baseline should use a tree representative of a real page rather than the 6,800-character stand-in used here, so the ratio is not flattered by an unusually large or small fixture.
3. **Whether the echo tool's removal changes completion behaviour.** Removing a tool the prompt told the model to call means the prompt changes too; the scripted E2E flow covers the mechanics, and SC-009 covers whether the model still receives everything it judges on.
