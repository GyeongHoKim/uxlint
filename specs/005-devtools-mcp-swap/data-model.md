# Data Model: Single Browser Server — Swap to chrome-devtools-mcp

**Feature**: 005-devtools-mcp-swap | **Date**: 2026-08-15

Three entities from the spec's Key Entities, plus the one report change. Field names are indicative; the binding constraints are the validation rules and the state transitions.

---

## 1. BrowserRequirement

What the environment must provide. Owned by the product, not by user configuration (spec, Key Entities).

| Field | Type | Notes |
| --- | --- | --- |
| `executablePath` | string \| undefined | User override for a browser outside the default location (FR-008). Undefined means "resolve normally" |

**There is deliberately no minimum version field.** The pinned server states its requirement as "current stable or newer" — a moving target with no number in it — so any floor would be this project's invention and would reject browsers that work. Usability is established by launching, which is the same principle FR-009 applies to the sandbox.

**Validation rules**

- When `executablePath` is supplied it must exist and be executable; a supplied-but-missing path is a distinct failure from "no browser found", because the remedy is different (fix the setting, versus install a browser).

---

## 2. PreflightVerdict

The outcome of checking the environment before analysis begins. Determines whether a run starts at all (FR-004, FR-005).

```text
PreflightVerdict =
  | { kind: 'ready'; browser: BrowserIdentity; sandbox: 'enabled' }
  | { kind: 'ready-without-sandbox'; browser: BrowserIdentity; sandbox: 'disabled'; cause: string }
  | { kind: 'unmet'; requirement: UnmetRequirement }
```

`BrowserIdentity`: `{ executablePath: string; version: string; majorVersion: number }`

`UnmetRequirement` is one of:

| Kind | Trigger | Message must carry |
| --- | --- | --- |
| `browser-absent` | No browser resolved at the configured path or the platform defaults | The paths searched, and how to install (FR-005, FR-007) |
| `browser-unstartable` | Resolves and reports a version, but will not launch for a reason the sandbox fallback does not fix — including being too old to drive | Chrome's own explanation, verbatim (R8 showed it is precise and ours would not be) |

**Why `ready-without-sandbox` is a success state and not a warning flag**: FR-009 requires both that the run proceeds and that the relaxation is disclosed. Modelling it as a distinct verdict makes the disclosure impossible to forget — a caller cannot render the verdict without encountering `cause`. A boolean on a `ready` verdict would let the disclosure be dropped silently, which is the failure mode the clarification specifically ruled out.

**State transitions**

```text
                    ┌─ browser resolves ─┬─ version read ─ launch probe ─┬─ launches ──────────→ ready
start ─ resolve ────┤                    │                              ├─ sandbox error ─────→ ready-without-sandbox
                    └─ not found ────────┴─→ unmet(browser-absent)       └─ other failure ─────→ unmet(browser-unstartable)
```

The version is read for the report's provenance, not to gate on.

The launch probe distinguishes the middle branch from the bottom by matching Chrome's stderr against the two sandbox-failure signatures measured in R8 (`Running as root without --no-sandbox`, and the namespace `Operation not permitted` form). **Anything unrecognised is `browser-unstartable`, not a sandbox problem** — guessing "probably sandbox" would silently disable a security protection for an unrelated fault.

---

## 3. McpLaunchSpec

The argument vector and environment the server is started with. Derived from the verdict; never assembled ad hoc at the call site.

| Field | Type | Source |
| --- | --- | --- |
| `serverEntryPoint` | string | Resolved from the pinned dependency, not `npx` (FR-010) |
| `args` | string[] | See the contract in `contracts/mcp-launch.md` |
| `env` | Record<string, string> | Must include `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` (R2) |
| `stderr` | IOType \| Stream | Explicit, never left to the transport default (R4) |

**Validation rules**

- `args` must contain `--headless` (the server's default is `false`; omitting it launches a visible window and fails in CI — R7).
- `args` must contain `--no-performance-crux` and `--no-usage-statistics` unless the user has explicitly opted in (FR-012, FR-013).
- `args` must not contain `--slim` (removes the tools 007 needs) and must not contain a floating version reference of any kind.
- `--chromeArg=--no-sandbox` appears **if and only if** the verdict is `ready-without-sandbox`.
- `--acceptInsecureCerts` appears when TLS tolerance is on, which is the default (FR-015).

---

## 4. Report change: run provenance

The single field this feature adds (FR-011, and the clarification that fixed FR-003).

Added to `ReportMetadata` in `source/models/analysis.ts`, alongside `timestamp` and `persona`:

| Field | Type | Notes |
| --- | --- | --- |
| `tooling.browserServer` | string | Package identity of the browser server |
| `tooling.browserServerVersion` | string | Exact pinned version |
| `tooling.browserVersion` | string | The Chrome build that actually ran, from the preflight verdict |
| `tooling.externalDataAllowed` | boolean | Whether any external lookup was enabled for the run (FR-014, carried inside provenance rather than beside it) |

**Constraints**

- Every existing `ReportMetadata` field keeps its name, type and meaning (FR-003).
- Provenance is populated for every report, including runs where every page failed — a report that explains nothing else must still explain what produced it.
- `externalDataAllowed` records the *setting*, not an observation of traffic. It answers "was this run permitted to consult external data", which is the question a reader of an old report needs.
