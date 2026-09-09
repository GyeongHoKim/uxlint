# Implementation Plan: Delegate Mode

**Branch**: `009-delegate-mode` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-delegate-mode/spec.md`

## Summary

Add an opt-in execution mode in which uxlint performs every deterministic step
of a review itself — configuration, preflight, navigation, capture, measurement,
report assembly, gate verdict — and hands only the judgement to a coding agent
CLI the developer already runs. uxlint exposes that judgement work as an MCP
server of its own; the host agent connects to it, pulls each page's evidence
through tools, and submits findings back through the same tool contract the
built-in mode already uses. No model provider credential is involved on
uxlint's side.

The orchestrator captures and measures every page first, then launches one host
agent session for the whole run (spec FR-021), then assembles the report from
what arrived. Three adapters — Claude Code, Codex, Cursor Agent — absorb the
fact that the three CLIs share no common invocation shape.

Every host agent behaviour this plan depends on was verified by running the
installed binary, except Cursor Agent, which is not installed on the development
machine — see [research.md](./research.md) and the open items it carries.

## Technical Context

**Language/Version**: TypeScript (ES modules), Node.js >=22.22.2 (dev/CI on 24 via `.nvmrc`)

**Primary Dependencies**: new — `@modelcontextprotocol/sdk@1.30.0` (server half of MCP; the existing `@ai-sdk/mcp@2.0.30` is client-only, R1). Existing — `@ai-sdk/mcp` for the browser transport, `chrome-devtools-mcp@1.7.0` pinned, `zod@4` for the finding contract, `meow@14` for argument parsing

**Storage**: A per-run session directory outside the repository, holding judgement submissions in transit between the server process and the orchestrator. Removed when the run ends (FR-019). Report output path unchanged.

**Testing**: Ava against precompiled `dist/` (`@ava/typescript`, `compile: false`); adapters tested against recorded command lines and scripted process outcomes rather than live agents; the judgement server tested by driving its transport directly; no `MockLanguageModelV4` needed on this path because no model is constructed

**Target Platform**: CLI on a developer workstation (macOS, Linux, WSL). Continuous integration keeps the existing execution mode (spec Assumptions)

**Project Type**: cli

**Performance Goals**:

- Exactly one host agent process is spawned per delegated run, regardless of page count (spec SC-008). Asserted structurally, not timed
- uxlint issues zero model provider requests in delegate mode, with or without a credential present (spec FR-003)
- Judgement scaffolding — session directory creation, manifest write and server construction — **measured at 1.6–2.0 ms steady state** (23 ms on a cold first call), against a run whose capture and measurement pass took 8 s for one page. The scaffolding is not a meaningful share of a run's wall clock
- Session time bound: **measured**. A single-page delegated run spent 108 s inside the host agent session, so the bound is `max(10 min, 5 min × pages)` — roughly five times the observation for the smallest configuration, and scaling with page count because one session covers the whole run

**Constraints**: The judgement server process's stdout carries JSON-RPC and nothing else (R10) — `console-output.ts` must be unreachable from it. The developer's repository is read-only to the delegated agent and uxlint writes nothing into it (FR-012, FR-013). The finding contract, and uxlint's ownership of each finding's origin, are identical to the built-in mode (FR-008, FR-009)

**Scale/Scope**: One new execution path added beside the existing two. New modules under `source/delegate/`; one new CLI entry point (`uxlint mcp-serve`); one narrow change to model assembly in `source/services/ai-service.ts`; no change to `report-builder.ts`, `measurement.ts`, `analysis-stage.ts`, `gate-result.ts` or the interactive UI

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
| --- | --- | --- |
| I. Code Quality Gates | ✅ Pass | compile → format → lint after every task, then full `npm test` before push |
| II. Test-First Development | ✅ Pass | Red tests first for: the finding contract rejecting malformed submissions, origin assignment on receipt, session isolation between concurrent runs, each adapter's command line, and the partial-report path when a session ends early. No language model is constructed on this path, so the mock-model requirement does not apply; the substitute is scripted host-agent process outcomes |
| III. Persona-First Design | ✅ Pass | Spec names two personas (the subscriber with no API key, the developer under a credential policy) and US1/US2 serve them directly. No new Ink surface is introduced — delegate mode reports like the existing non-UI runner — so the Ink ecosystem library discovery obligation does not engage. That scope decision is recorded below rather than left implicit |
| IV. Performance Accountability | ✅ Pass | Every goal above now carries a measured figure rather than a guess: 22,255 cache-creation tokens per host agent launch (R8), which decided FR-021; 1.6–2.0 ms of scaffolding; 108 s of host agent session for one page, which set the bound |
| V. Simplicity & Minimalism | ⚠️ Justified | One new dependency and one new process role. Both justified in Complexity Tracking below |

**Post-design re-check**: see [Constitution re-check after Phase 1](#constitution-re-check-after-phase-1).

## Project Structure

### Documentation (this feature)

```text
specs/009-delegate-mode/
├── plan.md              # This file
├── research.md          # Phase 0 output — host agent behaviour verified by execution
├── data-model.md        # Phase 1 output — session, evidence, finding, adapter
├── contracts/           # Phase 1 output
│   ├── judgement-tools.md   # The MCP tool contract uxlint serves
│   └── cli-surface.md       # Command-line surface and adapter command lines
├── quickstart.md        # Phase 1 output — validation guide, one scenario per host
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
source/
├── cli.tsx                        # Adds two entry points: the --delegate flag
│                                  # and the `mcp-serve` subcommand. `mcp-serve`
│                                  # MUST NOT render Ink and MUST NOT touch
│                                  # console-output.ts (R10)
├── delegate/
│   ├── runner.ts                  # Orchestrator: capture+measure every page,
│   │                              # launch one session, assemble the report
│   ├── session.ts                 # Session directory lifecycle, identity,
│   │                              # isolation between concurrent runs (FR-017),
│   │                              # removal on every exit path (FR-019)
│   ├── ingest.ts                  # The single point where a judgement finding
│   │                              # enters the report. Assigns origin (FR-009),
│   │                              # validates against the contract (FR-008)
│   ├── evidence.ts                # Builds the per-page evidence the tools serve
│   ├── mcp-server.ts              # The judgement server: tool definitions,
│   │                              # stdio transport, no stdout but JSON-RPC
│   └── host/
│       ├── index.ts               # Availability detection and selection (FR-015, FR-016)
│       ├── types.ts               # The adapter contract
│       ├── process.ts             # Spawning and binary/sign-in probes, shared
│       │                          # by all three adapters
│       ├── claude-code.ts         # -p, --mcp-config, --strict-mcp-config,
│       │                          # --restricted; prompt on stdin (R2 trap)
│       ├── codex.ts               # exec, -c mcp_servers.…, -s read-only
│       └── cursor-agent.ts        # -p, --approve-mcps, no --force ever
├── models/
│   └── delegate.ts                # Finding contract shared by both modes,
│                                  # session and evidence types
└── services/
    └── ai-service.ts              # Model resolution split out of createAIService
                                   # so a run can be assembled without one (R7).
                                   # Existing signature and behaviour unchanged

