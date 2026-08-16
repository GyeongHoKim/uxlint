# Contract: Analysis Stages and Their Tools

**Feature**: 006-context-diet

What the model is offered, and when. This is the contract `tests/e2e/context-budget.spec.ts` asserts against by reading intercepted request bodies.

## Stages

A page's analysis is in exactly one stage, determined by what has already succeeded — never by what the model says it did.

| Stage | Entered when | Tools offered | Why not the others |
| --- | --- | --- | --- |
| `unloaded` | The page analysis begins | `navigate_page` | Capturing an unloaded page records a blank tree as if it were the site |
| `loaded` | A navigation tool call returned success | `take_snapshot` | Findings before a capture would be judgements about nothing |
| `analysable` | A capture returned a non-empty result | `addFinding`, `completePageAnalysis` | Navigation and capture are done; re-offering them invites loops |

**Advancement is one-way within a page.** A stage is entered on observed tool success and does not fall back, so a later failed call cannot strand the analysis in an earlier stage.

## Tools removed entirely

| Tool | Reason |
| --- | --- |
| `setPageSnapshot` | The system now records the capture directly. Offering it would ask the model to retype text it was already shown, which is the cost this feature removes and the reason the stored snapshot could differ from the browser's output |
| Every browser-server tool other than `navigate_page` and `take_snapshot` | 27 definitions re-sent on every request (R3) for capabilities the analysis never invokes |

## Invariants the tests enforce

1. **No request carries a tool the current stage does not list.** (SC-004)
2. **No request body contains the page structure more than once.** (SC-003)
3. **No request body contains system-authored reminder text.** (SC-005)
4. **A required tool missing from the browser server fails the run before any request is sent.** (SC-007)

## Non-contract

Prompt *wording* is not fixed here. The prompt must stop instructing the model to echo the snapshot, because that tool is gone, but how the remaining instructions are phrased is an implementation choice — the invariants above are asserted against request bodies, not against prose.
