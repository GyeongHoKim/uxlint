# Phase 0 Research: Single Browser Server — Swap to chrome-devtools-mcp

**Feature**: 005-devtools-mcp-swap
**Date**: 2026-08-15
**Method**: Execution, not documentation. The spec commits this feature to research by running things (Assumptions, "The environment findings must come from execution, not documentation"), because 004 established that the failures in this class — D15, D16 — only appear when something is actually run. Every finding below records the command that produced it.

Package under test: `chrome-devtools-mcp@1.7.0` (latest at time of writing; `dist-tags.latest = 1.7.0`, published under the `ChromeDevTools/chrome-devtools-mcp` repo by maintainers `mathias`, `orkon`, `google-wombot`).

Probe host: Linux, Node v24.19.0, npm 11.17.0, non-root uid 1000, **no Chrome installed**.

---

## R1. The server starts and serves tools with no browser installed — preflight cannot be skipped

**Decision**: Implement an explicit preflight check (FR-004). Do not rely on client connection or tool discovery to detect a missing browser.

**What was run**: uxlint's own MCP client (`@ai-sdk/mcp` from this repo's `node_modules`) against the server binary, on a host with no Chrome.

**Observed**:

```json
{"elapsedMs": 547, "toolCount": 29, "names": ["click", "close_page", ... "take_snapshot", ...]}
```

The handshake succeeded in 547 ms and returned 29 tools. **Nothing in the connection indicates that the browser this server drives does not exist.**

**Then calling `navigate_page` on that same connection**:

```json
{"content":[{"type":"text","text":"Could not find Google Chrome executable for channel 'stable' at:\n - /opt/google/chrome/chrome."}],"isError":true}
```

returned in 25 ms.

**Why this is the central finding**: the failure arrives as a *tool result* with `isError: true`, not as a thrown exception. In today's agent loop that result is appended to the message history and handed back to the model, which then keeps going — up to `MAX_AGENT_ITERATIONS` (20) — trying to analyse a page that was never loaded. The user pays for 20 model round-trips and gets a page recorded as `partial`. Nothing in that outcome says "install Chrome".

This is the same shape as D15: a missing native dependency reported as something else entirely. It is why FR-005 requires the run to stop *before any model request is made*, and why SC-003 puts a 5-second, zero-token bound on it.

**Alternatives considered**: (a) Detect at connect time — impossible, connect succeeds. (b) Detect from the first tool error and abort — this works but costs one model round-trip and puts the diagnosis inside the agent loop, where it competes with the model's own error handling. (c) Preflight before the transport opens — chosen; cheapest and produces the message at the point the user can act on it.

---

## R2. The server phones the npm registry at startup — SC-010 is not free

**Decision**: Set `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1` in the spawned server's environment. Without it, FR-010 and SC-010 are violated by the dependency itself, not by our code.

**What was run**: read of `build/src/bin/chrome-devtools-mcp-main.js` and `build/src/utils/check-for-updates.js` in the installed package.

**Observed**: the server entry point calls `checkForUpdates(...)` before serving. That function spawns a **detached** child process which does:

```js
await fetch(`${getRegistry()}/chrome-devtools-mcp/latest`)
```

and caches the answer in `~/.cache/chrome-devtools-mcp/latest.json`, re-checking at most once per 24 h. It is suppressed only by the `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` environment variable.

**Why it matters**: SC-010 says a cold first run performs no registry lookup. Pinning our dependency (the clarified decision) removes *our* lookup but not this one. It also spawns a detached process uxlint does not control and cannot wait on. Setting the environment variable is the whole fix, but it has to be a deliberate line of code with a comment, or someone will remove it as noise.

