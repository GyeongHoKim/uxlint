# Contract: CLI Surface

**Feature**: 009-delegate-mode | **Date**: 2026-09-09

---

## What uxlint exposes

### `uxlint --delegate [--host-agent <id>]`

Runs a review in delegate mode. `<id>` is `claude-code`, `codex` or
`cursor-agent`. When omitted and exactly one supported agent is installed,
uxlint uses it and reports which one it chose. When several are installed,
uxlint stops and names them rather than picking one silently (FR-015).

**Why a flag and not a configuration key**: `.uxlintrc.yml` is committed and
shared, and is read by continuous integration. Delegate mode is a property of
where the run happens, not of the project (spec Assumptions), so putting it in
the configuration file would make one developer's local choice everyone's CI
behaviour.

**Failure before any browser starts** (FR-016): no supported agent installed;
the named agent not installed; the agent installed but not authenticated. Each
names the specific unmet prerequisite.

### `uxlint mcp-serve`

Runs uxlint as the judgement MCP server over stdio. Not intended to be typed by
a developer at a prompt; it is what a host agent spawns. It is documented
because Cursor Agent users register it by hand (R3).

**Preconditions**: `UXLINT_DELEGATE_SESSION` must name an existing session
directory. Absent or missing, the process exits with an error rather than
guessing.

**Constraints**: renders no Ink, writes nothing but JSON-RPC to stdout, and
never reaches `console-output.ts` (R10).

### Cursor Agent one-time registration

Documented in the README. The developer adds one entry to
`~/.cursor/mcp.json`:

```json
{
	"mcpServers": {
		"uxlint": {
			"command": "uxlint",
			"args": ["mcp-serve"]
		}
	}
}
```

uxlint does not write this file. It runs at the developer's repository root and
writing there would modify their working tree (FR-013); writing the home-level
file at run time has the same ownership problem and can damage a configuration
the developer owns if a run crashes mid-write.

---

## What uxlint invokes

Each adapter's command line. Every flag below was read from the installed
binary's own help output; the Claude Code form was additionally executed
end-to-end during research. Cursor's form is documentation-derived and
**unverified**.

### Claude Code (2.1.266, verified by execution)

```text
claude -p
  --output-format json
  --mcp-config '{"mcpServers":{"uxlint":{"command":"uxlint","args":["mcp-serve"],
                 "env":{"UXLINT_DELEGATE_SESSION":"<session dir>"}}}}'
  --strict-mcp-config
  --allowedTools "mcp__uxlint__listPages,mcp__uxlint__getPageEvidence,mcp__uxlint__addFinding,mcp__uxlint__noteOnMeasuredIssues,mcp__uxlint__completePageAnalysis"
  --restricted
< prompt on stdin
```

| Flag | Why |
| --- | --- |
| `--strict-mcp-config` | The session sees only uxlint's server, not the developer's other servers |
| `--allowedTools` | Auto-approves exactly the judgement tools. Verified: `permission_denials` was empty |
| `--restricted` | Read-only posture that ignores user, project and local settings (FR-012) |
| prompt on **stdin** | `--allowedTools` is variadic and swallows a trailing positional prompt (R2). This is not a preference |

### Codex (0.153.4, verified end-to-end)

```text
codex exec
  -s read-only
  --json
  -c 'mcp_servers.uxlint={command="uxlint", args=["mcp-serve"],
      env={UXLINT_DELEGATE_SESSION="<session dir>"},
      default_tools_approval_mode="approve"}'
  "<prompt>"
```

`-c` parses its value as TOML, so the inline table needs no configuration file.

`default_tools_approval_mode` is load-bearing, not decoration. `codex exec` runs
with `approval_policy = never`, under which Codex auto-approves an MCP call only
for a sandbox with full disk write access — the one thing `-s read-only` refuses.
Without it a run registers the server, lists its tools, calls none of them, and
exits 0 having judged nothing. The approval is scoped to `mcp_servers.uxlint`
and changes nothing about the sandbox.

**Do not pass `-p`.** On Codex, `-p` is `--profile`, not print mode (R2).

Verified 2026-09-10 by a two-page delegated run against a live ChatGPT login:
every judgement tool called in order, 12 judgement findings recorded, and
`-s read-only` overriding a developer `config.toml` that set
`sandbox_mode = "danger-full-access"`.

### Cursor Agent (2026.09.02-c22c1a3 — withdrawn, see 010)

**Resolved.** This adapter was removed in
[010-inverted-delegation](../../010-inverted-delegation/spec.md). Cursor Agent is
supported through the route where it calls uxlint rather than the other way
round, so there is no launch to get right and nothing for uxlint to confine.
`--host-agent cursor-agent` now stops before any browser starts and names that
route. What follows is the record of why.

```text
agent -p
  --output-format json
  --approve-mcps
  "<prompt>"
```

`--force` / `--yolo` MUST NEVER be passed. That much stands. The rest of what
this launch assumed does not, as of the live run on 2026-09-10:

- It never starts. `agent -p` demands workspace trust and exits 1 with
  "Pass --trust, --yolo, or -f if you trust this directory".
- Even trusted, the session cannot reach the server. Cursor does not give an
  MCP child its own environment, so `UXLINT_DELEGATE_SESSION` has to be in the
  registration's `env` — a static file naming a directory that is new every run.
- Absence of `--force` is not confinement. `-p` "has access to all tools,
  including write and shell" and, once trusted, the agent wrote a file during a
  judgement run. `--sandbox enabled` did not stop it. `--mode plan` did, and
  also stopped every judgement submission.

MCP servers come from the developer's one-time registration; there is no
injection flag. What the protocol side proved is that once trust and the session
are in place, every judgement tool is called and findings arrive — so this is a
launch and confinement problem, not a contract problem.

---

## Report additions

A delegated run records which host agent produced the judgement, alongside the
provenance the report already carries for the browser server and its version
(FR-020). Nothing else about the report changes.
