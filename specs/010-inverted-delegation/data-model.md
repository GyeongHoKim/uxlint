# Data Model: Host-Neutral Inverted Delegation

**Feature**: 010-inverted-delegation | **Date**: 2026-09-10

Four entities. Three of them already exist from 009 and are listed here for what
changes about them; one is new.

---

## Review run

**Existing** (`DelegationSession`), with a changed lifetime.

One review's deterministic output and the judgement recorded against it. A
directory under the OS temporary directory named `uxlint-delegate-<uuid>`, holding:

| File | Contents |
| --- | --- |
| `session.json` | The manifest: identity, the route that created it, and every page's evidence |
| `submissions.jsonl` | Append-only log of everything the intake accepted |

**What changes**

- **Identity is now the agent's handle.** On the launcher route the identity never
  leaves uxlint, because the same process creates and reads the run. Here `capture`
  prints it and every later verb requires it, which is what makes FR-012's
  isolation hold across invocations.
- **Lifetime spans invocations.** 009 disposes in a `finally` inside one process.
  Nothing here can hold that `finally`, so disposal moves to `discard` and to an
  age sweep on the next `capture` (research R4).
- **The manifest records which route created the run.** 009's manifest already
  carries `hostAgent`. On this route no host launched anything, so the field
  records the route instead of a launcher identity — see the state notes below.

**Validation rules**

- A run named by a verb must exist and carry a readable manifest, or the verb fails
  saying so (FR-013). It must never fall back to "the current run": a server or a
  command that guesses which review it belongs to writes findings into somebody
  else's report — the rule 009 states at `DelegationSession.load`.
- The log is untrusted on read. Every line is validated against the strict
  submission schema and dropped if it fails, including a line naming a page the run
  never captured. This is not new: it was added in 009 after a live Cursor Agent
  run appended a line of its own to a session log.
- Nothing about a run may be written inside the developer's repository (FR-015).

**Retention**: 24 hours from creation, swept on the next `capture`. Long enough to
resume a review the next morning, short enough that an abandoned capture does not
outlive the branch it was made on.

---

## Page evidence

**Existing** (`PageEvidence`), unchanged.

Everything an agent is given about one page: the page URL, its declared features,
the run's persona, the captured structure, a description of what was measured, and
— only when the page could not be read — the reason.

**What changes**: nothing about the entity. What changes is how it is delivered. On
the launcher route it is served through a tool call; here it is printed by
`evidence`. Both read the same field from the same manifest, which is what makes
SC-003's identical measured half true by construction rather than by comparison.

**Validation rules**

- A page whose capture failed is still served, carrying its reason (FR-004). A
  withheld page is indistinguishable to an agent from a page it has not reached
  yet, and that distinction is the whole of US3.
- Evidence is readable for one page or for all of them (FR-005), from the run,
  without re-opening a browser.

---

## Page judgement state

**Existing** (`PageJudgementTracker`), with one change in where it lives.

Where each page's judgement has reached: `not-started`, `open`, `finished`, or
`abandoned`.

**What changes**: on the launcher route the tracker is an in-memory object owned by
the judgement server for the life of one session. Here there is no long-lived
process, so the state has to be derived from the submission log on each invocation.
The transitions are the same and the refusals are the same; only the source
changes.

**State transitions** (unchanged from 009)

```text
not-started ──(evidence read for the page)──> open
open ──(page completed)──> finished
open ──(run ends with the page still open)──> abandoned
```

**Validation rules**

- A finding for a page that was never opened is refused, so a judgement is made on
  the evidence rather than on the URL.
- A submission naming a `finished` page is refused as late and changes nothing
  already recorded (FR-009).
- A page's status in the report comes from this state, never from the agent's
  account of itself (FR-011). On this route that matters more than on the launcher
  route, because there is no exit code to be tempted by.

---

## Judgement document

**New.** The document `submit` accepts, and the only new schema in the feature.

An agent composes one document covering one or more pages, rather than making one
call per finding as the tool route does. It carries, per page: the findings, at
most one note about the measured violations, and whether the page is finished.

**Fields**

| Field | Rule |
| --- | --- |
| Run identity | Must match the run being submitted to (FR-012) |
| Per-page entries | Each names a page of the run (FR-008) |
| Findings | Each is exactly what the existing intake accepts, and nothing more |
| Measurement note | At most one per page, and only where measurements were supplied |
| Page finished | A signal, not a status: uxlint records it and then decides status itself |

**Validation rules**

- **The document is split, not parsed.** `submit` decomposes it into the same
  per-page submissions the tool route produces and hands each to the existing
  `validateFinding`, so origin assignment has one implementation (FR-007,
  research R6). `submit` may not construct a finding itself.
- **A finding may not declare its own provenance.** `origin`, `ruleId` and
  `affectedElements` are refused outright, with a message naming the field
  (FR-007, FR-010). The schema is strict, so an unrecognised key is a rejection
  rather than something quietly dropped.
- **Partial acceptance is the normal case.** One bad finding must not discard a
  document's good ones, and the refusal has to name what was wrong well enough
  that the agent can correct it on a second call. This mirrors what the tool route
  gives an agent per call.
- **A malformed or truncated document leaves the run unchanged** (FR-010). Nothing
  is appended until the document parses.

---

## What is deliberately not modelled

- **No host adapter.** The inverted route has no notion of which agent is calling
  it (FR-016). The only agent-specific artefact in the feature is a copy
  destination for one `SKILL.md`.
- **No session timeout.** The launcher route bounds an agent it started, because a
  stuck child would hold a terminal. Here the agent is the caller and uxlint has no
  standing to time it out; the equivalent protection is the age sweep on the run.
- **No second report model.** `submit` hands what arrived to the existing report
  builder and gate. A route-specific report shape would be the fastest way to break
  SC-003.
