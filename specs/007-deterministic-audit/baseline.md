# Baseline & Measurements: 007-deterministic-audit

**Feature**: 007-deterministic-audit
**Recorded**: 2026-08-19
**Merge-base**: `52e799c` (v4.3.0)
**Browser**: Chrome for Testing 152.0.7977.42 · **Lighthouse**: 13.4.1 (bundled in `chrome-devtools-mcp@1.7.0`)

## Context budget (SC-007)

Measured with feature 006's intercepting harness, against the same 57,269-byte
page-structure fixture, so the comparison is between like and like.

| | v4.3.0 | This feature | Change |
| --- | --- | --- | --- |
| Requests per page | 4 | 4 | unchanged |
| **Total request bytes** | 153,913 | **159,869** | **+3.9%** |
| Tool definitions per request | 2, 2, 2, 2 | 2, 2, 3, 3 | +1 at the `analysable` stage |
| SC-007 ceiling | — | 192,000 | **17% of headroom used** |

The 5,956 extra bytes are the measurement digest (**747 bytes** on the fixture
page, measured live), the note tool's definition on the two requests that offer
it, and the prompt changes that stop the model guessing at what is now known.

**The audit and trace tools cost nothing**, because they are never offered to
the model. `measurement adds no browser tool to any request` asserts that on
every request of every run, so a regression cannot quietly undo feature 006's
saving to deliver a reply the model could not have used.

## Wall clock (SC-008)

Measured against the planted fixture served from localhost, driving the real
pinned server and a real browser.

| | |
| --- | --- |
| Measurement per page | **7,595 ms** and **7,664 ms** on two runs |
| — audit (`snapshot` mode) | ~1,700 ms |
| — trace | ~5,900 ms, of which **5,000 ms is a fixed sleep** the tracing tool performs by design |
| FR-005a bound | 60,000 ms |

Comfortably inside the bound, which is the point: the bound is a hang net, not
a budget. A localhost fixture is a floor, so a real site over a real network
will be higher — but it would have to be eight times higher before the bound
came into play.

## What the live run found (T058)

Running it is what caught the defect no test had. **The audit writes two files
— a JSON report and a 274 KB HTML one — and each lands in its own temp
directory.** Cleanup removed only the directory of the report we read, so every
audit left a quarter-megabyte behind:

```text
before: TEMP_LEFTOVERS 1     /tmp/chrome-devtools-mcp-XXXXXX/report.html
after:  TEMP_LEFTOVERS 0
```

Reachable on every single audit, invisible to every test here until one asked
the question. Now covered by `every directory the audit wrote to is deleted`.

This is the step feature 005 skipped and recorded as unfinished. It cost one
run and found one real bug.

### The rendered report, from that run

Real numbers, on a page with four planted accessibility defects:

```text
**Audit Engine**: Lighthouse 13.4.1

### Measured

| Page                    | Accessibility | LCP   | CLS  |
|-------------------------|---------------|-------|------|
| http://127.0.0.1:44593/ | 67/100        | 95 ms | 0.00 |
```

and the violations, each carrying the rule that caught it:

```text
color-contrast (serious, 3 elements) → high
html-has-lang  (serious, 1 element)  → high
image-alt      (critical, 1 element) → critical
landmark-one-main (moderate, 1)      → medium
```

## Coverage (T059)

Read from the text reporter and **asserted against the 80% minimum**, not
merely recorded — `test:coverage` omits `--check-coverage`, so its exit code is
always 0 (D18, out of scope here).

| File | Stmts | Branch | Funcs | Lines |
| --- | --- | --- | --- | --- |
| `source/models/measurement.ts` | 100 | 100 | 100 | 100 |
| `source/models/analysis-stage.ts` | 100 | 100 | 100 | 100 |
| `source/components/analysis-progress.tsx` | 100 | 90.9 | 100 | 100 |
| `source/infrastructure/reports/report-generator.ts` | 99.54 | 91.54 | 100 | 99.54 |
| `source/services/measurement.ts` | 96.98 | 83.69 | 100 | 96.98 |
| `source/services/ai-service.ts` | 95.80 | 82.71 | 85.00 | 95.80 |
| `source/services/report-builder.ts` | 95.21 | 84.61 | 100 | 95.21 |

**Every file this feature adds or changes clears 80% on all four metrics.**
`report-builder.ts` did not at first — 77.41% branch — and the gap was exactly
the branches this feature added: recording the audit engine with no provenance
to attach to, a measurement arriving with no page open, and a page carrying no
note. Tested rather than waived.

`source/models/analysis.ts` reports 0% and is unchanged in that respect: its
runtime helpers had no tests before this feature and still have none. Out of
scope here, and part of D18.

Whole-project coverage moved 74.32% → 74.40%. D18 stands.

## Success criteria

| | Verified by | Status |
| --- | --- | --- |
| SC-001 planted defect in the rendered report | `planted defect` | ✅ |
| SC-002 every finding states its origin | `every finding states its origin` | ✅ |
| SC-003 violation set reproducible | `violation set is reproducible` | ✅ |
| SC-004 absence renders as absence | `absent measurement` | ✅ |
| SC-005 a failed audit loses no findings | `audit failure loses nothing` | ✅ |
| SC-006 one finding per rule, stating N | `one finding per rule` | ✅ |
| SC-007 ≤ 192,000 bytes per page | `the request budget for a page is within the threshold (SC-007)` | ✅ 159,869 |
| SC-008 ≤ 60 s per page | live run | ✅ 7.6 s |
| SC-008a a measurement that never returns | `a measurement that never returns` | ✅ |
| SC-009 no performance finding | `no performance finding` | ✅ |
| SC-009a the measuring phase is named | `measuring phase` | ✅ |
| SC-010 one note per page | `one note per page` | ✅ |
| SC-011 the audit's own wording | `audit wording is unaltered`, `measured findings carry the audit wording, never ours` | ✅ |

## Two things the tests caught before they shipped

**The deadline was not ours to keep.** `call` passed an `AbortSignal` to the
client and awaited the result. A client that ignores the signal would have hung
the run — the bound existed only if the callee chose to honour it. The call is
now raced against a timer this process owns.

**`AbortSignal.timeout` could not have been that timer.** Its internal timer is
unref'd, so when the only pending work is a call that never settles, nothing
keeps the event loop alive, the abort never fires, and the process simply
stops. Reproduced outside the test runner before the fix.

Both were found by a test asserting a property — that a measurement which never
returns still lets the page finish — rather than by a test asserting a value.
