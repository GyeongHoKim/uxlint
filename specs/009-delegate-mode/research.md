# Phase 0 Research: Delegate Mode

**Feature**: 009-delegate-mode | **Date**: 2026-09-09

Every claim below about a host agent CLI was checked against the installed
binary's own `--help` output or by executing it, not against documentation,
except where marked **unverified**. Versions checked: Claude Code 2.1.266,
Codex CLI 0.153.4. Cursor Agent is not installed on the development machine and
its findings come from vendor documentation.

---

## R1: How uxlint becomes an MCP server

**Decision**: Add `@modelcontextprotocol/sdk` (1.30.0) as a runtime dependency
and build the judgement server on its stdio transport.

**Rationale**: `@ai-sdk/mcp@2.0.30`, already a dependency, is a *client* only —
its exports are `createMCPClient` and the stdio transport for talking to a
server. Nothing in the current dependency tree implements the server half, and
`@modelcontextprotocol/sdk` is not present even transitively.

Three host agents will connect to this server, each with its own client
implementation, protocol version negotiation and capability expectations. A
hand-rolled JSON-RPC server is small enough to write — a throwaway probe of
about sixty lines did successfully serve two tools to Claude Code during this
research — but "works against one client" is not the requirement. Protocol
version negotiation, capability advertisement, notification handling and
error-shape conformance are exactly the surface where a second and third client
diverge, and where a hand-rolled implementation fails in ways that read as
uxlint being broken.

**Alternatives considered**:

- *Hand-rolled JSON-RPC over stdio*. Proven to work with one client, no new
  dependency. Rejected: re-implements a negotiated protocol for three
  independent clients to save one well-maintained dependency, which is the
  wrong side of Constitution V — simplicity is fewer moving parts, not fewer
  package names.
- *HTTP transport instead of stdio*. Would let the orchestrator host the server
  in-process and skip the child-process problem in R5 entirely. Rejected in R5;
  see there.

---

## R2: Non-interactive invocation per host agent

**Decision**: Each adapter owns its own invocation shape. There is no common
command form to abstract over.

| Host agent | Non-interactive entry | Result channel |
| --- | --- | --- |
| Claude Code | `claude -p` (`--print`) | `--output-format json` |
| Codex | `codex exec` | `--json` (JSONL events), `-o <file>` (last message) |
| Cursor Agent | `cursor-agent -p` (`--print`) | `--output-format json` |

**Two traps found by execution, both load-bearing for the adapters:**

1. **Codex has no print flag.** `-p` on `codex` and `codex exec` is
   `--profile`, which layers a configuration profile. Passing `-p` expecting
   print mode selects a profile that does not exist. Non-interactive execution
   is the `exec` subcommand (alias `e`).
2. **`claude --allowedTools` is variadic and swallows a trailing prompt.**
   Declared as `--allowedTools <tools...>`, it consumes every following
   positional argument, so a prompt placed after it is parsed as another tool
   name and Claude Code then exits with `Input must be provided either through
   stdin or as a prompt argument when using --print`. Observed directly during
   this research. **The Claude Code adapter MUST pass the prompt on stdin.**

**Rationale**: These are not stylistic differences that an abstraction can
paper over; they are different programs. The adapter boundary belongs at the
level of "launch this agent and tell me how it went", not at the level of
individual flags.

---

## R3: Injecting the judgement server into each host agent

**Decision**: Claude Code and Codex receive the server at launch, as arguments.
Cursor Agent requires a one-time registration performed by the developer.

| Host agent | Injection | Verified |
| --- | --- | --- |
| Claude Code | `--mcp-config '<inline JSON>'` plus `--strict-mcp-config` | Executed successfully |
| Codex | `-c 'mcp_servers.uxlint={command=…, args=[…], env={…}}'` | Executed successfully |
| Cursor Agent | `.cursor/mcp.json` or `~/.cursor/mcp.json` only | Documentation only, **unverified** |

**Claude Code — executed.** A probe MCP server exposing `addFinding` and
`completePageAnalysis` was injected with `--mcp-config` as an inline JSON
string, isolated with `--strict-mcp-config`, and auto-approved with
`--allowedTools "mcp__uxlint__addFinding,mcp__uxlint__completePageAnalysis"`.
The model called both tools in order, the arguments arrived at the probe
conforming to the declared schema, and `permission_denials` was empty. This is
the single most important result in this research: **the tool-call contract the
built-in mode already relies on transfers to a host agent intact.**

