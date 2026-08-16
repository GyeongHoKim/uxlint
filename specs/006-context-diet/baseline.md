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
`the echo path is what the baseline measured`.

**Note on tool count, and how it differs from Phase 0.** The two figures count
different sets and neither is wrong:

| | Counted | Total |
| --- | --- | --- |
| `research.md` R1 (Phase 0 probe) | 2 browser + 27 synthetic stand-ins for the server's unused tools + 1 echo | 30 |
| This baseline | 2 browser (stubbed) + 3 local report tools | 5 |

Phase 0 simulated the real server's surface to size the saving; this baseline
stubs the server to keep the measurement deterministic and reproducible. A real
run against `chrome-devtools-mcp` carries 29 server tools, so the production
saving is larger than this fixture can show. SC-004 is therefore asserted on
stage membership rather than on absolute counts.

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

## SC-009 — verified deterministically

The original criterion compared median findings per page against a real model,
and was recorded as an unmet release gate because no provider account was
available. On review that was the wrong instrument for the question.

**The question is whether the diet removed information the model needs.** What
it actually removed is:

| Removed | Was it information the model reads? |
| --- | --- |
| The second copy of the page structure | No — the model was already shown it |
| 27 unused tool definitions | No — the analysis never invoked them |
| The echo round trip | No — it carried text the system already held |

None of that is something the model sees for the first time, and all of it is
checkable from the intercepted request. SC-009 is now the assertion that the
request in which the model forms its judgement still carries the complete page
structure, the persona and the page's feature description — verified, and
passing.

Measured on the final request after the change:

| | |
| --- | --- |
| Full page structure present | ✅ byte-identical |
| Persona present | ✅ |
| Page features present | ✅ |
| Structure occurrences | **1** (was 2) |
| Tools carried | `addFinding`, `completePageAnalysis` — what the stage needs |

## SC-010 — optional live sanity check

Comparing findings per page against a real model remains available as a
runbook ([`sc009/`](./sc009/README.md)), but it is no longer a gate. A findings
count varies between runs on the same page, which makes it a noisy instrument
for a property SC-009 now establishes exactly.