tests/
├── delegate/
│   ├── helpers.ts                 # Test doubles: a browser, and a scripted host
│   │                              # that drives the real judgement server
│   ├── ingest.spec.ts             # Contract rejection, origin assignment
│   ├── session.spec.ts            # Identity, page state, late submissions
│   ├── session-disposal.spec.ts   # Removal on success, failure and expiry
│   ├── stdout-discipline.spec.ts  # console-output.ts unreachable from the server
│   ├── mcp-server.spec.ts         # Tool contract driven over a transport
│   ├── runner.spec.ts             # Report without a credential; attribution;
│   │                              # preflight failure; host provenance
│   ├── runner-spawns.spec.ts      # Exactly one host agent process per run
│   ├── runner-partial.spec.ts     # Partial report when a session ends early
│   ├── measured-parity.spec.ts    # Measured portion identical to built-in mode
│   ├── concurrent-runs.spec.ts    # Two runs, two reports, no crossover
│   ├── repo-untouched.spec.ts     # Working tree unchanged, untracked included
│   └── host/
│       ├── claude-code.spec.ts    # Launch specification, prompt on stdin
│       ├── codex.spec.ts          # exec subcommand, inline MCP config
│       ├── cursor-agent.spec.ts   # No --force, no config file written
│       ├── read-only.spec.ts      # Invariant over every registered adapter
│       └── selection.spec.ts      # Availability, selection, failure messages
└── services/ai-service.spec.ts    # Extended: assembly without a model, and
                                   # the credential is not read when present
```

**Structure Decision**: Single-project layout unchanged. Delegate mode lands as
a new directory beside the existing runners rather than as a branch inside them,
because it shares its deterministic half with them by calling the same services
— `browser-preflight`, `mcp-client`, `measurement`, `report-builder`,
`gate-result` — and shares nothing with them on the judgement half.

**Deliberate scope decision (Constitution III)**: delegate mode reports through
the file logger and a terminating summary, like the existing non-UI runner. It
introduces no Ink components, so no Ink ecosystem library discovery was
performed. An interactive delegated run with live progress is a plausible
follow-up and is deliberately out of scope: the value of this feature is
reaching a report without a provider credential, and a progress display is not
on that path.

## Complexity Tracking

> Two additions require justification under Constitution V.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New dependency `@modelcontextprotocol/sdk` | uxlint must *serve* MCP; the existing `@ai-sdk/mcp` implements only the client half, and no server implementation exists in the tree even transitively (R1) | A hand-rolled JSON-RPC server was built and proven against Claude Code during research. Rejected because three independent clients will connect, and protocol version negotiation, capability advertisement and error shapes are precisely where the second and third client diverge. Fewer package names is not the same as fewer moving parts |
| A second process role (`uxlint mcp-serve`) | The host agent, not uxlint, spawns the MCP server; uxlint therefore has to be launchable as one. It is a grandchild of the orchestrator (R5) | Hosting the server in-process over HTTP was considered and rejected: Cursor's one-time registration would have to name a fixed port, which two concurrent runs cannot share, and a fixed port is a worse thing to ask a developer to configure than a command |

> One anti-complexity note: the delegated tool contract deliberately does **not**
> introduce an abstraction shared with the built-in mode's `createReportTools`.
> The two differ in exactly one place — the completion tool takes a page URL
> here because one session covers many pages (R6) — and a shared factory
> parameterised over that difference would obscure both for no gain. The shared
> thing is the finding *contract* in `models/delegate.ts`, which both import.

## Constitution re-check after Phase 1

| Principle | Status | What Phase 1 changed |
| --- | --- | --- |
| I. Code Quality Gates | ✅ Pass | Unchanged |
| II. Test-First Development | ✅ Pass | The contracts document makes each tool's rejection behaviour explicit, so the red tests have a written target |
| III. Persona-First Design | ✅ Pass | The quickstart is written as the two personas' first run: no credential present, clean working tree checked afterwards |
| IV. Performance Accountability | ✅ Pass | SC-008 is assertable from the design: the runner spawns the adapter once, outside the page loop |
| V. Simplicity & Minimalism | ⚠️ Justified | Unchanged. Phase 1 removed one candidate abstraction (a shared tool factory) rather than adding any |
