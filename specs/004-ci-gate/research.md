# Phase 0 Research: CI Gate

**Feature**: `004-ci-gate` | **Date**: 2026-08-14

Four questions had to be settled before the design could be written. Each is recorded as decision / rationale / alternatives.

---

## R1. How does the gate get a testable exit status out of `ci-runner`?

**Problem** — `runCIAnalysis()` (`source/ci-runner.ts`) calls `process.exit(0)` on success and `process.exit(1)` in its catch, and returns `Promise<void>`. `cli.tsx:145` invokes it as `void runCIAnalysis(parsed)` and never sees a result. A test cannot assert on an exit status without killing the test process, which is why `ci-runner` has no test file today. Constitution II (test-first, NON-NEGOTIABLE) cannot be satisfied against this shape.

**Decision** — Split the decision from the effect, in two layers:

1. A **pure evaluator**: `(report, thresholds) → GateResult`. No I/O, no process access. This is where all the logic lives and where the unit tests point.
2. `runCIAnalysis()` **returns an exit code** instead of calling `process.exit`. `cli.tsx` performs the exit.

The evaluator is a pure function over data, so it is a "model" under Constitution II and gets Ava unit tests directly. `runCIAnalysis` becomes thin enough that its remaining behaviour is covered by the evaluator's tests plus one integration-shaped test.

**Rationale** — The pure evaluator carries essentially all the risk in this feature (boundary conditions, which findings count, multi-breach reporting) and becomes fully testable with no process mocking at all. Moving the `process.exit` call up to `cli.tsx` is a small, mechanical change confined to one call site.

**Alternatives considered**

- *Inject an `exit` function into `runCIAnalysis`.* Rejected: it keeps the gate logic entangled with the runner and forces every test to build a fake process. Dependency injection here buys testability of the wiring, not of the logic that matters.
- *Leave `process.exit` in place and test by spawning the built CLI as a subprocess.* Rejected: slow, requires a live LLM and a browser, and would be the only test of its kind in the suite. It also cannot cover the boundary cases cheaply.
- *Throw a `GateFailureError` and let the existing catch map it to exit 1.* Rejected: the existing catch means "analysis broke". A breached threshold is a successful analysis with a policy verdict, and conflating the two would make FR-010 (report still written) fragile — the catch path predates the report write.

**Consequence for the PR** — this fulfils the note left in the 4.0.1 PR, which deferred `ci-runner`'s testability to this feature.

---

## R2. Hand-written validation or a schema library for the `thresholds` block?

**Problem** — FR-013 requires rejecting unknown keys and non-integer values *before analysis starts*. `zod` is already a dependency (`ai-service.ts` uses it for LLM tool schemas), and `z.object({...}).strict()` would give unknown-key rejection for free.

But configuration validation today is hand-written imperative code in `ConfigIO.validateConfig` (`config-io.ts:227-302`), throwing `ConfigurationError` with a `filePath` and a field name. A second, weaker validator also exists as the `isUxLintConfig` type guard (`models/config.ts`).

**Decision** — Extend the existing hand-written validator. Do not introduce zod into config validation.

**Rationale** — Constitution V. Introducing zod for one nested block would put two validation idioms inside a single function, and `ConfigurationError`'s shape (file path + offending field, used for the user-facing message) would need bridging from `ZodError` anyway. The unknown-key check that zod would give free is roughly five lines by hand against a known key list. Meanwhile the imperative validator's error messages are already tuned to name the file and field, which is exactly what FR-013 asks for.

**Alternatives considered**

- *Adopt zod for the whole config.* Genuinely tempting — it would delete the `isUxLintConfig` / `validateConfig` duplication noted below. Rejected as scope: it rewrites validation for every existing field, risks changing error messages users may depend on, and has nothing to do with gating. Worth its own feature.
- *Use zod for `thresholds` only.* Rejected per the rationale above: worst of both, two idioms in one function.

**Noted, not fixed here** — `ConfigIO.validateConfig` and `isUxLintConfig` are two independent validators of the same type that can disagree. `isUxLintConfig` does not currently validate `thresholds`, and this feature will not make it do so, because nothing in the analysis path calls it for that purpose. Recording it so the next reader knows the divergence is known rather than accidental.

---

## R3. Which findings does the gate count?

**Problem** — As of 4.0.1 the report includes findings from complete, partial *and* failed pages in `metadata.totalFindings` and `prioritizedFindings`. The gate has to decide whether to count all of them.

**Decision** — Count every finding in the report, matching `prioritizedFindings`. FR-011.

**Rationale** — The alternative lets a page produce critical findings and then fail, and the gate would pass on the grounds that the page "didn't count". That is the same class of bug the 4.0.1 fixes removed — evidence discarded because of how the page ended. Severity is a property of the finding, not of how far the sweep got. Coverage is what the separate incomplete-coverage checks (FR-003) exist to express.

**Alternatives considered**

- *Count only findings from complete pages.* Rejected per above.
- *Count complete and partial but not failed.* Rejected: arbitrary. A page that threw on iteration 15 and one that ran out of iterations at 20 differ in cause, not in the reality of what they observed.

---

## R4. What does the gate output look like, and where does it go?

**Problem** — This project forbids stdout/stderr for logging: those streams are reserved for MCP protocol messages, and everything goes to Winston file logs (`CLAUDE.md`, non-negotiable). But SC-003 requires a developer to diagnose a failure *from the CI log alone*, and FR-007/FR-008/FR-009 require the breach detail in the exit path's output.

These pull in opposite directions and the conflict is real, not apparent.

**Decision** — The gate verdict is written to **stdout from `cli.tsx`, after the MCP client has been closed**, immediately before `process.exit`. Not from `ci-runner` while analysis is in flight, and never from any code path that can run concurrently with MCP traffic.

**Rationale** — The stdout prohibition exists because MCP speaks JSON-RPC over the same stream during analysis. Once `aiService.close()` has run, the transport is shut down and no protocol message can follow. Writing the verdict at that point cannot interleave with anything. The alternative — a gate whose reason is only in a log file the CI viewer does not show — fails SC-003 outright and makes the feature much less useful than it looks.

The verdict is also written to the Winston log, so the detail survives in both places.

**Alternatives considered**

- *File log only.* Rejected: fails SC-003. The developer whose build broke would have to fetch a log artifact to learn which threshold they breached.
- *stderr instead of stdout.* Rejected: stderr is under the same prohibition, and CI log viewers show both identically, so it buys nothing.
- *Write the verdict during analysis as it becomes known.* Rejected: the verdict is not known until the report is complete, and it would sit inside the window where MCP owns the stream.

**Constraint carried into the plan** — the ordering (close MCP → write report → print verdict → exit) is load-bearing and must be asserted by a test, not left to convention.

---

## Resolved unknowns

| From Technical Context | Resolution |
| --- | --- |
| How to make exit status testable | R1 — pure evaluator + return code from `runCIAnalysis` |
| Validation approach for the new config block | R2 — extend hand-written `validateConfig`, no zod |
| Which findings count toward thresholds | R3 — all findings in the report |
| Where the verdict is written given the stdout prohibition | R4 — stdout from `cli.tsx` after MCP close, plus Winston |

No `NEEDS CLARIFICATION` markers remain.
