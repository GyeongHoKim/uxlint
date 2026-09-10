# Phase 0 Research: Host-Neutral Inverted Delegation

**Feature**: 010-inverted-delegation | **Date**: 2026-09-10

Every claim below about a host agent CLI was checked against the installed binary
on this machine, not against documentation. That is a direct consequence of 009,
where documentation-derived claims about Cursor Agent all turned out to be false
and were only caught by a live run. Versions checked: Claude Code 2.1.267,
codex-cli 0.153.4, Cursor Agent 2026.09.02-c22c1a3.

---

## R1: How each agent is given an instruction file

**Decision**: One artefact — a directory containing `SKILL.md` with YAML
frontmatter carrying `name` and `description` — installed into a different
directory per agent. uxlint ships the directory once; the developer copies or
symlinks it into whichever agent they use.

**Verified locations**:

| Agent | Where a local skill lives | How it was verified |
| --- | --- | --- |
| Claude Code | `.claude/skills/<name>/SKILL.md` (project) or `~/.claude/skills/` | This repository already carries project skills in that layout |
| Codex | `~/.codex/skills/<name>/SKILL.md` | `~/.codex/skills/` exists on this machine alongside `~/.codex/plugins/cache/`; the cached marketplace plugin stores its skills as `.../skills/<name>/SKILL.md` |
| Cursor Agent | `~/.cursor/skills/<name>/SKILL.md` | `~/.cursor/skills/` holds two real skills (`vercel-react-best-practices`, `web-design-guidelines`), each a directory with a `SKILL.md` |

The frontmatter convention is the same in all three. Cursor's
`web-design-guidelines/SKILL.md` opens with `name:` and `description:` keys, which
is the shape Claude Code skills use in this repository.

**Rationale**: This is the finding that makes FR-016 and FR-017 cheap rather than
a three-way porting exercise. The agent-specific part of this feature is a copy
destination, not a format.

**Alternatives considered**:

- **A marketplace plugin per agent.** Both Codex (`codex plugin add`) and Cursor
  (`agent plugin marketplace`) can install plugins from a marketplace. Rejected:
  it makes uxlint depend on publishing to two vendor marketplaces to ship one
  instruction file, and the developer would need network access and an account
  relationship uxlint has no part in.
- **Cursor's `--plugin-dir <path>`.** Real, and it would let uxlint point Cursor at
  a directory it owns. Rejected because it is a *launch* flag, and this feature's
  whole point is that uxlint does not launch the agent.
- **Prose in the README only.** Rejected: the developer would have to relay the
  sequence to the agent by hand on every review, and FR-017 asks for one
  documented step.

---

## R2: The command surface

**Decision**: A `delegate` subcommand group with five verbs.

| Verb | What it does |
| --- | --- |
| `capture` | Preflight, navigate, capture and measure every configured page; create the run; print its identity and page list |
| `evidence` | Print one page's evidence, or every page's, from an existing run |
| `submit` | Record judgement into a run, then write the report and report the gate verdict |
| `runs` | List runs that exist and how far each got |
| `discard` | Delete one run |

**Rationale**: `capture` and `evidence` are separate because FR-005 requires an
agent to be able to take one page at a time. If capture and evidence were one
command, taking pages one at a time would mean re-opening a browser per page —
turning a measured 8 seconds per page into 8 seconds per page per read. Splitting
them makes the browser work happen exactly once.

`submit` writes the report on every call rather than deferring to a separate
`report` verb. An agent may submit per page or once at the end (spec assumption),
so the report has to be derivable from whatever has arrived at any moment. Making
it a side effect of submission means an abandoned run has already produced its
honest partial report without anybody having to remember a final step — which is
US3, and it removes a verb.

`runs` and `discard` exist for FR-014 and nothing else. See R4.

`delegate` as the group name follows the existing `--delegate` flag and matches
OpenCodeReview's `ocr delegate <verb>` shape, which is the precedent this feature
follows.

**Alternatives considered**:

- **Three verbs, folding `runs`/`discard` into `capture --prune`.** Rejected:
  FR-014 says an abandoned run must be *discoverable*, and a flag on another
  command discovers nothing.
- **A separate `report` verb.** Rejected as above — it adds a step an agent can
  forget, and the failure mode of forgetting it is a run that captured and judged
  everything and produced no report.
- **Reusing `--delegate` with flags** (`--delegate --capture-only`). Rejected: it
  overloads one flag into a mode switch, and the agent-facing surface reads worse
  than a verb.

---

## R3: Getting the evidence out and the judgement back

**Decision**: Structured output on stdout for `capture` and `evidence`. Judgement
in by file path (`--file <path>`), falling back to stdin when the path is `-` or
absent.

**On stdout.** This is the third role stdout has in this project, and the first two
are load-bearing: `CLAUDE.md` reserves it for MCP protocol messages, and
`mcp-serve` genuinely carries JSON-RPC on it. `console-output.ts` currently permits
exactly one exception — a terminating message written when no MCP transport
exists.

A structured payload fits that exception's *condition* but not its *description*:
`capture` closes the browser transport before it prints, so at the moment of
writing nothing else owns the stream. The decision is therefore to add a second
named writer to `console-output.ts` rather than to widen the existing one, so that
the module stays the only place in `source/` that touches stdout, the `xo` rule
keeps holding everywhere else, and `tests/delegate/stdout-discipline.spec.ts`
continues to assert that the judgement server cannot reach any of it.

