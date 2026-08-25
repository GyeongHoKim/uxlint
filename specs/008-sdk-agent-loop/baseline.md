# 008 Baseline: pre-swap engine (manual loop)

Captured by `tests/e2e/agent-loop-baseline.spec.ts` in capture mode --
run ONCE on the manual loop, before the ToolLoopAgent swap, then committed
as the frozen "before". After the swap the same file runs in compare mode
and gates the change (SC-001 byte-identical, SC-006 ±1%).

Volatile fields normalised before storage: `**Generated**:` header and
`Generated on` footer (both derive from one `Date.now()` at render time).
Everything else in the stored markdown must reproduce byte for byte.

Recaptured 2026-08-26, post-review: the mid-run-failure outage handler had
recorded nothing, so its row counted only the healthy page's requests and
the compare gate was blind to request drift on the failed page. The handler
records now; the numeric table below was re-captured on the agent-loop
engine, and all four rendered reports reproduced byte for byte against the
frozen pre-swap files.

| case | requests | total bytes | wall clock (ms, mocked) |
| --- | --- | --- | --- |
| happy-path | 4 | 160911 | 165 |
| budget-exhaustion | 20 | 1463756 | 149 |
| failed-navigation | 2 | 6372 | 12 |
| mid-run-failure | 7 | 170043 | 6107 |

Wall clock is fixture-clock data (no network, no browser); it feeds the
SC-004 headroom calibration, not any external claim. Per-case rendered
reports sit beside this file as `baseline/<case>.md`; numeric captures in
`baseline/cases.json`.
