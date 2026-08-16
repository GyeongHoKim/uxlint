# Quickstart: Validating the Context Diet

**Feature**: 006-context-diet

How to prove this feature works. Unlike 005, almost all of it runs in CI with no provider account and no browser — the criteria are about what the system puts into a request, which is observable at the point the request would be sent.

## Prerequisites

- Node >=22.22.2
- No provider account. The harness intercepts the endpoint; a placeholder key satisfies the client
- No browser. The browser server is stubbed at the tool boundary for these tests
- A real provider account and Chrome are needed **only** for SC-009, the release check

## 0. Record the baseline — after the harness, before any source change

Do **not** check out the merge-base: that would delete the harness doing the measuring. Phase 1 adds test files only, so `source/` is still identical to the merge-base and the measurement is equivalent.

```bash
git diff $(git merge-base main HEAD) -- source/   # must be empty
npm run build
npx ava tests/e2e/context-budget.spec.ts          # records, does not assert thresholds
```

Write the numbers into `specs/006-context-diet/baseline.md`: median request bytes per page, tool count per request, and requests per page. Unlike 005's baseline this needs no credentials and reruns identically on any machine — SC-008 requires exactly that.

## 1. The snapshot is the browser's (US1, SC-001)

```bash
npm run build
npx ava tests/services/ai-service.spec.ts
```

Expected: for fixtures from small to over 100 KB, the recorded snapshot equals the capture tool's output byte for byte. A page whose capture never succeeded records an empty snapshot and a status that says so.

## 2. Requests carry what the analysis uses (US2, SC-002/003/004)

```bash
npx ava tests/e2e/context-budget.spec.ts
```

Expected against the recorded baseline:

- median request bytes per page down ≥40%
- the page structure appears at most once in any body
- every request's tool array matches the stage it belongs to — see [contracts/stage-tools.md](./contracts/stage-tools.md)

## 3. The sequence is structural (US3, SC-005)

```bash
npx ava tests/e2e/context-budget.spec.ts tests/models/analysis-stage.spec.ts
```

Script the intercepted provider to reply out of order and to stop early. Expected: the out-of-order tool was never offered, and no request body contains reminder text.

## 4. A missing browser tool fails before spending anything (SC-007)

```bash
npx ava tests/services/mcp-client.spec.ts
```

Expected: a browser server without `navigate_page` or `take_snapshot` fails within 5 seconds, names the tool, and issues zero provider requests.

## 5. Measurement is reproducible (SC-008)

```bash
npx ava tests/e2e/context-budget.spec.ts
npx ava tests/e2e/context-budget.spec.ts
```

Expected: identical numbers. A measurement that drifts between runs on one commit cannot support a threshold.

## 6. Release check — the only live one (SC-009)

Needs `UXLINT_AI_API_KEY`, Chrome, and real targets.

```bash
npm run build
node dist/source/cli.js
```

Expected: median findings per page within 20% of the same measurement before the change. This is the one question the harness cannot answer — it is about what the model does with what it is given, not about what it is given.

## 7. Quality gates

```bash
npm run compile && npm run format && npm run lint
npm test
```

## Verifying against contracts

- Stage-to-tool mapping and the enforced invariants: [contracts/stage-tools.md](./contracts/stage-tools.md)
- Snapshot writer, stage transitions, recorded-request shape: [data-model.md](./data-model.md)
- Why the harness speaks the Responses API and not Chat Completions: [research.md](./research.md) R2
