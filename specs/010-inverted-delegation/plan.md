# Implementation Plan: Host-Neutral Inverted Delegation

**Branch**: `010-inverted-delegation` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-inverted-delegation/spec.md`

## Summary

Add a second delegated route in which the coding agent calls uxlint instead of
uxlint launching the agent. uxlint gains a `delegate` subcommand group — `capture`,
`evidence`, `submit`, `runs`, `discard` — plus one `SKILL.md` artefact the developer
installs into whichever agent they use. The launcher route from 009 stays for
Claude Code and Codex; the Cursor Agent launcher adapter is removed and its
identifier repurposed into a signpost.

The deterministic half, the run state, the judgement intake, the report builder and
the gate all already exist from 009 and are reused unchanged. What is new is two
entry points into them, a run that survives between invocations, and a second
permitted writer to stdout.

Research established one finding that shapes the whole feature: all three agents
load a local skill from a directory containing `SKILL.md` with the same YAML
frontmatter, differing only in where that directory lives. The agent-specific part
of this feature is therefore a copy destination, not a format.

## Technical Context

**Language/Version**: TypeScript (ES modules), Node.js >=22.22.2; development and CI pinned to Node 24

**Primary Dependencies**: Existing only — `meow` for the CLI surface, `zod/v4` for
submission schemas, `chrome-devtools-mcp` for capture, Winston for file logging.
No new runtime dependency.

**Storage**: Files. One run directory per review under the OS temporary directory,
holding the manifest and an append-only submission log — the layout 009 already
uses, with its lifetime extended past a single process.

**Testing**: Ava against the precompiled `dist/` output, per `ava.config.js`. Unit
tests for the run lifetime and the submission document; command-level tests driving
each verb with an injected browser and no real agent; the existing
`stdout-discipline` suite extended to cover the new writer.

**Target Platform**: Developer workstations (macOS, Linux, Windows) running a
coding agent CLI locally. Not continuous integration — see Assumptions in the spec.

**Project Type**: Single-project CLI

**Performance Goals**: `capture` no slower per page than the launcher route's
measured 8 s. Every other verb is scaffolding around file I/O and should stay in
the low milliseconds, as 009 measured its own judgement scaffolding at 1.6–2.0 ms.

**Constraints**: stdout carries the structured payload for `capture` and `evidence`
and nothing else, and no module may reach it except `console-output.ts`. Nothing
either command writes may land in the developer's repository except the report at
the configured output path. Runs must not accumulate.

**Scale/Scope**: Two new modules and five verbs over existing machinery; one
adapter and its tests removed; one skill artefact with three documented install
paths. Configurations of the size the project already targets (2–8 pages).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Code Quality Gates (NON-NEGOTIABLE)

**Pass.** Every change runs `npm run compile` → `npm run format` → `npm run lint`
in that order. No lint rule is changed by this feature, and no
`eslint-disable-next-line` is introduced. The one rule this feature brushes against
is `xo.config.js`'s ban on `console` and `process.stdout` outside
`console-output.ts`; the design respects it by adding the new writer *inside* that
module rather than by widening the rule.

### II. Test-First Development (NON-NEGOTIABLE)

**Pass, with the strategy stated per surface.** Tests are written and must fail
before implementation:

- **Run lifetime and submission document** (pure models): Ava unit tests.
- **The five verbs**: command-level Ava tests driving each verb with an injected
  browser client and report builder, the way `tests/delegate/runner*.spec.ts`
  already drives the orchestrator without a browser or an agent.
- **stdout discipline**: an extension of `tests/delegate/stdout-discipline.spec.ts`,
  asserting that the judgement server still cannot reach `console-output.ts` and
  that the new writer is not reachable from it either.
- **Two structural assertions**, both by walking the import graph or the working
  tree rather than by exercising behaviour, because the properties they guard are
  ones a passing behavioural test would not notice being lost: that no module
  under `source/delegate/driven/` can reach `source/delegate/host/` (FR-016, host
  neutrality), and that every verb leaves the working tree as it found it
  (FR-015), which extends the comparison `tests/delegate/repo-untouched.spec.ts`
  already makes for the launcher route.
- **No language model is involved on this route at all**, so the constitution's
  `MockLanguageModelV4` guidance does not apply. The absence is itself asserted:
  a test confirms no provider credential is read, as `tests/services/ai-service.spec.ts`
  already does for the launcher route.
- **Live validation** is not a substitute for any of the above, but it is required
  before the feature is done: the quickstart names a scenario per agent, and 009
  is the reason — its adapters passed every test and one of them had never worked.

Coverage threshold 80% via c8, unchanged.

### III. UX Consistency via Persona-First Design

**Pass.** The spec's US1 names the target persona: a developer already working
inside a coding agent who wants a review without leaving it and without a model
credential. The surface is designed for two readers at once — an agent parsing
structured output, and a developer reading `runs` output to find a review they
abandoned.

No Ink component is added, so the Ink ecosystem discovery obligation does not
apply: every verb here is non-interactive by design, because its caller is a
program. This is a deliberate absence rather than an oversight — rendering Ink on
these verbs would put frames on the stream the agent is parsing.

### IV. Performance Accountability

**Pass.** Goals are stated above and are measurable: per-page capture time against
009's 8 s baseline, and per-verb scaffolding cost against its 1.6–2.0 ms baseline.
Both are recorded in `quickstart.md` during implementation rather than asserted
here. The evidence payload size per page is measured too, because it bounds what an
agent can hold.

### V. Simplicity & Minimalism

**Pass, with two justifications recorded in Complexity Tracking below.** The
feature adds no abstraction over the existing machinery: no adapter layer, no
transport interface, no second intake. The two places where it adds surface rather
than reusing it — five verbs instead of two, and a second stdout writer — are
justified there.

## Project Structure

### Documentation (this feature)

```text
specs/010-inverted-delegation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── cli-surface.md   # The five verbs, their output, their exit codes
│   └── submission.md    # The judgement document `submit` accepts
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit-specify output)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
source/
├── cli.tsx                        # CHANGED: the `delegate` verb group
├── delegate/
│   ├── driven/                    # NEW: the inverted route
│   │   ├── capture.ts             #   deterministic half; creates the run
│   │   ├── evidence.ts            #   reads a run's evidence back out
│   │   ├── submit.ts              #   records judgement, writes the report
│   │   └── runs.ts                #   list, discard, prune by age
│   ├── evidence.ts                # REUSED unchanged
│   ├── ingest.ts                  # REUSED unchanged — the one intake
│   ├── mcp-server.ts              # REUSED unchanged (launcher route)
│   ├── runner.ts                  # REUSED; capture path factored out for reuse
│   ├── session.ts                 # CHANGED: lifetime beyond one process
│   └── host/
│       ├── cursor-agent.ts        # REMOVED
│       ├── index.ts               # CHANGED: cursor-agent becomes a signpost
│       └── types.ts               # CHANGED: its readOnlyPosture entry removed
├── infrastructure/
│   └── console-output.ts          # CHANGED: a second named writer
└── models/
    └── delegate.ts                # CHANGED: the submission document schema

