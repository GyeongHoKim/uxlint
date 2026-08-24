# 008 Baseline: pre-swap engine (manual loop)

Captured by `tests/e2e/agent-loop-baseline.spec.ts` in capture mode --
run ONCE on the manual loop, before the ToolLoopAgent swap, then committed
as the frozen "before". After the swap the same file runs in compare mode
and gates the change (SC-001 byte-identical, SC-006 ±1%).

Volatile fields normalised before storage: `**Generated**:` header and
`Generated on` footer (both derive from one `Date.now()` at render time).
Everything else in the stored markdown must reproduce byte for byte.

| case | requests | total bytes | wall clock (ms, mocked) |
| --- | --- | --- | --- |
| happy-path | 4 | 160911 | 130 |
| budget-exhaustion | 20 | 1463756 | 218 |
| failed-navigation | 2 | 6372 | 8 |
| mid-run-failure | 4 | 160911 | 6075 |

Wall clock is fixture-clock data (no network, no browser); it feeds the
SC-004 headroom calibration, not any external claim. Per-case rendered
reports sit beside this file as `baseline/<case>.md`; numeric captures in
`baseline/cases.json`.
