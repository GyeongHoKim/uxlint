# Data Model: Context Diet

**Feature**: 006-context-diet | **Date**: 2026-08-16

This feature adds no report fields and changes no stored shapes. What changes is who writes one existing field, and what governs the tool set.

---

## 1. Captured snapshot (existing field, new writer)

`PageAnalysis.snapshot` already exists. Today it is written by the model through a tool call; after this feature it is written by the system from the capture tool's result.

| Property | Before | After |
| --- | --- | --- |
| Source | The model's re-emission of what it read | The browser server's result, verbatim |
| Fidelity | Unverifiable — may be truncated or altered | Byte-identical by construction |
| Written on | The model choosing to call the echo tool | Every successful capture |

**Rules**

- An error result is not a snapshot and must not be recorded (FR-004).
- A later successful capture replaces an earlier one; copies do not accumulate.
- A page with no successful capture keeps an empty snapshot, and its status must reflect that rather than reading as fully analysed (FR-005).

---

## 2. Analysis stage (new, in-memory only)

Not persisted, not reported. It exists for the duration of one page's analysis and decides the offered tool set.

```text
PageStage = 'unloaded' | 'loaded' | 'analysable'
```

Named `PageStage` rather than `AnalysisStage`: `analysis.ts` already exports an
`AnalysisStage` for the interactive progress display, and two same-named types
with unrelated meanings in one module graph is a trap for the next auto-import.

**Transitions** — driven by observed tool results, never by model assertion:

```text
unloaded ──(navigation tool returned success)──> loaded
loaded   ──(capture returned a non-empty result)──> analysable
```

**Rules**

- One-way within a page; a failed later call does not move the stage back.
- A tool result reporting an error does not advance the stage. This is what stops a failed navigation from being followed by a capture of a blank page (FR-009).
- Every stage maps to a non-empty tool set; a stage offering nothing would stall the loop rather than end it.

---

## 3. Recorded request (test-only)

The harness's unit of measurement. Never part of the product.

| Field | Meaning |
| --- | --- |
| `body` | The request the provider client would have sent, as parsed JSON |
| `bytes` | Serialised size of that body |
| `toolNames` | Tool names carried in the request |
| `structureOccurrences` | How many times the fixture's page structure appears in the body |

**Rules**

- Recording is assertion-free — the same recorder serves the size, tool-count, duplication and reminder checks.
- A test that records zero requests must fail. An interception that never fires would otherwise pass every assertion vacuously.
