# Contract: Measurement

**Feature**: 007-deterministic-audit
**Date**: 2026-08-19

This is the contract between uxlint and the browser server for taking a
measurement, and between measurement and the rest of the analysis.

---

## The central rule: the model never calls these tools

The measurement tools are **not** added to `stageTools`. They are not adapted,
not offered, not named in the prompt. uxlint calls them itself through
`mcpClient.callTool(...)`.

Three independent reasons, each sufficient:

1. **The tools cannot deliver findings to a model anyway.** The audit's reply
   is a 409-byte summary of counts and file paths; the violations live in a
   156 KB JSON file on disk (research.md R1). A model offered this tool would
   receive no rule ids to act on.
2. **The trace reply is 5–7 KB of mostly boilerplate**, of which 4,324 bytes is
   a static format description repeated on every call (research.md R4). Handing
   that to the model would spend a fifth of the SC-007 budget on a preamble.
3. **Tool definitions are re-sent on every request.** Feature 006 cut the
   per-request tool set to two to stop paying that cost. Adding two more would
   undo a measured 59% saving to obtain information the model cannot use.

**Consequence**: this feature adds **zero** tool definitions to any model
request. FR-021's budget is unaffected by the tools themselves; only the
digest of FR-015 and the note of FR-018 cost anything.

---

## Calling the audit

```ts
await mcpClient.callTool({
	name: 'lighthouse_audit',
	arguments: {mode: 'snapshot', device: 'desktop'},
	options: {signal: AbortSignal.timeout(measurementTimeoutMs)},
});
```

**`mode: 'snapshot'` is required, not a default.** The tool's own default is
`'navigation'`, which reloads the page — making the structure captured earlier
and the state audited two different loads. Snapshot mode audits the DOM that is
there, and is 2.7× faster (research.md R3).

### Reply shape

`CallToolResult` with exactly `content` and `isError`. **There is no
`structuredContent`** — the server populates it and `@ai-sdk/mcp` drops it
(research.md R8). The text content is, in full:

```text
## Lighthouse Audit Results
Mode: snapshot
Device: desktop
URL: <url or the literal "undefined" in snapshot mode>
### Category Scores
- Accessibility: 67 (accessibility)
- Best Practices: 100 (best-practices)
- SEO: 50 (seo)
- Agentic Browsing: 50 (agentic-browsing)
### Audit Summary
Passed: 14
Failed: 7
Total Timing: 1494.77ms
### Reports
- /tmp/chrome-devtools-mcp-P5zGUG/report.json
- /tmp/chrome-devtools-mcp-lBV0ll/report.html
```

### Parsing obligations

| From | Take | Rule |
| --- | --- | --- |
| `### Category Scores` | `- <Title>: <score> (<id>)` | `id` is the key, `score` is 0–100 |
| `### Reports` | the line ending `.json` | this is the only route to the violations |

The `URL:` line is ignored — it reads `undefined` in snapshot mode.

A reply that does not parse is **`{state: 'not-taken', reason: 'unparseable'}`**,
never an exception. A wording change in a future server version must degrade
the report, not break the run.

### Reading the report

The JSON is a Lighthouse result (`lighthouseVersion: 13.4.1` as measured).
Violations are the accessibility category's failing audits:

```ts
lhr.categories.accessibility.auditRefs
	.map(ref => lhr.audits[ref.id])
	.filter(audit => audit.score !== null && audit.score < 1)
	.map(audit => ({
		ruleId: audit.id,
		title: audit.title,
		impact: audit.details?.debugData?.impact,
		affectedElements: audit.details?.items?.length ?? 0,
	}));
```

- `score === null` means *not applicable*, and must not be read as a failure.
- An audit with no `impact` is skipped and logged. Every failing audit carried
  one in the measured run, but a rule without one has no basis for a severity
  and guessing a default is the defect this feature removes.
- `lighthouseVersion` is recorded as run provenance.

