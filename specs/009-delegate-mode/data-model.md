# Phase 1 Data Model: Delegate Mode

**Feature**: 009-delegate-mode | **Date**: 2026-09-09

This feature adds no new report-facing types. `UxFinding`, `PageAnalysis`,
`AnalysisStatus`, `FindingOrigin`, `PageMeasurement` and `UxReport` are reused
exactly as they are, which is what makes spec SC-002 — an identical measured
portion — achievable rather than merely intended. The new types below all
belong to the delegation machinery and none of them reach a report.

---

## DelegationSession

One delegated run. Created by the orchestrator before any browser work, torn
down on every exit path (FR-019).

| Field | Meaning |
| --- | --- |
| `id` | Identity of this run. Distinct per run so two concurrent runs cannot read each other's submissions (FR-017) |
| `directory` | Absolute path outside the developer's repository. Holds submissions in transit between the judgement server process and the orchestrator (FR-013 forbids anything inside the repository) |
| `pages` | The evidence set, in configuration order |
| `hostAgent` | Which adapter is performing the judgement; recorded on the report (FR-020) |

**Lifecycle**: `created` → `capturing` → `judging` → `collected` → `disposed`.
Disposal is unconditional: it happens on success, on host agent failure, on
time-bound expiry and on an orchestrator exception.

**Identity and isolation**: the directory path *is* the identity. The
orchestrator exports it as `UXLINT_DELEGATE_SESSION` when launching the host
agent, and the judgement server reads it from its own environment (R5). A
server process that finds no such variable, or a directory that does not exist,
must fail loudly rather than guess: a submission written to the wrong place is a
finding silently lost from someone's report.

---

## PageEvidence

Everything the host agent is given about one page. Produced entirely without a
model, and served through tools rather than embedded in a prompt (R6).

| Field | Source | Notes |
| --- | --- | --- |
| `pageUrl` | Configuration | Also the key the host agent uses to submit against this page |
| `features` | Configuration | The page's declared features |
| `persona` | Configuration | The run's persona; repeated per page for the same reason the built-in mode puts it in the system prompt |
| `snapshot` | Browser capture | The browser's own output, unaltered. Never re-encoded, shortened or paraphrased — the same guarantee `recordCapture` enforces today |
| `measurementDigest` | Measurement service | The human-readable description of what was measured, identical to what the built-in mode places in front of the model |
| `capture` | Derived | Whether the page became readable at all. A page whose capture failed is served with the reason, so the host agent is not asked to judge nothing |

**Validation**: evidence for a page whose capture failed MUST still be served,
carrying its failure reason. Withholding it would leave the host agent unable to
distinguish a page it has not reached from a page there is nothing to say about.

---

## JudgementSubmission

What arrives at the judgement server from the host agent. It is *not* a
`UxFinding` — it becomes one only after ingest.

| Field | Constraint |
| --- | --- |
| `severity` | One of `critical`, `high`, `medium`, `low` |
| `category` | Non-empty |
| `description` | Non-empty |
| `personaRelevance` | Array of strings |
| `recommendation` | Non-empty |
| `pageUrl` | MUST match a page in this session's evidence set |

**Deliberately absent**: `origin`, `ruleId`, `affectedElements`. The first is
assigned by uxlint on receipt (FR-009); the second and third exist only on
measured findings, and a submitter able to set them would be claiming a
verification that never happened. This mirrors the built-in mode's
`UxFindingSchema`, which omits `origin` for exactly this reason.

**Transformation on ingest**: a valid submission becomes a `UxFinding` with
`origin: 'judgement'` and no rule identifier. An invalid one is rejected at the
moment of arrival, and the rejection names what was wrong so the host agent can
correct itself on its next call (FR-008).

---

## PageJudgementState

Tracked per page, inside the single session, so that FR-022's per-page
delimitation survives a shared session.

| State | Meaning | Resulting page status |
| --- | --- | --- |
| `not-started` | The host agent never asked for this page's evidence | `partial`, reason: judgement did not reach this page |
| `open` | Evidence served, submissions accepted | — |
| `finished` | The host agent signalled completion for this page | `complete` when the page was captured, `partial` otherwise |
| `abandoned` | The session ended while this page was open | `partial`, reason: the session ended before this page was finished |

**Why no new status is needed**: FR-023 requires that a page judgement never
reached is distinguishable from one judged clean. It already is. A page judged
clean is `complete` with zero judgement findings; a page never reached is
`partial` carrying its reason. The existing `partial` semantics — introduced by
the CI gate feature to distinguish a finished sweep from one that stopped short
— are exactly the distinction this feature needs, and reusing them keeps the
gate's behaviour unchanged.

**Late submissions**: a submission naming a page whose state is `finished` or
`abandoned` is rejected rather than attached. The built-in mode already drops
results that outlive their page; the same rule applies here, and here it is
enforceable by state rather than by epoch, because the page is named explicitly.

---

## HostAgentAdapter

The knowledge of one agent CLI. Three implementations, one contract.

| Member | Responsibility |
| --- | --- |
| `id` | `claude-code`, `codex`, `cursor-agent`. Recorded on the report |
| `detect()` | Whether the CLI is installed, and whether it is authenticated. Runs before any browser is started (FR-016) |
| `buildLaunch(session)` | The command, arguments, environment and stdin content for this run. Pure, so the command line can be asserted in a test without spawning anything |
| `run(launch)` | Executes it and returns an outcome |

**Invariants every implementation must satisfy**:

1. The launch enforces the host's read-only posture, and the developer's own
   settings cannot widen it (FR-012, R4).
2. The launch carries `UXLINT_DELEGATE_SESSION` into the environment.
3. The prompt reaches the agent by whatever route that agent's argument parser
   makes safe — for Claude Code that is stdin, because `--allowedTools` is
   variadic and swallows a trailing positional (R2).
4. Nothing is written into the developer's repository (FR-013). The Cursor
   adapter in particular never registers itself; registration is a documented
   one-time step performed by the developer (R3).

---

## HostAgentOutcome

How a session ended. Read from what arrived at the judgement server, not from
the agent's own account of itself (R9).

| Field | Use |
| --- | --- |
| `pagesFinished` | Which pages reached `finished`. Decides each page's status |
| `terminated` | `completed`, `failed`, or `timed-out` |
| `exitCode`, `stderrSummary` | Explanation only. A non-zero exit with nothing submitted distinguishes "could not run" from "ran and judged nothing", which FR-016's error messages need |

**Rule**: the outcome never overrides page state. If the agent exits non-zero
after finishing four of seven pages, those four keep their findings and their
`complete` status; the remaining three are `partial`. An exit code is not
evidence about a page.

---

## Relationships

```text
DelegationSession 1 ─── * PageEvidence          (configuration order)
DelegationSession 1 ─── 1 HostAgentAdapter      (selected before capture)
DelegationSession 1 ─── 1 HostAgentOutcome      (produced when the session ends)
PageEvidence      1 ─── 1 PageJudgementState
PageEvidence      1 ─── * JudgementSubmission   (accepted only while `open`)
JudgementSubmission  ──→ UxFinding              (via ingest; origin assigned here)
```