skills/
└── uxlint-review/
    └── SKILL.md                   # NEW: the one instruction artefact

tests/
├── delegate/
│   ├── driven/                    # NEW: one spec per verb, plus the two
│   │                              #   structural assertions below
│   │   └── host-neutrality.spec.ts #  no driven module reaches host/ (FR-016)
│   ├── host/                      # CHANGED: Cursor launcher specs removed
│   ├── repo-untouched.spec.ts     # CHANGED: extended to this route (FR-015)
│   ├── session.spec.ts            # CHANGED: run lifetime and page state
│   └── stdout-discipline.spec.ts  # CHANGED: covers the new writer
└── fixtures/fake-hosts/           # CHANGED: fake `agent` parsing removed
```

**Structure Decision**: The inverted route lives in `source/delegate/driven/`
alongside the launcher route rather than replacing it, because both routes share
the run, the evidence builder and the intake, and the shared parts are what must
not fork. `driven` names the distinction the feature is about — who drives — so a
reader can tell at a glance which side of the inversion a module is on. The skill
goes in a top-level `skills/` directory rather than under `.claude/`, because it is
shipped to three agents and belongs to none of them.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Five verbs where the spec describes two capabilities | `capture` and `evidence` must be separable or taking pages one at a time re-opens a browser per page, turning 8 s per page into 8 s per page per read (FR-005, research R2). `runs` and `discard` exist only for FR-014 | Three verbs with `capture --prune` was rejected because FR-014 requires an abandoned run to be *discoverable*, and a flag on another command discovers nothing. A separate `report` verb was rejected in the other direction: it adds a step an agent can forget, whose failure mode is a fully judged run with no report |
| A second function permitted to write to stdout | `capture` and `evidence` must put a machine-readable payload on the one channel every agent has. The existing exception in `console-output.ts` is described as a *terminating message*, and a payload is not that, even though it satisfies the same condition (no MCP transport open) | Widening the existing writer's contract was rejected because that contract is what `tests/delegate/stdout-discipline.spec.ts` enforces against the judgement server, where stdout genuinely carries JSON-RPC. Two narrow named writers in one module keep the `xo` ban and the discipline test intact; one vague writer would not |

## Phase 1 artefacts

- [data-model.md](./data-model.md) — the run, its lifetime, the evidence payload and the submission document
- [contracts/cli-surface.md](./contracts/cli-surface.md) — the five verbs, their output shape, their exit codes, and what changes on the launcher route
- [contracts/submission.md](./contracts/submission.md) — the judgement document, and what it is refused for
- [quickstart.md](./quickstart.md) — how to prove the feature works, including one live scenario per agent

## Constitution re-check after Phase 1 design

**Pass, unchanged.** The Phase 1 design added no dependency, no abstraction and no
Ink surface. Two things were confirmed rather than assumed:

- The design keeps exactly one judgement intake (research R6), so origin assignment
  still has one implementation. This was the property most at risk from adding a
  second route, and `contracts/submission.md` records that `submit` may not parse a
  finding itself.
- The run's extended lifetime introduced the only genuinely new failure mode in the
  feature — a directory that outlives its process — and it is answered by design
  (`runs`, `discard`, prune-on-`capture`) rather than left to a follow-up.
