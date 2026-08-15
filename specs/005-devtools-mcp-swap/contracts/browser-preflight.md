# Contract: Browser Preflight

**Feature**: 005-devtools-mcp-swap

Preflight runs before the MCP transport opens and before any model request. Its verdict decides whether the run starts and how the server is launched.

## Why it exists (measured, not assumed)

Research R1: on a host with no Chrome, the server **connects successfully and lists 29 tools in 547 ms**, then returns

```json
{"content":[{"type":"text","text":"Could not find Google Chrome executable for channel 'stable' at:\n - /opt/google/chrome/chrome."}],"isError":true}
```

as a *tool result*. The agent loop feeds that back to the model, which keeps trying — up to 20 iterations — and the page is finally recorded as `partial`. No part of that outcome tells the user to install a browser, and it costs a full page's worth of model spend.

## Inputs

| Input | Source |
| --- | --- |
| Configured executable path | User configuration; optional (FR-008) |
| Minimum major version | Product constant, taken from the pinned server's stated Chrome requirement |
| Platform default search paths | Product constant, per OS |

## Behaviour

### Step 1 — Resolve and version-check (measured: 31 ms)

Search order: configured path → platform defaults → `PATH`. Run `--version` on the winner and parse the major version.

| Outcome | Verdict |
| --- | --- |
| Nothing found | `unmet: browser-absent` — message lists the paths searched and the install remedy |
| Configured path supplied but absent | `unmet: browser-absent`, phrased as a bad setting rather than a missing install |
| Found, major < floor | `unmet: browser-too-old` — message carries detected **and** required versions |
| Found, major ≥ floor | continue to step 2 |

### Step 2 — Sandbox capability (measured: 38–66 ms on failure, ~700 ms on success)

Launch `--headless --disable-gpu --dump-dom about:blank` with **no** sandbox flag.

| Outcome | Verdict |
| --- | --- |
| Exits cleanly | `ready` — sandbox left enabled, no notice emitted |
| Fails, stderr matches a known sandbox signature | `ready-without-sandbox`, `cause` = Chrome's own first stderr line |
| Fails otherwise | `unmet: browser-unstartable`, carrying Chrome's stderr verbatim |

Known sandbox signatures, both observed in R8:

```text
Running as root without --no-sandbox is not supported. See https://crbug.com/638180.
Failed to move to new namespace: PID namespaces supported, Network namespace supported, but failed: errno = Operation not permitted
```

**Unrecognised failures must not be treated as sandbox failures.** Falling back on a guess would disable a browser security protection in response to an unrelated fault.

**Canonical term**: this condition is called the **sandbox relaxation** in user-facing messages and log entries. `ready-without-sandbox` is the verdict name in code; "relaxing a browser security protection" is the spec's wording for the requirement. Use one term in output so a user grepping their logs finds every occurrence.

### What this step must not do

Infer the condition from `process.getuid() === 0`. R8 measured a **non-root** container failing identically and a **root** container with relaxed seccomp succeeding with no workaround. An identity check is wrong in both directions; the spec's FR-009 was corrected to require behavioural detection.

## Outputs

Consumers and their obligations:

| Consumer | Obligation |
| --- | --- |
| CI path (`ci-runner.ts`) | On `unmet`, write the message via `console-output.ts` and exit non-zero **before** any model request (FR-005). On `ready-without-sandbox`, emit the relaxation notice (FR-009) |
| Interactive path (`cli.tsx`) | On `unmet`, render the guidance in the Ink UI — not a stack trace, not a hang (US2 scenario 2) |
| MCP client factory | Consumes the verdict to build the launch spec; `--chromeArg=--no-sandbox` iff `ready-without-sandbox` |
| Report builder | Records `browser.version` from the verdict into run provenance (FR-011) |

## Timing budget

SC-008 allows preflight ≤1 s in a passing environment. Measured worst case (both probes, launch succeeds) is ~740 ms. Failing environments answer in under 100 ms, so SC-003's 5-second bound has wide margin.

## Testability

- **Model** (`source/models/browser-preflight.ts`): verdict construction and message rendering are pure — unit-tested with no spawning, including both sandbox signatures and an unrecognised-failure case.
- **Service** (`source/services/browser-preflight.ts`): the process runner is injected, so probe outcomes are simulated deterministically. No test spawns Chrome.
- **Integration**: one test performs a real probe, skipped when no browser is present, so the suite stays green on machines like the Phase 0 probe host.
