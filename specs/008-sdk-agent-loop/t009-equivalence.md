# T009: Equivalence verification record (SC-001, SC-006, FR-010)

Executed 2026-08-25 on branch `008-sdk-agent-loop`, after T008 (ToolLoopAgent
swap) and T012/T013/T015 landed. This file is the written justification T009
requires; no other acceptance evidence was needed because no drift occurred.

## SC-001 / SC-006: equivalence rerun

`tests/e2e/agent-loop-baseline.spec.ts` ran in compare mode against the frozen
pre-swap artefacts (`baseline/*.md`, `baseline/cases.json`):

| case | status | rendered markdown | request bytes |
| --- | --- | --- | --- |
| happy-path | complete | identical | 160911 vs 160911 (0%) |
| budget-exhaustion | partial | identical | 1463756 vs 1463756 (0%) |
| failed-navigation | partial | identical | 6372 vs 6372 (0%) |
| mid-run-failure | failed | identical | 160911 vs 160911 (0%) |

All four cases are byte-identical after the documented normalisation and show
zero request-byte drift, well inside the ±1% allowance. No diff existed, so no
diff justification is required.

## Amendment 2026-08-26: recording scope widened on mid-run-failure

Review found that the injected outage handler in the harness recorded
nothing, so the mid-run-failure row above counted only the healthy page's
requests -- the compare gate could not have seen request or retry drift on
the failed page. The handler records now, and `cases.json` / `baseline.md`
were re-captured: mid-run-failure measures 7 requests / 170043 bytes (the
three retrying outage calls included). All four rendered markdown files
reproduced byte-for-byte against the frozen pre-swap artefacts, so SC-001
stands unchanged; only the measured scope of the failed page moved.

## FR-010: behavioural pins on both frontends

`tests/ci-runner.spec.ts` and `tests/hooks/use-analysis.spec.tsx` pass as-is
(24 tests across both files). Their flows -- preflight gating, per-page
progress vocabulary, report save/close ordering, verdict emission, hook state
transitions -- carry no behavioural edits.

### Justification for the mechanical adaptations present in those files

Both files were touched once, by T007's run assembly: the injected dependency
changed shape from `getAIService(config)` plus a separately injected
`reportBuilder` to one `createRun()` returning `{aiService, reportBuilder}`.
The edits are exactly that signature rename at each injection site plus the
mock objects returning the new pair shape. No test body, assertion,
ordering expectation, or scenario was added, removed, or weakened; every
assertion still exercises the same production behaviour it did before the
branch. This satisfies SC-002's "mechanical adaptations only" clause for these
two files, and the standing-evidence role T009 assigns them is intact: they
compile against the new seam and pin the same observable flow.

## Gates run for this task

- `npm run compile` -- zero errors
- `npm run format` -- no changes needed
- `npm run lint` (xo) -- zero violations
- `npm test` -- 650 passed, 1 skipped at this task's run (the live-browser
  preflight integration case, intentionally skipped without
  credentials/Chrome). The final branch state, after the late-event scoping
  fix adjusted two suites, is 653 passed with the same single skip.
- `npm run test:coverage:gate` -- exit 0 (analysis-path aggregate 96.4%
  statements / 87.42% branches / 94.66% functions / 96.4% lines, above the
  80% thresholds on every metric)
