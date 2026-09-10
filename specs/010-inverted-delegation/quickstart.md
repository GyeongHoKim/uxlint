# Quickstart: Inverted Delegation Validation

**Feature**: 010-inverted-delegation | **Date**: 2026-09-10

How to prove the feature works end to end. Each scenario names the success criteria
it closes. Contract details live in
[contracts/cli-surface.md](./contracts/cli-surface.md) and
[contracts/submission.md](./contracts/submission.md); entity behaviour lives in
[data-model.md](./data-model.md).

**The lesson this file inherits from 009**: every adapter there passed every test,
and one of them had never worked in a real run. Scenarios 1–5 are automatable and
should be. Scenarios 6–8 are not a formality — they are the only part that can
catch what tests built on assumptions cannot.

---

## Results

Filled in during implementation, as 009 did.

| Scenario | Status | Evidence |
| --- | --- | --- |
| 1 — the two halves, no agent | **Passed, run for real** | Chrome 152, `UXLINT_AI_API_KEY` unset. `capture` → `evidence` → `submit` by hand over two pages of news.ycombinator.com: 3 judgement findings accepted, 24 measured findings kept, report written |
| 2 — one page at a time | **Passed, run for real** | `evidence --page` served one page and started no browser. Payload measured at ~47 KB per page (94,809 bytes for two) |
| 3 — provenance cannot be forged | **Passed, run for real** | A finding carrying `origin: "audit"` and `ruleId` among two good ones was refused by name; the good two reached the report and the forged one did not |
| 4 — abandoned run | Not yet run | |
| 5 — concurrent runs | Not yet run | |
| 6 — Claude Code, live | Not yet run | |
| 7 — Codex, live | Not yet run | |
| 8 — Cursor Agent, live | Not yet run | |
| 9 — the launcher route still works | Not yet run | |

Measurements to record here, because the plan states them as goals and research
left them open:

- Per-page time for `capture`, against the launcher route's measured 8 s. It runs
  the same extracted capture pass, so the figure carries over; **still to be timed
  through this verb.**
- Per-verb scaffolding cost for `evidence`, `submit`, `runs` and `discard`, against
  009's measured 1.6–2.0 ms for judgement scaffolding. **Still open.**
- Evidence payload size per page. **Measured at ~47 KB per page** — 94,809 bytes
  for two pages of news.ycombinator.com.

**One defect the live run caught that no unit test did.** The judgement document
names each page once, in its page entry, and every finding was being refused for
a missing `pageUrl` — a field the envelope had already supplied one level up. The
unit tests passed because their helper filled it in, which made them a test of
the author's assumption rather than of the document an agent actually writes.
`submit` now attributes the page entry's URL to each finding, and a finding
naming a *different* page is refused rather than silently corrected. This is the
argument for scenarios 6–8 in one paragraph.

---

## Prerequisites

```bash
npm run build
```

A Chrome the browser preflight accepts, and a `.uxlintrc.yml` at the working
directory listing two or more pages, so per-page attribution and the partial-report
path are both exercisable.

**Critical for every scenario**: `UXLINT_AI_API_KEY` must be unset. The whole point
is that a review completes without it.

```bash
env -u UXLINT_AI_API_KEY node dist/source/cli.js delegate capture
```

---

## Scenario 1 — The two halves, with no agent involved (SC-001)

The core path, driven by hand so that it is provable without any agent.

1. Run `delegate capture`. Confirm it prints a run identity and one entry per page,
   and that it read no provider credential.
2. Run `delegate evidence --run <id>`. Confirm every page's evidence comes back,
   including the persona and the measurement description.
3. Write a judgement document by hand covering both pages.
4. Run `delegate submit --run <id> --file judgement.json`.
5. Confirm a report exists at the configured output path, carrying both measured
   findings (`origin: audit`, with rule identifiers) and judgement findings
   (`origin: judgement`, with none), and that the gate verdict was reported.

**Expected failure before the feature exists**: `delegate` is not a known command.

---

## Scenario 2 — One page at a time (FR-005, SC-006)

What justifies `capture` and `evidence` being separate verbs.

1. Run `delegate capture` once.
2. Run `delegate evidence --run <id> --page <first url>`, then again for the second.
3. Confirm no browser was started by either `evidence` call, and that the second
   call did not re-capture anything.