**On judgement in.** A file path is the primary form because the payload is a
document an agent has just composed, and passing a large JSON document as a shell
argument invites quoting damage — a failure that would surface as a validation
error blaming the agent. Codex's own `exec` sets the precedent for the fallback:
its prompt is an argument, or stdin when the argument is `-` or missing.

**Alternatives considered**:

- **Writing evidence to a file and printing the path.** Rejected: the agent then
  needs file-reading ability just to start, and one of the three (Cursor, in
  `--mode plan`) is demonstrably reluctant to act on tool calls it reads as
  execution. stdout is the one channel every agent that can run a command already
  has.
- **Keeping the MCP judgement server as the intake for this route too.** Rejected:
  it is precisely the mechanism Cursor cannot be given a session through (009),
  which is why this feature exists.
- **A single verb that reads judgement from stdin and streams evidence to stdout.**
  Rejected: it would make the agent hold a bidirectional conversation with a
  process, which is what MCP already does better, and it cannot be driven from a
  skill that just runs commands.

---

## R4: The lifetime of a run that outlives its command

**Decision**: The run keeps 009's on-disk layout and location, is *not* disposed by
`capture`, is disposed by `discard`, and is pruned by age on the next `capture`.
`submit` leaves the run in place after writing the report.

**The problem.** 009's `DelegationSession` is created in the OS temporary
directory and removed in a `finally` inside one process, because one process
covers the whole run. This route spans separate invocations, so nothing can hold
that `finally`. Left alone, every review would leave a directory behind and
nobody would ever mention it — the failure FR-014 names.

**Why prune on `capture` rather than on a timer or at exit.** uxlint is a CLI with
no daemon; there is no timer to hang a sweep on, and an exit hook cannot fire for
a run whose whole point is to outlive the exit. `capture` is the one command that
is always run before a review and never during one, which makes it the only safe
moment to delete somebody else's directory.

**Why `submit` does not dispose.** An agent may submit per page. Disposing on the
first submission would destroy the run mid-review, and disposing only on a
"final" submission would require uxlint to know which one that is — which it
cannot, because page status is decided by what arrived and not by the agent's
account of itself (FR-011).

**Retention**: 24 hours. Long enough that a developer can pick a review back up
the next morning; short enough that an abandoned capture does not outlive the
branch it was made on. The captured structure is the only bulky part and it is
already bounded by the context-diet work in 006.

**Alternatives considered**:

- **Disposing in `capture` and re-capturing on demand.** Rejected: it defeats R2's
  reason for splitting the verbs.
- **Storing runs inside the repository** so they are visible in `git status`.
  Rejected outright by FR-015 and by 009's FR-013 — a delegated route must leave
  the working tree as it found it.
- **A lock file per run to prevent concurrent use.** Rejected as unnecessary:
  identities are already UUIDs (009), so two runs cannot collide, and FR-012's
  requirement is isolation, not mutual exclusion.

---

## R5: What happens to the Cursor Agent launcher adapter

**Decision**: Remove `cursor-agent` from the launcher registry and its entry from
`readOnlyPosture`; keep `cursor-agent` as an accepted value of `--host-agent` that
stops the run and names the skill route.

**Rationale**: Keeping an adapter that cannot satisfy the posture would leave
`readOnlyPosture` asserting a guarantee that the live run disproved, which is worse
than having no adapter. Keeping the *identifier* costs nothing and turns a
developer's documented command into an explanation rather than a parse error —
and nothing regresses, because that combination has never completed a run.

The launcher's own tests for Cursor go with the adapter, including the fake
`agent` binary's argument parsing. Those tests encode documentation that has since
been falsified; leaving them green would keep asserting it.

**Alternatives considered**:

- **Keeping the adapter and passing `--trust --workspace <uxlint dir>`.** This was
  tried live and does work functionally, but `--workspace` confines nothing: asked
  to, the agent wrote to an absolute path inside the developer's tree and appended
  a line to the run's own submission log. Rejected because it would mean
  documenting FR-013 as conventional for one host.
- **Removing the identifier entirely.** Rejected: a developer following the current
  README would get "not a supported host agent" and no route forward.

---

## R6: Keeping one intake

**Decision**: `submit` calls the same `validateFinding` and `toUxFinding` the MCP
judgement server calls, and the run's per-page state machine
(`PageJudgementTracker`) governs both routes identically.

**Rationale**: FR-007 asks for one implementation of origin assignment, and the
reason is not tidiness. `toUxFinding` is what stops a submitter declaring its own
output measured, and 009 already had to harden the same boundary twice — once at
the tool, once when reading the log back, after a live Cursor run appended to it.
A second intake would be a third place for that rule to drift.

**Consequence for the design**: nothing in `submit` may parse a finding itself. It
reads a document, splits it into per-page submissions, and hands each one to the
existing intake, which is also what makes the "refused with a message naming the
field" behaviour (FR-010) come out identical on both routes for free.

---

## Open items carried into implementation

| Item | Why it is open | How it gets closed |
| --- | --- | --- |
| Per-page capture time on this route | SC-006 reuses the 8 s per page measured through the launcher route in 009. The work is the same, but it has not been measured through `capture` | Measure during implementation and record it in `quickstart.md`, as 009 did |
| Whether an agent reliably follows a five-verb sequence from a skill | The sequence is longer than OpenCodeReview's two verbs, and no agent has been asked to follow it yet | Run the quickstart's per-agent scenarios live against all three installed CLIs before the feature is declared done |
| Evidence payload size against a real agent's context | 006 bounded the captured structure, but the bound was chosen for a prompt, not for an agent reading `evidence` output | Capture a multi-page configuration and record the payload size per page in `quickstart.md` |
