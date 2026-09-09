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

### Codex (0.153.4, injection verified; end-to-end unverified)

```text
codex exec
  -s read-only
  --json
  -c 'mcp_servers.uxlint={command="uxlint", args=["mcp-serve"],
      env={UXLINT_DELEGATE_SESSION="<session dir>"}}'
  "<prompt>"
```

`-c` parses its value as TOML, so the inline table needs no configuration file.
Verified with `codex mcp list -c …` against an isolated `CODEX_HOME`: the server
listed as `enabled` with its environment entry present.

**Do not pass `-p`.** On Codex, `-p` is `--profile`, not print mode (R2).

**Open**: whether `codex exec` auto-approves MCP tool calls, or needs an
approval flag. Closed by the quickstart's Codex scenario on a logged-in machine.

### Cursor Agent (unverified)

```text
cursor-agent -p
  --output-format json
  --approve-mcps
  "<prompt>"
```

`--force` / `--yolo` MUST NEVER be passed. Without it Cursor proposes changes
rather than applying them, which is the whole of its read-only posture (R4).
MCP servers come from the developer's one-time registration; there is no
injection flag.

---

## Report additions

A delegated run records which host agent produced the judgement, alongside the
provenance the report already carries for the browser server and its version
(FR-020). Nothing else about the report changes.