**The report directory is deleted after reading** — 156 KB of JSON plus an HTML
report per audit, in a fresh random temp directory per call (research.md R7).

---

## Calling the trace

```ts
await mcpClient.callTool({
	name: 'performance_start_trace',
	arguments: {reload: true, autoStop: true},
	options: {signal: AbortSignal.timeout(measurementTimeoutMs)},
});
```

One call, not two: with `autoStop: true` the server records, waits, and stops
by itself. `performance_stop_trace` is not called.

**This call reloads the page.** It must therefore run *after* the audit, or the
audit would be judging a page state the snapshot no longer describes. Ordering
is part of this contract:

```text
navigate_page → take_snapshot → lighthouse_audit(snapshot) → performance_start_trace
```

### Reply shape

Text containing an insight set. Metrics are parsed from the observed block:

```text
## insight set id: NAVIGATION_0
Metrics (lab / observed):
  - LCP: 80 ms, event: (eventKey: r-1357, ts: 864375136336), nodeId: 12
  - LCP breakdown:
  - CLS: 0.00
```

| Metric | Line | Absent when |
| --- | --- | --- |
| LCP | `  - LCP: <n> ms, …` | the trace captured no navigation (`insight set id: NO_NAVIGATION`) |
| CLS | `  - CLS: <n>` | not observed in measurement, but treated as possible |

`- LCP breakdown:` is a heading, not a metric — a parser matching `LCP` loosely
will read it as one. Match the value form.

**FCP is not available.** Its only occurrence is
`estimated metric savings: FCP 0 ms` inside an insight, which is a projected
saving from a suggested fix and not the page's First Contentful Paint. It must
not be parsed (research.md R4).

Each metric is independently `Measured`: the trace succeeding does not mean LCP
exists (FR-006a).

---

## Timeouts

Both calls carry `options.signal`. The bound is **60 seconds** per measurement
(research.md R5).

An abort rejects with `MCPClientError: Request was aborted` and is recorded as
`{state: 'not-taken', reason: 'timed-out'}`.

**The connection survives an abort, but not for free**: the abandoned work goes
on running inside the browser, and the next call queues behind it — a
`take_snapshot` that normally costs 7 ms took 4,661 ms after an aborted audit
(research.md R6). Callers must not treat a slow call following a timeout as a
second fault.

---

## Failure is a value, never an exception

Every route to "no measurement" produces a `Measured` in the `not-taken` state:

| Route | Reason |
| --- | --- |
| Page never reached `analysable` | `page-not-loaded` |
| `isError: true` on the reply | `tool-failed` |
| Call threw, including abort | `timed-out` / `tool-failed` |
| Reply or report unparseable | `unparseable` |
| Report file unreadable | `unparseable` |

**No path from a measurement failure to a failed page.** FR-005 forbids it and
the failure it is guarding against — D8, where an error path erased every page
already analysed — has been paid for once in this repository already.

Note that the server signals failure by **returning** `isError: true`, not by
throwing. Feature 005 documented this and feature 006 shipped a bug by
forgetting it. `readToolOutcome` already collapses both routes and is reused
here rather than re-derived.

---

## What the model receives

Not the audit reply, not the trace reply, not the report JSON. A digest,
assembled by uxlint and placed in the page prompt (FR-015):

```text
## Verified measurements for this page
Accessibility score: 67/100
These accessibility rules were verified as failing (do not re-report them):
- color-contrast (serious, 3 elements): Background and foreground colors do not have a sufficient contrast ratio.
- image-alt (critical, 1 element): Image elements do not have `[alt]` attributes
Largest Contentful Paint: 80 ms · Cumulative Layout Shift: 0.00
```

Roughly 300–600 bytes for a typical page, against a 192,000-byte budget
(SC-007). Its purposes are FR-015 (the model does not contradict or duplicate
what was measured) and FR-018 (the model has something to write its one note
about).

The digest is **not** a finding and is never rendered as one.