**Codex — executed.** `codex mcp list -c 'mcp_servers.uxlint={command="node",
args=["…"], env={UXLINT_DELEGATE_SESSION="…"}}'` against an isolated
`CODEX_HOME` listed the server as `enabled`, including the environment entry.
The `-c` override parses its value as TOML, so an inline table works and no
configuration file has to be written. Auto-approval of MCP tool calls under
`codex exec` is **unverified** — the machine has no Codex login, so no
end-to-end run was possible.

**Cursor Agent — not verified.** Cursor discovers MCP servers only from
`.cursor/mcp.json` (workspace) or `~/.cursor/mcp.json` (user). There is no
per-invocation injection flag. `--approve-mcps` auto-approves all configured
servers.

**Rationale for the one-time registration**: uxlint runs at the developer's
repository root, so writing `.cursor/mcp.json` there would modify the
developer's working tree — forbidden by FR-013 — and would clobber or have to
merge-and-restore a file the developer may already own. A crash mid-run would
leave their configuration damaged. Writing `~/.cursor/mcp.json` at run time has
the same ownership problem outside the repository. Asking once, in
documentation, costs the developer one step and costs uxlint nothing it can
break. OCR's own delegate mode sets the precedent: it requires installing a
skill or command before first use.

**Alternative considered and rejected**: running Cursor against a scratch
workspace (`--workspace <dir> --trust`) holding a generated `.cursor/mcp.json`.
This works only if the delegated agent does not need the repository. The
project's default usage is a developer running uxlint at their repository root,
where source access is what makes a recommendation name a real file, so the
scratch workspace would trade away the feature's usefulness to avoid a
documentation line.

**Alternative considered and rejected**: a file round-trip for Cursor —
the agent writes findings to JSON, uxlint validates them afterwards. Cursor
writes no files at all without `--force` (alias `--yolo`), which permits every
command not explicitly denied. Obtaining one findings file would mean opening
write access to the whole repository, violating FR-012 and FR-013. **For
Cursor, MCP is strictly safer than a file round-trip.**

---

## R4: Enforcing a read-only posture

**Decision**: Every adapter applies its host's read-only mechanism, and the
developer's own agent settings must not be able to widen it.

| Host agent | Mechanism | Effect |
| --- | --- | --- |
| Claude Code | `--restricted` | Removes command- and code-running tools and WebFetch, confines file tools to the working directories, refuses `bypassPermissions`, and ignores user, project and local settings files |
| Codex | `-s read-only` | Sandbox policy for model-generated shell commands |
| Cursor Agent | omit `--force` / `--yolo` | Changes are proposed, never applied |

**Rationale**: FR-012 requires the posture to survive the developer's own
configuration. Claude Code's `--restricted` states this explicitly — it ignores
user, project and local settings files. Combined with `--strict-mcp-config`
from R3, the launched session sees only what uxlint gave it. Codex's sandbox is
a launch argument and is not overridable from `config.toml` in the widening
direction. Cursor's default is already read-only; the adapter's obligation is
simply never to pass `--force`, which also means the Cursor adapter can never
adopt a file-based intake (R3).

---

## R5: How the judgement server finds its run

**Decision**: The orchestrator creates a session directory and exports its path
as `UXLINT_DELEGATE_SESSION` when launching the host agent. The judgement
server process reads it from its own environment.

**Rationale**: The judgement server is not started by uxlint. The host agent
starts it, as a child of itself, which makes it a grandchild of the
orchestrator:

```text
uxlint (orchestrator)        creates session dir, captures and measures
  └─ claude / codex / cursor-agent
       └─ uxlint mcp-serve   receives addFinding, must reach the right run
```

Environment variables are inherited across both spawns, so a value the
orchestrator sets reaches the server without either intermediate process
needing to know about it. Both verified injection mechanisms carry an
environment explicitly: Claude Code's `--mcp-config` JSON accepts an `env`
object, and Codex's inline table accepts `env={…}` (confirmed present in
`codex mcp list` output). For Cursor's registered entry the variable arrives by
plain inheritance from the launched process.

This also satisfies FR-017: two concurrent runs export two different session
paths, so neither server can reach the other's run.

**Alternative considered**: the orchestrator hosts an HTTP MCP server in-process
and gives the host agent a URL, collapsing three processes into two. Rejected:
Cursor's one-time registration would have to name a fixed port, which two
concurrent runs cannot share, and a fixed listening port is a worse thing to
ask a developer to configure once than a command line.

---

## R6: How page evidence reaches the host agent

**Decision**: Evidence is served through MCP tools the host agent calls, not
embedded in the prompt and not written to files for the agent to read.

**Rationale**: Three options were considered.

- *Embed in the prompt.* One session now covers every page (FR-021), and a
  captured page structure is large. Concatenating every page's snapshot into a
  single prompt spends the session's context before judgement begins and makes
  the scaling limit worse than it needs to be.
