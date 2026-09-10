# Contract: CLI Surface

**Feature**: 010-inverted-delegation | **Date**: 2026-09-10

The commands an agent runs, and what changes on the launcher route. Flag names and
output shapes here are the contract; the skill in `skills/uxlint-review/SKILL.md`
must agree with this file exactly, because a skill that names a flag uxlint does not
have fails at the agent's first attempt.

---

## `uxlint delegate capture`

Does every deterministic step of a review and creates the run.

```text
uxlint delegate capture
```

**Preconditions**: a `.uxlintrc.yml` or `.uxlintrc.json` in the working directory,
and an environment the browser preflight accepts.

**Behaviour**: runs preflight, then for every configured page navigates, captures
the structure, and measures accessibility and performance. Creates the run, writes
its manifest, and sweeps runs older than 24 hours. Reads no model provider
credential at any point.

**Output** (stdout, structured): the run identity and one entry per page giving its
URL and whether it was captured or failed. Deliberately small — the evidence itself
comes from `evidence`, so an agent can decide how much to read.

**Exit**: `0` when at least one page was captured. Non-zero when preflight fails or
no page could be read, with the existing preflight explanation.

---

## `uxlint delegate evidence`

Reads captured evidence back out of a run. Opens no browser.

```text
uxlint delegate evidence --run <id> [--page <url>]
```

**Behaviour**: with `--page`, prints that page's evidence and marks the page open.
Without it, prints every page's evidence and marks them all open. A page whose
capture failed is printed with its reason rather than withheld.

**Output** (stdout, structured): per page — the URL, the declared features, the
run's persona, the captured structure, the measurement description, and the capture
failure reason when there is one.

**Exit**: `0` on success. Non-zero when the run does not exist, or when `--page`
names a page outside the run; the refusal names the run's pages.

---

## `uxlint delegate submit`

Records judgement and writes the report.

```text
uxlint delegate submit --run <id> [--file <path>]
```

**Behaviour**: reads the judgement document from `--file`, or from stdin when the
path is `-` or absent. Splits it into per-page submissions and hands each to the
existing intake. Then assembles the report at the configured output path and
reports the gate verdict.

Callable more than once for a run. Each call records what it accepted and rewrites
the report from everything that has arrived so far, so a review abandoned after any
call has already produced its honest partial report.

**Output**: the gate verdict and a summary of what was accepted and refused, in the
form the existing modes use. The report goes to the configured output path, not to
stdout.

**Exit**: the gate's exit semantics, unchanged from the existing modes. A document
that parses but carries refused findings still exits on the gate verdict, not on the
refusals — the refusals are reported so the agent can correct them on another call.
Non-zero when the run does not exist or the document does not parse.

---

## `uxlint delegate runs`

Lists runs that exist, so an abandoned one is discoverable (FR-014).

```text
uxlint delegate runs
```

**Output**: one line per run — identity, when it was captured, the configuration it
came from, how many pages it has, and how many have been judged.

**Exit**: `0`, including when there are no runs.

---

## `uxlint delegate discard`

Deletes one run.

```text
uxlint delegate discard --run <id>
```

**Exit**: `0` when the run was removed or was already gone — idempotent, because a
cleanup command that fails on a second call is one a developer stops trusting.

---

## Output discipline

`capture` and `evidence` write their payload to stdout and nothing else to it. No
progress output, no Ink frames, no log lines: the caller is a program parsing the
stream.

Both print only after the browser transport is closed, so at the moment of writing
nothing else owns stdout. The writer lives in `console-output.ts` as a second named
function alongside the terminating-message one, keeping that module the only place
in `source/` that touches stdout and leaving the `xo` ban and
`tests/delegate/stdout-discipline.spec.ts` intact.

Everything that reads as logging continues to go to the Winston file logger, on
every verb.

---

## Changes to the launcher route

The launcher route from 009 is otherwise untouched.

### `--host-agent cursor-agent` becomes a signpost

```text
$ uxlint --delegate --host-agent cursor-agent
uxlint: cursor-agent cannot be launched as a read-only reviewer. Install the
uxlint review skill and ask Cursor Agent to review the app instead: <doc pointer>
```

Stops before a browser is opened (FR-019). The identifier stays accepted so a
developer following the current README gets an explanation rather than "not a
supported host agent".

### What is removed

- `source/delegate/host/cursor-agent.ts`, and `cursor-agent` from the launcher
  registry.
- The `cursor-agent` entry in `readOnlyPosture`. It asserted a guarantee the live
  run disproved, and leaving it would keep asserting it.
- The fake `agent` binary's argument parsing and the Cursor launcher specs. They
  encode documentation that has since been falsified.

### What is unchanged

- Claude Code and Codex, including Codex's `default_tools_approval_mode="approve"`.
- `uxlint mcp-serve` and the MCP judgement server, which remain how the launcher
  route serves evidence and takes judgement.
- The report, the gate and the intake, which both routes share.
