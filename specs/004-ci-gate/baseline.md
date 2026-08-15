# Baseline: exit behaviour before the gate

**Task**: T001 | **Date**: 2026-08-14 | **Version**: 4.0.1 (`6bf5943`)

Records what `uxlint` does with exit codes today, so SC-004 ("existing configs produce byte-identical exit behaviour") can be checked against something real rather than remembered.

## What was capturable, and what was not

The task asked for three live runs. **None were runnable in this environment**, for a reason worth recording:

```text
$ node dist/source/cli.js
Error: libsecret-1.so.0: cannot open shared object file: No such file or directory
    at Object..node (node:internal/modules/cjs/loader:2030:18)
    ...
    at Object.<anonymous> (node_modules/keytar/lib/keytar.js:1:14)
exit=1
```

The CLI does not start. `source/cli.tsx:10` statically imports `uxlint-client-base.js`, which imports `keychain-impl.js`, which does `import * as keytar from 'keytar'` at module top level. ES module imports are eager, so **keytar loads on every invocation, including CI mode where authentication is never used**. On a Linux host without `libsecret` — which describes most slim CI containers — the process dies before any argument is parsed.

This is out of scope for 004 and is filed separately. It is recorded here because it changes what "baseline" can mean for this feature, and because a CI gate is worth little on a binary that cannot boot in CI.

## Baseline, derived from source

Read from `source/ci-runner.ts` and `source/cli.tsx` at 4.0.1 rather than observed:

| Situation | Exit code | Source |
| --- | --- | --- |
| Analysis completes, any number of findings | `0` | `ci-runner.ts:106` — unconditional `process.exit(0)` |
| Analysis throws | `1` | `ci-runner.ts:119` |
| Config file missing | `1` | `cli.tsx:123` |
| Config invalid | `1` | `cli.tsx:135`, `cli.tsx:153` |
| Interrupted (SIGINT) | `130` | `cli.tsx:96` |

The first row is the whole reason this feature exists: **findings never influence the exit code**. A run with 20 critical findings, a run with none, and a run where every page failed are indistinguishable to a pipeline.

## How SC-004 is actually enforced

Not by re-running these three scenarios by hand. The table above is a statement about code, and the regression guarantee is asserted the same way — as tests:

- `runCIAnalysis` resolves to `0` when analysis completes and no `thresholds` block is present, regardless of findings (T012 at the evaluator level, T007 at the runner level)
- `runCIAnalysis` resolves to `1` when analysis throws
- A report containing failed pages with no `thresholds` block still resolves to `0`

That is stronger than a manual capture: it runs on every push, and it fails loudly if someone later makes gating implicit. T034 checks the implementation against this file; the tests are what keep it true.
