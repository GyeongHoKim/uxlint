# Contract: MCP Server Launch

**Feature**: 005-devtools-mcp-swap | **Server**: `chrome-devtools-mcp@1.7.0`

Everything below was verified against the pinned version's `--help` and by running the server (research R3, R5, R7). This is the contract the client factory must satisfy and the one `tests/services/mcp-client.spec.ts` asserts against.

## Tool name mapping

The only two tools uxlint names in its prompt today. Both confirmed present by listing tools over a live connection (R1, R5).

| Purpose | Playwright MCP (removed) | chrome-devtools-mcp (adopted) |
| --- | --- | --- |
| Load a page | `browser_navigate` | `navigate_page` |
| Capture accessibility-tree text | `browser_snapshot` | `take_snapshot` |

Call sites to update:

- `source/services/ai-service.ts` — `buildUserPrompt()` workflow steps 1–2, and the `setPageSnapshot` tool description which names `browser_snapshot`
- `tests/models/llm-response.spec.ts`, `tests/components/llm-response-display.spec.tsx`, `tests/components/analysis-progress.spec.tsx` — fixtures assert on the literal tool names

Available but **not** used by this feature (reserved for 007): `lighthouse_audit`, `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight`, `evaluate_script`.

## Launch arguments

| Argument | Value | Required by | Consequence if omitted |
| --- | --- | --- | --- |
| `--headless` | present | R7 | **Server default is `false`.** A visible browser window opens on a developer machine; fails in a headless container |
| `--isolated` | present | Run hygiene | Reuses a persistent profile at `$HOME/.cache/chrome-devtools-mcp/…`, letting state leak between runs |
| `--no-performance-crux` | present | FR-012 | Trace URLs are sent to the Google CrUX API. Default is **on** |
| `--no-usage-statistics` | present | FR-013 | Usage data is sent to Google. Auto-suppressed only when `CI` is set, so interactive runs leak |
| `--acceptInsecureCerts` | present when TLS tolerance is on (the default) | FR-015 | Behaviour diverges from today's `--ignore-https-errors` |
| `--chromeArg=--no-sandbox` | present **iff** verdict is `ready-without-sandbox` | FR-009 | Browser fails to start in affected containers, surfacing as `Target closed` |
| `--executablePath <path>` | present when the user configured one | FR-008 | A browser outside default locations is unreachable |
| `--slim` | **never** | R5 | Would expose 3 tools and remove `lighthouse_audit` and the performance tools that 007 needs |

## Environment

| Variable | Value | Required by | Consequence if omitted |
| --- | --- | --- | --- |
| `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` | `1` | FR-010, SC-010 | The server spawns a detached process that fetches `registry.npmjs.org/chrome-devtools-mcp/latest` on startup (at most daily, cached in `~/.cache`). Violates "no run may resolve from a package registry" |

## Transport

| Property | Value | Required by |
| --- | --- | --- |
| `command` | Node executing the resolved dependency entry point | FR-010 — never `npx`, never a version specifier |
| `stderr` | `'ignore'` | R4 — the transport default is `inherit`, and the server writes a five-line banner on every start, landing in the Ink render and in a stream this project reserves. Discarded rather than piped: `@ai-sdk/mcp` never attaches a reader to the child's stderr, so a pipe fills and the child blocks on write. Do not switch this to a pipe without also draining it |

Verified separately: the server writes **nothing** to stdout before the protocol begins, so the MCP boundary itself is safe.

## Client API

`createMCPClient` is the supported name in `@ai-sdk/mcp@2.0.30`; `experimental_createMCPClient` is an alias (roadmap 0.1, absorbed here). The stdio transport has **no** non-experimental name — `Experimental_StdioMCPTransport` is the only export — so it stays as it is. Net change: one import line.

## Non-contract

Tool-set filtering is **not** part of this contract. v1.7.0 offers both client-side (`tools({schemas})`) and server-side (`--no-category-*`) filtering; choosing between them belongs to 006. Note for that feature: `--no-category-performance` would remove exactly the tools 007 needs.