4. Record the per-page payload size.

---

## Scenario 3 — Provenance cannot be forged (SC-004, FR-007)

The rule the whole report rests on, attempted through this route.

1. Submit a finding carrying `origin: "audit"`. Confirm it is refused and the
   message names the field.
2. Submit a finding carrying `ruleId`. Same.
3. Submit a document mixing one such finding with two good ones. Confirm the good
   two are accepted, the bad one is refused by name, and the report contains exactly
   the two.
4. Append a line directly to the run's `submissions.jsonl` claiming
   `origin: "audit"`, then run `submit` again. Confirm it does not reach the report
   — this is the 009 hardening, re-checked from this route.

---

## Scenario 4 — A review that stops partway (US3, SC-007, FR-014)

1. Capture five pages. Submit judgement for three, marking those finished.
2. Assemble the report. Confirm the three carry findings and the other two are
   recorded as partial with a reason saying judgement never reached them.
3. Confirm `delegate runs` lists the run and shows three of five judged.
4. Confirm `delegate discard --run <id>` removes it, and that a second `discard` of
   the same identity still exits 0.
5. Capture again after moving a run's timestamp past the retention window. Confirm
   the old run is swept and the new one is not.

---

## Scenario 5 — Two reviews at once (FR-012)

1. Capture in two different directories with different configurations, at the same
   time.
2. Submit judgement for the first run's pages using the second run's identity.
   Confirm it is refused naming the second run's pages, and that nothing lands in
   the wrong report.
3. Submit correctly to both. Confirm each report contains only its own findings.

---

## Scenario 6 — Claude Code, driving (SC-001, SC-005)

1. Install the skill at `~/.claude/skills/uxlint-review/` (or the project path).
2. In Claude Code, ask it to review the application in your own words.
3. Confirm it ran `capture`, read evidence, submitted, and that a report exists.
4. Confirm `git status --porcelain` is unchanged except the configured report path.

---

## Scenario 7 — Codex, driving (SC-001, SC-005)

Same as Scenario 6, with the skill at `~/.codex/skills/uxlint-review/`.

Worth watching specifically: Codex reads files and runs shell commands freely under
`-s read-only`, so it may explore the repository before following the skill. That is
allowed here — the developer is driving it in their own session — but the report must
still contain nothing it did not submit through `submit`.

---

## Scenario 8 — Cursor Agent, driving (SC-002)

The scenario the feature exists for, and the one that has never passed.

1. Install the skill at `~/.cursor/skills/uxlint-review/`.
2. In Cursor Agent, ask it to review the application.
3. Confirm a report exists carrying judgement findings.

**What this closes**: with the launcher route, this combination failed in about a
second on "Workspace Trust Required" and every page was recorded as unjudged. Here
Cursor is the caller, so there is no trust prompt, no MCP server to hand a session
to, and nothing for uxlint to confine.

**What to check even so**: that Cursor did not write anywhere except where the
developer's own session would. This route does not confine it and does not claim to
— the developer is driving it in their own workspace, which is the difference from
the launcher route, where uxlint started it and therefore owed the guarantee.

---

## Scenario 9 — The launcher route is untouched (FR-018, SC-003)

1. Run `uxlint --delegate --host-agent claude-code` and then `--host-agent codex` on
   the same configuration. Confirm both still complete.
2. Diff the measured portion of a launcher-route report against an inverted-route
   report for the same configuration: violations, rule identifiers, affected element
   counts and provenance must be identical. Only judgement findings may differ,
   because a different model wrote them.
3. Run `uxlint --delegate --host-agent cursor-agent`. Confirm it stops before a
   browser starts and names the skill route.

---

## Contract-level checks (automated, not manual)

- Every verb's flags and output shape match
  [contracts/cli-surface.md](./contracts/cli-surface.md).
- `submit` refuses everything [contracts/submission.md](./contracts/submission.md)
  says it refuses, with a message naming the field.
- `capture` and `evidence` put nothing on stdout but their payload, and
  `console-output.ts` remains the only module in `source/` that writes there.
- The judgement server still cannot reach `console-output.ts`, including its new
  writer.
- No provider credential is read on either verb.
