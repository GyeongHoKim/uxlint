# Quickstart: Validating SDK Agent Loop

Feature: 008-sdk-agent-loop
Everything here runs without provider credentials or a real browser — the
same property that let 006/007 measure honestly.

## Prerequisites

- Node.js >=22.22.2 (repo pins 24 via `.nvmrc`)
- `npm install` completed
- No API key, no Chrome required for the automated checks below

## Quality gates (every task, in order)

```bash
npm run compile   # zero errors
npm run format    # prettier applied
npm run lint      # xo, zero violations
```

Before pushing the branch: full `npm test` (build + prettier check + xo +
ava). The 004 lesson stands — build-only type errors otherwise reach CI.

## Behaviour-preservation proof (SC-001, SC-006)

The scripted capture harness intercepts outgoing requests and replays canned
responses (technique proven in `tests/e2e/context-budget.spec.ts`).

```bash
npx ava tests/services/ai-service.spec.ts     # mock-based suites incl. new cases
npx ava tests/e2e/context-budget.spec.ts      # request-byte equivalence ±1%
npx ava tests/ci-runner.spec.ts               # frontends pinned (FR-010)
npx ava tests/hooks/use-analysis.spec.tsx     # interactive flow pinned (FR-010)
```

Expected: all green. The four canonical scripts (happy path / budget
exhaustion / failed navigation / mid-run failure) produce rendered markdown
byte-identical to pre-swap captures; per-page request bytes within ±1%.
If a byte-diff appears, treat it as a regression first and a legitimate
transcript-shape change only with evidence written into this feature's docs.

## Hang protection demo (US2, SC-003)

```bash
npx ava tests/services/measurement-failure.spec.ts   # existing bound tests stay green
# plus the new never-answering page case in ai-service.spec.ts:
```

Expected: the affected page closes at its bound (+≤5 s), recorded `partial`
with the expiry reason; later pages still analysed. The sole-pending-work
property is additionally demonstrated by a plain `node dist/…` script noted in
`tasks.md` (outside Ava, where timer behaviour differs from production) —
mirroring 007's verification discipline.

## Isolation proof (US1-5, FR-009)

Back-to-back analyses in one process: second report equals a fresh single
run's report. Covered by a dedicated test; no manual steps.

## Activity display (US3, SC-005)

```bash
npx ava tests/components/   # progress component renders activity labels per step
```

Expected: each executed step surfaces at least one concrete activity label;
no filler message while activity is reported.

## Coverage gate (SC-007)

```bash
npm run test:coverage:gate   # analysis-path modules, all metrics ≥80%, nonzero below
```

The shared `npm run test:coverage` remains report-only: repository-wide
enforcement is D18 debt (74.98% lines today, UI components the known cause).
The gate covers exactly the modules this feature touches; adding a module to
this feature means adding it to the gate's include list.

## Manual smoke (optional, needs credentials + Chrome)

```bash
npm run build && node dist/cli.js            # interactive: watch activity labels during a run
node dist/ci.js                              # non-TTY path unchanged
```

Watch for: activity names replacing filler during analysis; measurement phase
display preserved; report file identical in structure to prior runs.
