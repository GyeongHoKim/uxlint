# Contract: Analysis Stages and Their Tools

**Feature**: 006-context-diet

What the model is offered, and when. This is the contract `tests/e2e/context-budget.spec.ts` asserts against by reading intercepted request bodies.

## Stages

A page's analysis is in exactly one stage, determined by what has already succeeded — never by what the model says it did.

| Stage | Entered when | Tools offered | Source | Why not the others |
| --- | --- | --- | --- | --- |
| `unloaded` | The page analysis begins | `navigate_page`, `completePageAnalysis` | browser server, local | Capturing an unloaded page records a blank tree as if it were the site |
| `loaded` | A navigation tool call returned success | `take_snapshot`, `completePageAnalysis` | browser server, local | Findings before a capture would be judgements about nothing |
| `analysable` | A capture returned a non-empty result | `addFinding`, `completePageAnalysis` | **local** (`createReportTools()`) | Navigation and capture are done; re-offering them invites loops |

**Completion is offered at every stage**, because it is an exit rather than a step in the sequence. An earlier draft withheld it until a capture had succeeded, which left a page whose navigation failed with no way to end: the loop ran its full twenty iterations before giving up — a twentyfold cost increase on the failure path, in a feature whose subject is cost. Ending without a capture is recorded as `partial`, so the escape hatch cannot pass an unread page off as analysed.

**The Source column is load-bearing.** Only the browser-server tools are adapted from the MCP connection and therefore only they can be missing from it; the local ones are constructed by this project and always exist. A narrowing step that treated the whole table as one list would demand `addFinding` from the browser server and fail every run.

**Advancement is one-way within a page.** A stage is entered on observed tool success and does not fall back, so a later failed call cannot strand the analysis in an earlier stage.

## Tools removed entirely

| Tool | Reason |
| --- | --- |
| `setPageSnapshot` | The system now records the capture directly. Offering it would ask the model to retype text it was already shown, which is the cost this feature removes and the reason the stored snapshot could differ from the browser's output |
| Every browser-server tool other than `navigate_page` and `take_snapshot` | 27 definitions re-sent on every request (R3) for capabilities the analysis never invokes |

## Where the capture is observed

The snapshot is recorded from `generateText`'s `onToolExecutionEnd` callback, which was verified against the installed SDK to fire in this project's single-step loop — the callback is not limited to multi-step runs.

| Detail | Verified value |
| --- | --- |
| Tool identity | `event.toolCall.toolName` — **not** `event.toolName`, which is undefined |
| Success discriminator | `event.toolOutput.type === 'tool-result'` |
| Failure discriminator | `event.toolOutput.type === 'tool-error'` |
| Result value | `event.toolOutput.output` |

The failure discriminator is what satisfies FR-004: an errored capture is distinguishable at the point of observation, so it can be skipped rather than stored as if it were a snapshot.

## Invariants the tests enforce

1. **No request carries a tool the current stage does not list.** (SC-004)
2. **No request body contains the page structure more than once.** (SC-003)
3. **No request body contains system-authored reminder text.** (SC-005)
4. **A required tool missing from the browser server fails the run before any request is sent.** (SC-007)

## Non-contract

Prompt *wording* is not fixed here. The prompt must stop instructing the model to echo the snapshot, because that tool is gone, but how the remaining instructions are phrased is an implementation choice — the invariants above are asserted against request bodies, not against prose.
