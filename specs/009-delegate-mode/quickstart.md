# Quickstart: Delegate Mode Validation

**Feature**: 009-delegate-mode | **Date**: 2026-09-09

How to prove the feature works end to end. Each scenario names the success
criteria it closes. Contract details live in
[contracts/judgement-tools.md](./contracts/judgement-tools.md) and
[contracts/cli-surface.md](./contracts/cli-surface.md); entity behaviour lives in
[data-model.md](./data-model.md).

---

## Results, as of the implementation run (2026-09-09)

| Scenario | Status | Evidence |
| --- | --- | --- |
| 1 — review with no credential | **Passed, run for real** | Chrome for Testing 152 and Claude Code 2.1.266, `UXLINT_AI_API_KEY` unset. Exit 0 in 117 s. 13 findings: 3 `origin: audit` carrying rule ids, 10 `origin: judgement`, plus the measurement note |
| 2 — credential present and unused | Covered automatically | `tests/services/ai-service.spec.ts` spies on the credential reader and asserts it is never called |
| 3 — repository untouched | Covered automatically, Claude Code only | `tests/delegate/repo-untouched.spec.ts` compares `git status --porcelain` before and after, untracked included. Not yet run against a live Codex or Cursor session |
| 4 — one session, many pages | Covered automatically | `tests/delegate/runner-spawns.spec.ts`. The live run covered one page, so the multi-page case is asserted rather than observed |
| 5 — session that ends early | Covered automatically | `tests/delegate/runner-partial.spec.ts` and `session-disposal.spec.ts`, including bound expiry |
| 6 — concurrent runs stay separate | Covered automatically | `tests/delegate/concurrent-runs.spec.ts` |
| 7 — missing and unprepared hosts | **Partly observed live** | The live run first stopped with "several coding agents are available (claude-code, codex). Choose one with --host-agent", which is the intended behaviour and revealed that Codex was being counted as ready while unauthenticated. Codex now probes `codex login status`, and the next run selected `claude-code` and said so |
| 8 — Cursor Agent, first run | **Failed, run for real** | Cursor Agent 2026.09.02-c22c1a3, signed in. The launch exits 1 in about a second on "Workspace Trust Required"; with trust granted the session still cannot reach the server, because Cursor gives an MCP child no environment and the registration is static; and once trusted the agent writes files, which `--sandbox enabled` does not prevent and `--mode plan` prevents only by also refusing every judgement submission. See `research.md` |
| 9 — Codex, first run | **Passed, run for real, after a fix** | codex-cli 0.153.4 signed in with ChatGPT. The first run exited 0 in 26 s having judged nothing: `codex exec` runs `approval_policy = never`, which auto-approves an MCP call only for a fully writable sandbox. With per-server `default_tools_approval_mode = "approve"` added, a two-page run took 175 s and recorded 12 measured plus 12 judgement findings, with `-s read-only` overriding a developer `config.toml` set to `danger-full-access` |

Two measurements came out of the live run and replaced provisional figures in
`plan.md`: capture and measurement took 8 s for one page, the host agent session
took 108 s, and the judgement scaffolding itself takes 1.6–2.0 ms.

The live run also surfaced a defect outside this feature:
`classifyLaunchFailure` did not recognise Chrome 152's `No usable sandbox!`, so
a machine with unprivileged user namespaces disabled was reported as having an
unstartable browser instead of taking the sandbox-relaxation path that exists
for exactly that case. Fixed with a test, because it blocked this validation.

---

## Prerequisites

```bash
npm run build
```

A Chrome the browser preflight accepts, and at least one host agent CLI
installed and signed in. A `.uxlintrc.yml` at the repository root listing two or
more pages, so that per-page attribution and the partial-report path are both
exercisable.

**Critical for every scenario below**: `UXLINT_AI_API_KEY` must be unset. The
whole feature is that a review completes without it.

```bash
env -u UXLINT_AI_API_KEY node dist/source/cli.js --delegate
```

---

## Scenario 1 — A review with no model credential (SC-001, SC-002)

The primary path, and the one that defines the feature.

1. Confirm no provider credential is set.
2. Run the command above.
3. Confirm a report was written to the configured output path.
4. Confirm it contains both measured findings (`origin: audit`, carrying rule
   identifiers) and judgement findings (`origin: judgement`, carrying none).

**For SC-002**, run the same configuration through the existing mode on a
machine that does have a credential, and diff the measured portion of the two
reports: violations, rule identifiers, affected element counts and provenance
must be identical. Only the judgement findings may differ, because a different
model wrote them.

**Expected failure before this feature exists**: the run stops at the credential
check before opening a browser.

---

## Scenario 2 — The credential is present and still unused (FR-003)

