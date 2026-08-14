# Quickstart Validation: CI Gate

**Feature**: `004-ci-gate` | **Date**: 2026-08-14

How to prove the gate works end to end. Shape and semantics live in [contracts/config-thresholds.md](contracts/config-thresholds.md); entity details in [data-model.md](data-model.md). This file is the run guide.

## Prerequisites

```bash
nvm use            # Node 24, per .nvmrc
npm ci
npm run build
```

An LLM provider configured in `.env` (see `.env.example`). Scenarios 1–3 need a real analysis run; scenario 4 does not.

## Scenario 1 — A breach stops the pipeline

The primary flow (US1). Point the config at a page you expect to produce critical findings and forbid them.

```yaml
# .uxlintrc.yml
thresholds:
  maxCritical: 0
```

```bash
node dist/source/cli.js
echo "exit=$?"
```

**Expect** — non-zero exit; stdout names the critical budget, its limit, and the observed count; `ux-report.md` is written and its statistics table shows the same critical count the gate reported.

The last part is the one to actually check: a gate that disagrees with the report it gates on is worse than no gate.

## Scenario 2 — Equality passes

The boundary FR-006 fixes. Read the critical count from the report scenario 1 produced, set `maxCritical` to exactly that number, rerun.

**Expect** — exit `0`. Stdout still shows the evaluated threshold and count (FR-009), so the gate is visibly active in a green run.

## Scenario 3 — Incomplete coverage fails

US2. Add an unreachable URL so one page fails:

```yaml
subPageUrls:
  - http://127.0.0.1:9/
pages:
  - url: http://127.0.0.1:9/
    features: unreachable, to force a failed page
thresholds:
  failOnFailedPage: true
```

**Expect** — non-zero exit; stdout names `http://127.0.0.1:9/` **and its recorded reason** (FR-008); the report's Failed Pages section lists the same page and reason.

Then set `failOnFailedPage: false` with no severity limits and rerun: exit `0`, and the failed page is still reported as a warning (US2 scenario 3).

## Scenario 4 — A typo is loud, and costs nothing

US3, and the cheapest scenario — it never reaches analysis.

```yaml
thresholds:
  maxCritcal: 0 # deliberate typo
```

```bash
time node dist/source/cli.js
echo "exit=$?"
```

**Expect** — non-zero exit; the message names `maxCritcal`; **no browser launches and no model call is made** (SC-005). The `time` output should be well under a second, which is the observable proof that validation ran before analysis.

Repeat with `maxCritical: -1`, `maxCritical: 1.5`, and `failOnPartialPage: "yes"` — each names its own key and value.

## Scenario 5 — Existing configs are untouched

The regression guarantee (SC-004). Remove the `thresholds` block entirely and run three ways: a config that yields findings, one that yields none, and one containing the unreachable URL from scenario 3.

**Expect** — exit `0` in all three, matching 4.0.1 exactly.

This is the scenario most worth automating, because it is the one that breaks pipelines on upgrade.

## Scenario 6 — Interactive mode is unaffected

```bash
node dist/source/cli.js --interactive
```

**Expect** — threshold results are shown, and the exit status is whatever it is today (FR-014). A person watching a terminal is not a pipeline.

## Automated checks

```bash
npm test              # build → prettier --check → xo → ava
npm run test:coverage # c8, 80% floor
```

The gate evaluator is a pure function over `UxReport` and `Thresholds`, so its unit tests cover the boundary cases (equality, absent vs. zero, multi-breach, nothing-analysed) without a browser or a model. Scenarios 1–3 and 6 above are the manual confirmation that the wiring matches.

## Performance check (SC-006)

Evaluating the gate must add ≤50ms on a report of 500 findings across 50 pages. Build that report in a test fixture, time `evaluateGate` alone, and assert the budget. No live run needed — the evaluator takes data, not a browser.