- *Write files and let the agent read them.* The session directory sits outside
  the repository, and every read-only posture in R4 confines file access to the
  working directory. Claude Code would need `--add-dir` pointing at the session
  directory, and Cursor's confinement is unverified. This trades a documented
  tool call for a per-host filesystem-permission negotiation.
- *Serve through tools.* The agent asks for the page list, then pulls one
  page's evidence at a time. Context is spent per page as judgement proceeds,
  the mechanism is identical across all three hosts, and it needs no filesystem
  permission at all.

**Consequence for the tool contract**: the built-in mode's
`completePageAnalysis` takes no arguments because only one page is ever open.
A single session covering many pages must identify which page it is finishing,
so the delegated contract's completion tool takes the page URL. FR-022's
per-page attribution requirement is what forces this difference, and it is the
only intentional divergence from the built-in tool set.

---

## R7: Removing the model credential requirement

**Decision**: Add a model-free assembly path beside `createAIService`; do not
change `createAIService` itself.

**Rationale**: The credential requirement is not a policy check, it is a
construction order. `createAIService` resolves a language model unless one is
injected, `getLanguageModel` calls `envIO.loadAiConfig()`, and
`getRequiredApiKey` throws when `UXLINT_AI_API_KEY` is absent
(`source/infrastructure/config/env-io.ts:310`). A delegated run needs the same
MCP browser client and the same report builder that function assembles, and
none of the model.

Splitting the model resolution out of `createAIService` and leaving the
existing signature and behaviour untouched keeps FR-001's promise that the
existing modes behave exactly as they do today. The delegated path assembles
the browser client and builder directly.

FR-003 additionally requires that the credential is not read even when present.
That falls out of never constructing the model, and is assertable: a test can
set `UXLINT_AI_API_KEY` and confirm the delegated run neither reads it nor
constructs a provider.

---

## R8: Cost, and why one session per run

**Decision**: One host agent session per run (FR-021), fixed by the spec after
this measurement.

**Measurement**: A single trivial request to Claude Code in print mode, on the
smallest available model, reported 22,255 cache-creation input tokens and
US$0.045 for a request whose own input was ten tokens. That cost is the host
agent's system prompt and context assembly, and it is paid per process launch,
not per page.

**Rationale**: At one launch per page, a seven-page configuration pays that
fixed cost seven times before any judgement happens — and the premise of
delegate mode is that it should cost the developer less than uxlint buying its
own model access, not more. One session per run pays it once.

**Consequence**: page count becomes the scaling limit of a delegated run, which
is why FR-023 and SC-009 require a partial report rather than a failure when a
session ends early. Mitigations available to the adapters if the fixed cost
proves material in practice: Claude Code's `--bare` and `--tools ""` both
reduce what is assembled into the session.

---

## R9: Determining the outcome of a session

**Decision**: The outcome is read from what arrived at the judgement server,
not from the host agent's exit code or its final text.

**Rationale**: The built-in mode already establishes this rule — a page's
status is decided by observed tool results, never by the model asserting it did
something. The same reasoning applies with more force here, because the host
agent's transcript is a third party's output format that may change between
releases.

The exit code and the structured result are still captured, but only to explain
a failure: a non-zero exit with no findings recorded distinguishes "the agent
could not run" from "the agent ran and judged nothing", which FR-016 and the
edge cases need in order to name the right cause.

---

## R10: stdout discipline in the judgement server

**Decision**: The judgement server process writes JSON-RPC to stdout and
nothing else; all diagnostics go to the file logger.

**Rationale**: This is the project's existing rule, but delegate mode is the
first place where uxlint's own stdout genuinely carries MCP protocol traffic
rather than merely being reserved against a child's transport. A stray write in
the server process corrupts the protocol for the host agent. The existing
`console-output.ts` exception — a terminating message written when no transport
exists — does not apply inside the server at all, and the module must not be
reachable from it.

The orchestrator process keeps the existing arrangement: its stdout is free,
and the gate verdict is emitted after the browser transport is closed.

---

## Open items carried into implementation

| Item | Why it is open | How it gets closed |
| --- | --- | --- |
| Cursor Agent end-to-end behaviour | Not installed on the development machine; all Cursor findings are documentation-derived | Install and run the quickstart's Cursor scenario before the adapter is declared done |
| Codex auto-approval of MCP tool calls under `exec` | No Codex login available during research | Run the quickstart's Codex scenario on a logged-in machine |
| Session time bound default | No baseline exists for a delegated run | Measure during implementation and set with headroom, as 008 did for the page bound |
