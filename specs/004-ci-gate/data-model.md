# Phase 1 Data Model: CI Gate

**Feature**: `004-ci-gate` | **Date**: 2026-08-14

Three entities. Two are configuration input, one is the evaluation output. All live in `source/models/`, are pure data, and carry no I/O — which is what puts them under Constitution II's "models get Ava unit tests" rule.

---

## `Thresholds`

The pipeline owner's declared limits. Every field is optional; **absent means "not gated on this"**, which is distinct from `0` meaning "none permitted" (spec Edge Cases).

| Field | Type | Meaning when absent |
| --- | --- | --- |
| `maxCritical` | non-negative integer | critical findings are not gated |
| `maxHigh` | non-negative integer | high findings are not gated |
| `maxMedium` | non-negative integer | medium findings are not gated |
| `maxLow` | non-negative integer | low findings are not gated |
| `failOnPartial` | boolean | defaults to `true` |
| `failOnFailedPage` | boolean | defaults to `true` |

Attaches to `UxLintConfig` as an optional `thresholds` property, so a config without the block is unchanged (FR-004).

**Defaults deserve a note.** The two coverage flags default to `true` while the severity limits default to absent. That asymmetry is deliberate: a severity budget is a policy choice a team must make, but a run built on pages that failed or were cut short is not evidence of anything, so treating that as a failure is the safe default once the user has opted into gating at all. A config with `thresholds: {}` therefore gates on coverage and nothing else. A config with no `thresholds` key gates on nothing (FR-004).

**Validation rules** (FR-013, enforced before analysis begins):

- Each `max*` value must be an integer `>= 0`. Rejects strings, negatives, fractions, `NaN`, `Infinity`.
- Each `failOn*` value must be a boolean.
- Any key not in the table above is rejected by name.
- `thresholds` itself, if present, must be an object — not an array, not null.

### Severity mapping

The four `max*` fields map one-to-one onto the existing `FindingSeverity` union (`'critical' | 'high' | 'medium' | 'low'`). No new severity vocabulary is introduced (spec Assumptions). The mapping is expressed as a single lookup so that adding a severity later touches one place.

---

## `Breach`

One violated rule. The unit the output is rendered from — each breach must explain itself in one line of CI log (spec Key Entities).

Two shapes, distinguished by kind:

**Severity breach**

| Field | Meaning |
| --- | --- |
| `kind` | `'severity'` |
| `severity` | which level |
| `limit` | configured maximum |
| `count` | observed count |

**Coverage breach**

| Field | Meaning |
| --- | --- |
| `kind` | `'partial-pages'` or `'failed-pages'` |
| `pages` | affected URLs, each with its recorded error where one exists |

The failed-page variant carries the error string the report records per page, because FR-008 requires the reason in the output. That string exists on `PageAnalysis.error` as of 4.0.1.

---

## `GateResult`

The verdict. Produced by the evaluator, consumed by the renderer and by the exit-code decision.

| Field | Type | Purpose |
| --- | --- | --- |
| `passed` | boolean | drives the exit status |
| `breaches` | `Breach[]` | empty when passed; every violated rule when not (FR-007 — all breaches, not the first) |
| `evaluated` | array of `{severity, limit, count}` | every threshold that was checked, breached or not |
| `analyzedNothing` | boolean | true when no page completed or partially completed |

`evaluated` exists for FR-009: a passing run must still show that the gate ran and what it saw. Without it a passing log is indistinguishable from a log where the gate was silently misconfigured — the exact failure mode US3 exists to prevent.

`analyzedNothing` is separate from the coverage breaches because FR-012 makes it fail **regardless of configuration**, including when `failOnFailedPage` is explicitly `false`. Folding it into a coverage breach would let a user disable it.

### Derivation

Given a `UxReport` and a `Thresholds`:

1. `analyzedNothing` ← `metadata.analyzedPages` and `metadata.partialPages` are both empty **and** at least one page was attempted. (An empty report from an empty page list is a configuration problem the loader already rejects.)
2. Severity counts ← tally `report.prioritizedFindings` by severity. This includes findings from partial and failed pages (R3, FR-011).
3. For each declared `max*`: record in `evaluated`; if `count > limit`, append a severity `Breach`. **Strictly greater** — equality passes (FR-006).
4. If `failOnPartial` and `metadata.partialPages` is non-empty → coverage breach.
5. If `failOnFailedPage` and `metadata.failedPages` is non-empty → coverage breach, with each page's recorded error.
6. `passed` ← `breaches` is empty **and** `analyzedNothing` is false.

Step 2 reads `prioritizedFindings` rather than re-walking `report.pages`, so the gate counts exactly what the report's own statistics table shows. A gate that disagrees with the document it gates on would be its own bug class.

---

## State transitions

None. All three entities are immutable values computed once per run. `GateResult` is derived, never mutated.

---

## Relationship to existing models

```
UxLintConfig ──(new optional field)──> Thresholds
                                            │
UxReport ───────────────────────────────────┤
   │  metadata.analyzedPages                │
   │  metadata.partialPages     ┌───────────▼─────────┐
   │  metadata.failedPages ────>│   evaluateGate()    │──> GateResult
   │  prioritizedFindings       └─────────────────────┘         │
   │                                                            │
   └── pages[].error ───────────────────────────────────────────┘
                        (failed-page reasons for the breach output)
```

`UxReport` is unchanged by this feature — 4.0.1 already added everything the gate needs (`partialPages`, populated `failedPages`, per-page `error`, findings counted across all statuses). This feature only reads.
