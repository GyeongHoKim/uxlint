# Baseline & Measurements: 006-context-diet

**Feature**: 006-context-diet
**Recorded**: 2026-08-16
**Merge-base**: `d663ea8`

## How this was measured

`tests/e2e/context-budget.spec.ts` drives a full page analysis through the real
provider client with its HTTP call intercepted, and reads the request bodies
that would have been sent. No provider account, no browser, no network.

Measured on this branch with Phase 1 complete and `source/` unchanged — verified
by `git diff d663ea8 -- source/` returning empty, so these numbers provably
describe the behaviour at the merge-base. Checking out the merge-base itself
would have deleted the harness doing the measuring.

## Fixture (T005)

| Property | Value |
| --- | --- |
| Page structure size | **57,269 bytes** |
| Shape | 900 links with descriptions, in the accessibility-tree text form the browser server returns |
| Marker | `ref=e899`, appearing once per copy |

**Why this size.** Phase 0 measured with a 6,800-character stand-in. That risks
flattering the result: the smaller the tree relative to the prompt and the tool
definitions, the less its duplication costs and the less removing it appears to
save. 57 KB sits in the range a real product or marketing page produces.

The marker deliberately contains no quote character. An earlier marker ended in
`"`, which JSON escapes to `\"` once the body is serialised, so the count came
back zero — reading as "no duplication found" rather than as "the count is
broken".

## Baseline — today's behaviour (T006)

Script: the sequence today's prompt instructs, including the `setPageSnapshot`
echo. A baseline without that call would describe a run nobody has.

| Measurement | Value |
| --- | --- |
| Requests per page | **5** |
| Total request bytes | **350,420** |
| Median request bytes | **66,395** |
| Tool definitions per request | **5** (`navigate_page`, `take_snapshot`, `addFinding`, `setPageSnapshot`, `completePageAnalysis`) |
| Page structure copies, per request | **0, 0, 1, 2, 2** |

The `2, 2` is the duplication this feature removes: from the fourth request on,
the tree appears twice in the same body — once as the capture tool's result and
once as the argument of the echo call. It is asserted, not merely recorded, by
`today the tree is carried twice in the same request`.

**Note on tool count.** Five is what the *stubbed* browser server offers. A real
run adds the other 27 tools the pinned server exposes, so the tool-definition
saving in production is larger than this fixture can show. The fixture measures
what it can measure deterministically; the tool-narrowing criterion (SC-004) is
asserted on stage membership rather than on absolute counts for this reason.

## Reproducibility (T007, SC-008)

Two runs on this commit produced identical totals and identical per-request tool
lists. Asserted by `the measurement is reproducible across runs (SC-008)`, so a
future drift fails the suite rather than quietly moving the baseline.

## Threshold (T008)

SC-002 requires total request bytes per page to fall by at least 40%.

| | Value |
| --- | --- |
| Baseline total | 350,420 bytes |
| **SC-002 threshold** | **≤ 210,252 bytes** (baseline × 0.6) |

**Total rather than median, and the change matters.** Removing the echo removes
a whole request, so the before and after runs have different request counts. A
median over an even-length list is the mean of the two middle values; over an
odd-length list it is a single sample. Comparing those two compares statistics
rather than runs — the median appeared to move by 1.5% while the bytes actually
sent fell by 61%. Total is also simply what a run pays.

## Result after the change (T030)

| Measurement | Baseline | After | Change |
| --- | --- | --- | --- |
| Requests per page | 5 | **4** | one round trip removed |
| **Total request bytes** | 350,420 | **135,580** | **−61%** (threshold: −40%) |
| Tool definitions per request | 5 | **2** | only the stage's tools |
| Page structure copies, per request | 0, 0, 1, 2, 2 | **0, 0, 1, 1** | never twice |
| Stored snapshot | echoed by the model | **byte-identical to the browser's output** | |
| Page status | complete | complete | unchanged |

The removed request is the echo call itself: a whole model round trip that
existed only to move text the system already had.

## Coverage (T033)

Read from the text reporter, not the exit status — `test:coverage` omits
`--check-coverage`, so its exit code is always 0 (D18, out of scope here).

| File | Stmts | Branch | Funcs | Lines |
| --- | --- | --- | --- | --- |
| `source/models/analysis-stage.ts` | 100 | 100 | 100 | 100 |
| `source/services/ai-service.ts` | 95.0 | 82.8 | 86.7 | 95.0 |
| `source/services/mcp-client.ts` | 96.2 | 85.2 | 100 | 96.2 |

All above the 80% threshold on every metric.

## Documentation (T032)

No change required. `README.md` documents configuration and the state machine
but never described the echo step, so removing it left nothing stale behind.
Checked rather than assumed.

## Outstanding: SC-009 is an unmet release gate (T036 not performed, T037)

**SC-009 has not been checked.** It could not be: the implementing environment
had no provider account and no Chrome, and it is the one criterion that needs
both.

| What it asks | Whether a cheaper context is quietly a weaker analysis — median findings per page within 20% of the same measurement before the change |
| --- | --- |
| Needs | A provider account, Chrome, and the fixed real target set |
| Status | ⬜ **Not performed** |

Everything else this feature claims is enforced by the test suite on every
commit. This one is not, and recording it is not verifying it. A model given a
smaller context could plausibly produce fewer or shallower findings, and no
measurement here would notice.

**Before release**, run [`sc009/run.sh`](./sc009/README.md):

```bash
cd specs/006-context-diet/sc009
UXLINT_AI_PROVIDER=anthropic UXLINT_AI_API_KEY=sk-... ./run.sh
```

It runs the analysis three times on `d663ea8` and three times on this branch
against a committed target set, and reports the change in median findings per
page. If it has fallen more than 20%, the diet has cost analysis quality and
the design needs revisiting — not the threshold.

The report parser was verified against output from the real report generator,
so the only thing missing is the model.