1. Set `UXLINT_AI_API_KEY` to a syntactically valid but unusable value.
2. Run in delegate mode.
3. Confirm the run completes normally.

A run that fails here is constructing a provider it should never have
constructed. This is cheaper to assert as a unit test — no provider is
instantiated on the delegated assembly path — and the manual scenario exists to
catch the case where something else in the run reaches for the key.

---

## Scenario 3 — The repository is untouched (SC-003)

Run once per installed host agent.

```bash
git status --porcelain          # capture before
env -u UXLINT_AI_API_KEY node dist/source/cli.js --delegate --host-agent <id>
git status --porcelain          # must be identical, including untracked files
```

Untracked files matter as much as modified ones: the failure this catches is a
`.cursor/mcp.json` written on the developer's behalf, which is exactly what
FR-013 forbids and what the Cursor design deliberately avoids by asking for a
one-time registration instead.

---

## Scenario 4 — One session, many pages (SC-008, FR-022)

1. Configure four or more pages.
2. Run in delegate mode with process accounting or a wrapper that counts
   spawns of the host agent binary.
3. Confirm exactly one host agent process was started.
4. Confirm each page's findings are attributed to that page in the report, and
   that no finding appears under a page it was not submitted against.

Step 3 is the measurable form of the decision recorded in research R8: the host
agent's fixed startup cost is paid once per run, not once per page.

---

## Scenario 5 — A session that ends early (SC-005, SC-009, FR-023)

Induce a session that stops partway. The cheapest reliable inducement is a
session time bound set below the time the pages need.

1. Configure a short session bound and four or more pages.
2. Run in delegate mode.
3. Confirm a report was still written and covers **every** configured page.
4. Confirm the pages the agent finished are `complete` and keep their findings.
5. Confirm the pages it never reached are `partial`, carry their measured
   findings, and carry a reason naming the session's end.
6. Confirm a page judged clean is distinguishable from a page never reached
   without reading any log: the first is `complete` with no judgement findings,
   the second is `partial` with a reason.

---

## Scenario 6 — Concurrent runs stay separate (SC-007)

1. Start two delegated runs in the same repository at the same time, with
   different report output paths and page sets.
2. Confirm each report contains only its own run's findings.

This exercises the session identity rule: two runs export two different session
directories, so neither judgement server can reach the other's run.

---

## Scenario 7 — Missing and unprepared host agents (FR-016, SC-006)

| Situation | Expected |
| --- | --- |
| No supported agent on `PATH` | The run stops before a browser starts, and names the supported agents and how to install one |
| The named agent installed, not signed in | The failure names authentication as the cause, not an empty analysis |
| Exactly one agent installed, none named | uxlint uses it and says which one it used |
| Several agents installed, none named | uxlint stops before a browser opens and names the installed agents and the flag that chooses one |

The first row is the one worth checking carefully: an agent-availability failure
that happens *after* the browser opens has already cost the developer a full
capture and measurement pass for nothing.

---

## Scenario 8 — Cursor Agent (superseded by 010)

The launcher this scenario originally exercised was withdrawn after its live run
failed (see the status table above and [research.md](./research.md)). Cursor
Agent is supported through the agent-driven route instead, where it calls uxlint
and uxlint launches nothing:

1. Install the uxlint review skill at `~/.cursor/skills/uxlint-review/`.
2. In Cursor Agent, ask it to review the application.
3. Confirm the report was written and that no judgement finding carries a rule
   identifier.

The full scenario and its live result are
[010 quickstart, Scenario 8](../010-inverted-delegation/quickstart.md#scenario-8--cursor-agent-driving-sc-002).
`--delegate --host-agent cursor-agent` now stops before a browser starts and
names that route.

---

## Scenario 9 — Codex, first run

Closes the second research open item.

1. On a machine with a Codex login, run
   `--delegate --host-agent codex`.
2. Confirm the injected server was reachable and findings arrived.
3. If tool calls required approval, record which flag supplies it and update
   [contracts/cli-surface.md](./contracts/cli-surface.md).

---

## Contract-level checks (automated, not manual)

These belong in the test suite rather than this guide, and are listed so the
guide is not mistaken for the whole of the validation:

- A submission violating any field of the finding contract is rejected, and the
  rejection names the field (FR-008, SC-004).
- A submission carrying `origin` is rejected; a stored finding's origin is
  always assigned by uxlint (FR-009).
- A submission naming a finished page is rejected as late and stored nowhere.
- The session directory is removed on the success path, the failure path and the
  time-bound path (FR-019).
- Each adapter's built command line contains its read-only flag, carries
  `UXLINT_DELEGATE_SESSION`, and — for Claude Code — passes the prompt on stdin
  rather than as a trailing argument (R2).