**Alternatives considered**: blocking the request at the network layer (fragile, and we do not control the child's network); accepting one lookup per day (rejected — it makes an offline CI run's behaviour depend on a 24-hour cache file's mtime, which is precisely the kind of state that produces "works on my machine").

---

## R3. Three outbound-data behaviours are on by default

**Decision**: launch with `--no-performance-crux`, `--no-usage-statistics`, and `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`. This is what FR-012 and FR-013 require in practice.

**What was run**: `chrome-devtools-mcp --help` (v1.7.0), and the server's own startup banner.

**Observed** — the server prints this to stderr on every start:

```text
Performance tools may send trace URLs to the Google CrUX API to fetch real-user experience data. To disable, run with --no-performance-crux.

Google collects usage statistics to improve Chrome DevTools MCP. To opt-out, run with --no-usage-statistics.
```

and `--help` confirms the defaults:

| Behaviour | Flag | Default | Auto-suppressed? |
| --- | --- | --- | --- |
| Trace URLs → Google CrUX API | `--performanceCrux` | **true** | No |
| Usage statistics → Google | `--usageStatistics` | **true** | Only when `CI` or `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` is set |
| Version check → npm registry | *(none)* | on | Only via `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` |

This confirms the spec's US3 reasoning exactly: usage statistics are suppressed by a `CI` marker, so **the interactive run on a developer laptop is the one case that leaks**. The CrUX path is worse — it is not suppressed anywhere, and the data it sends is the analysed URL, which for uxlint is routinely a staging host or an internal tool.

**Note for 007**: `--no-performance-crux` disables *field* data only. The local trace and Lighthouse measurements that feature wants are unaffected.

---

## R4. The stdio transport inherits the child's stderr — the banner lands in the Ink UI

**Decision**: pass an explicit `stderr` disposition when constructing the transport. Do not leave it at the default.

**What was run**: `grep -n "stderr" node_modules/@ai-sdk/mcp/dist/mcp-stdio/index.js`

**Observed**:

```js
stdio: ["pipe", "pipe", config.stderr ?? "inherit"],
```

The default is `inherit`. The server writes a five-line banner to stderr on every start (R3, plus a data-exposure warning and a roots-capability notice). Inherited, those lines are written straight to uxlint's own stderr — during an Ink render in interactive mode, and into a stream this project reserves in CI mode.

**Verified separately that stdout is clean**: running the server with `2>/dev/null` and reading stdout produced no output at all before the first protocol message. The MCP boundary itself is safe; the problem is confined to stderr.

`StdioConfig` exposes `stderr?: IOType | Stream | number`, so the disposition is settable. Whether to discard it or capture it into the Winston log is a design decision for Phase 1 — capturing is more useful (the banner contains real warnings) and costs a pipe reader.

**Alternatives considered**: leaving `inherit` and accepting the banner (rejected — it corrupts the terminal UI and violates the project's stream rule); patching the server (out of the question for a pinned dependency).

---

## R5. Tool names and categories — roadmap claims checked against 1.7.0

**Decision**: the prompt's tool references become `navigate_page` and `take_snapshot`. Both exist.

**Observed** (29 tools with default categories, listed via the client in R1):

| Roadmap claim | Status at 1.7.0 |
| --- | --- |
| `navigate_page` exists | ✅ confirmed |
| `take_snapshot` exists | ✅ confirmed |
| `lighthouse_audit` exists | ✅ confirmed (needed by 007) |
| `performance_start_trace` / `performance_stop_trace` exist | ✅ confirmed (needed by 007) |
| `evaluate_script` exists | ✅ confirmed |
| "server exposes ~50 tools" | ❌ **29** with default categories |
| "no category filter exists; only `--slim`" | ❌ **wrong for 1.7.0** — see below |

**Correction for 006**: v1.7.0 has server-side category switches: `--no-category-emulation`, `--no-category-performance`, `--no-category-network`, plus opt-in `--category-extensions` and several `--experimental*` groups. The roadmap's claim that client-side filtering is the only available lever no longer holds, so 006 gains a cheaper option than it was planned around. **This is out of scope for 005** — recorded here so 006 does not re-derive it. Note that `--no-category-performance` would remove exactly the tools 007 needs, so the two features must agree before either flips it.

`--slim` remains unusable for us, as the roadmap said: it exposes 3 tools and drops `lighthouse_audit` and the performance tools.

---

## R6. The package is self-contained — the clarified dependency decision is cheap

**Decision**: declare `chrome-devtools-mcp@1.7.0` as a normal dependency (the clarified answer), pinned exactly.

**What was run**: `npm i chrome-devtools-mcp@1.7.0` into an empty project, then inspection of the installed tree.

**Observed**:

- `added 1 package` — **zero runtime dependencies**. Puppeteer and Lighthouse are rollup-bundled into `build/src` (`third_party/lighthouse-devtools-mcp-bundle.js`, and `browser.js` references puppeteer directly).
- Installed size **14 MB**.
- Two `peerDependencies` (`@toon-format/toon`, `@blackwell-systems/gcf`) are both marked `optional: true` in `peerDependenciesMeta` and are **not** installed. They are not a supply-chain surface for us.
- No `preinstall`/`install`/`postinstall` scripts. The `prepare` script exists but runs only for git installs, never from the registry tarball.
- `engines: ^20.19.0 || ^22.12.0 || >=23` — compatible with this project's `>=22.22.2`.

**Why this was checked at all**: a browser-driving package with zero dependencies is initially indistinguishable from a typosquat. It is worth stating plainly that the shape is explained by bundling, so the next person to look does not have to repeat the investigation.

14 MB is the cost of the clarified decision. It buys offline runs, no run-time registry resolution, and install-time failure reporting.

---

## R7. Flag mapping — today's behaviour to the new server

**Decision**: the launch arguments below preserve current behaviour and satisfy the privacy requirements.

| Concern | Today (Playwright MCP) | New server (verified in `--help`) |
| --- | --- | --- |
| TLS errors tolerated (FR-015) | `--ignore-https-errors` | `--acceptInsecureCerts` |
| Headless | implicit | `--headless` (**default is `false`** — must be passed) |
| Clean profile per run | n/a | `--isolated` (temp user-data-dir, auto-removed) |
| Custom browser location (FR-008) | n/a | `--executablePath` / `-e` |
| Root container (FR-009) | n/a | `--chromeArg=--no-sandbox` |
| Viewport | n/a | `--viewport WxH`; headless max 3840x2160 |

`--headless` defaulting to `false` is a live trap: omitting it launches a visible browser window on a developer machine and fails outright in a headless CI container.

---

## R8. The container problem is NOT about root — the spec's framing was wrong

**Decision**: detect the condition **behaviourally**, by attempting a browser launch, not by checking whether the process runs as root. Identity-based detection would leave half the affected environments broken.

**What was run**: a purpose-built image (`node:24-slim` + `google-chrome-stable` from Google's apt repo, Chrome 151.0.7922.137 at `/opt/google/chrome/chrome`), driven through uxlint's own MCP client, across a matrix of user and seccomp configurations.

**Observed** — navigation through the MCP server:

| Container user | seccomp | `--chromeArg=--no-sandbox` | Result |
| --- | --- | --- | --- |
| root (uid 0) | Docker default | no | ❌ `Protocol error (Target.setDiscoverTargets): Target closed` |
| root (uid 0) | Docker default | **yes** | ✅ navigated in 699 ms |
| **non-root (uid 1000)** | Docker default | no | ❌ **same `Target closed` failure** |
| non-root (uid 1000) | Docker default | **yes** | ✅ navigated in 576 ms |
| non-root (uid 1000) | `unconfined` | no | ✅ navigated in 625 ms — **no flag needed** |

**This refutes the roadmap's framing and the spec's wording.** The roadmap described this as root-only, citing the upstream issue about running as root. The spec inherited that: FR-009 says "privileged container environments" and US2 scenario 4 says "a container that runs as the root user". The measurements say otherwise — an ordinary non-root container fails identically, and the same container with a relaxed seccomp profile succeeds as root *without* any flag.

The actual determinant is whether the environment permits the syscalls Chrome's sandbox needs to create a user namespace. Root is neither necessary nor sufficient.

**Consequence**: a `process.getuid() === 0` check — the obvious implementation of the spec as written — would silently leave every non-root CI container broken, with the opaque `Target closed` message and no guidance. That is the D15 failure shape a second time, introduced by the fix for it.

### The two failure causes have distinct, useful messages — but only outside the MCP layer

Probing Chrome directly rather than through the server:

| Condition | Probe outcome | Time | Chrome's own message |
| --- | --- | --- | --- |
| root, default seccomp | failed | **38 ms** | `Running as root without --no-sandbox is not supported. See https://crbug.com/638180.` |
| non-root, default seccomp | failed | **66 ms** | `Failed to move to new namespace: PID namespaces supported, Network namespace supported, but failed: errno = Operation not permitted` |
| non-root, `--no-sandbox` | launched | 682 ms | — |
| root, `--no-sandbox` | launched | 737 ms | — |

Chrome states the cause precisely in both cases. The MCP server discards that and reports `Target closed`. **So the diagnosis must be made by launching Chrome ourselves, before handing it to the server** — which is the same conclusion R1 reached from the missing-browser case, arrived at independently.

### Preflight cost, measured against SC-008's one-second budget

| Probe | Cost | Answers |
| --- | --- | --- |
| `google-chrome --version` | **31 ms** | present? version floor? (FR-004, FR-007) |
| `google-chrome --headless --dump-dom about:blank`, no sandbox flag | **38–66 ms on failure, ~700 ms on success** | is the sandbox usable here? (FR-009) |

Worst case — a healthy environment where both probes run and the launch succeeds — is roughly **740 ms**, inside SC-008's 1-second budget but with little headroom. The asymmetry is convenient: the environments that need the fallback are the ones that answer fastest.

**Alternatives considered**: (a) check for root — rejected above, provably incomplete. (b) Look for container markers such as `/.dockerenv` or cgroup paths — heuristic, and wrong in both directions (a container with relaxed seccomp needs no flag; a locked-down non-container sandbox would need one). (c) Always pass `--no-sandbox` — rejected: it disables the protection for every user including the laptop case where it works fine, which FR-009's disclosure requirement exists to avoid normalising. (d) Launch-probe and fall back — chosen; it measures the actual property in 38–66 ms exactly when it matters.

---

## Verification status

Honest accounting of what was executed versus what remains to be proven, so that nothing here is mistaken for a documentation summary.

| # | Finding | Status |
| --- | --- | --- |
| R1 | Server serves 29 tools with no Chrome; `navigate_page` returns `isError` not a throw | **Executed** on the probe host |
| R2 | Startup registry fetch, suppressed only by env var | **Executed** (source read of the installed artefact) |
| R3 | CrUX / usage-statistics / update-check defaults | **Executed** (`--help` + observed banner) |
| R4 | Transport inherits child stderr; stdout stays clean | **Executed** (source read + stream separation test) |
| R5 | Tool names, 29-tool count, category flags | **Executed** via live tool listing |
| R6 | Zero deps, 14 MB, optional peers, no install scripts | **Executed** |
| R7 | Flag mapping | **Executed** (`--help` of the pinned version) |
| R8 | Container sandbox behaviour, the `--no-sandbox` remedy, and probe costs | **Executed** in a purpose-built Chrome 151 container across a 5-case matrix |

**Not executed**: the pre-swap baseline (needs model credentials and live targets — first task in `tasks.md`), and a run on macOS or Windows (this project's CI is Linux; the preflight paths for other platforms are a known gap, listed below).

---

## Open items for Phase 1 / tasks

1. **Pre-swap baseline (SC-001, SC-007)** — not captured here. It requires model credentials and live targets, so it belongs in `tasks.md` as the first task, before any code changes, per the spec's Assumptions and the 004 lesson. It must record, per target page: completion status, snapshot length, finding count, and wall-clock time, three runs, on the current release.
2. **Which targets form the baseline set** — deliberately left open at clarification as a planning detail. Needs to be a fixed, publicly reachable set so the comparison is reproducible on another machine.
3. **stderr disposition** — discard versus capture into the Winston log (R4). Recommend capture: the banner carries real warnings and the log is the only sanctioned sink.
