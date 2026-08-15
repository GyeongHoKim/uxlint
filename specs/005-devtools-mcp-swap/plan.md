# Implementation Plan: Single Browser Server — Swap to chrome-devtools-mcp

**Branch**: `005-devtools-mcp-swap` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-devtools-mcp-swap/spec.md`

## Summary

Replace Playwright MCP with `chrome-devtools-mcp@1.7.0` as uxlint's only browser server, declared as a pinned dependency rather than resolved at run time. The analysis pipeline is unchanged; the prompt's two tool names change and the transport is reconfigured.

The work that actually carries risk is not the swap. Phase 0 measured three things that the swap alone would get wrong:

1. **A missing browser is invisible until it is too late.** The server connects and lists 29 tools on a host with no Chrome, then returns the failure as a *tool result*, not an exception — so today's loop would spend up to 20 model round-trips on a page it never loaded (R1). Hence a preflight that runs before the transport opens.
2. **The container problem is not about root.** A non-root container fails identically to a root one, and a root container with relaxed seccomp succeeds with no workaround at all (R8). The obvious implementation — check for uid 0 — would leave ordinary CI containers broken with an opaque message. Detection must be behavioural.
3. **Three outbound-data behaviours are on by default**, one of them a registry fetch from inside the dependency that would violate this feature's own offline criterion unless explicitly disabled (R2, R3).

Approach: a `BrowserPreflight` model that probes Chrome directly (31 ms for presence and version; 38–66 ms to discover an unusable sandbox), and an `McpClient` factory that takes the preflight verdict and launches the server with arguments derived from it.

## Technical Context

**Language/Version**: TypeScript (ES modules, `node16` resolution), Node >=22.22.2, development on Node 24

**Primary Dependencies**: `chrome-devtools-mcp@1.7.0` (new, pinned exact — 14 MB, zero runtime dependencies, Puppeteer and Lighthouse bundled); `@ai-sdk/mcp@2.0.30` (existing); `ai@7.0.60` (existing). **Removed**: `@playwright/mcp` invocation via `npx`

**Storage**: Report JSON at the configured output path; Winston log files. No database

**Testing**: Ava against precompiled `dist/`, `MockLanguageModelV4` for model integration, ink-testing-library for components, c8 for coverage

**Target Platform**: Linux (CI and development). macOS and Windows are used by developers but not covered by Phase 0 evidence — see Open Risks

**Project Type**: Single-project CLI (Ink terminal UI + non-interactive CI path)

**Performance Goals**: Preflight ≤1 s in a passing environment (SC-008; measured worst case ~740 ms). Median per-page wall-clock within 20% of the pre-swap baseline (SC-007). Missing-browser failure within 5 s and zero model tokens (SC-003)

**Constraints**: stdout is reserved for the MCP protocol and stderr must not carry log output — the new server writes a five-line banner to stderr and the transport inherits it by default (R4), so the disposition must be set explicitly. No `@latest`. No run-time registry access

**Scale/Scope**: Typically 1–10 pages per run, sequential. One browser instance per run

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Verdict |
| --- | --- | --- |
| **I. Code Quality Gates** (non-negotiable) | `compile → format → lint` after every change. 004 additionally showed that CI runs full `npm test`, and that build-dependent type-aware lint rules only fire after `build` — so the gate for this feature is the full `npm test` before push, not the three commands alone | ✅ Pass |
| **II. Test-First Development** (non-negotiable) | Preflight is a pure model → Ava unit tests. The MCP client factory is tested by asserting the launch argument vector, not by launching Chrome in unit tests. Agent-loop behaviour stays on `MockLanguageModelV4`. Tests written and failing before implementation. Coverage ≥80% for new code | ✅ Pass |
| **III. UX Consistency via Persona-First Design** | Spec carries three personas. Preflight failure must render through the Ink UI in interactive mode and through the sanctioned stdout module in CI. No new Ink library is needed — existing error rendering covers it, so the GitHub-MCP discovery obligation does not bite | ✅ Pass |
| **IV. Performance Accountability** | SC-007 and SC-008 are numeric. Baseline is captured **before** any code change (first task). Preflight cost already measured (31 ms / 38–66 ms / ~700 ms) | ✅ Pass |
| **V. Simplicity & Minimalism** | Two new units (a preflight model, a launch-argument builder) and one modified transport. No abstraction over "browser providers" — there is exactly one server and the spec's Assumptions record that cross-browser was never supported. Tool-set filtering and audit tooling explicitly deferred to 006/007 | ✅ Pass |

**No violations. Complexity Tracking table omitted.**

One point deserves recording rather than a violation entry: preflight duplicates work the server will do anyway (it launches Chrome, then the server launches Chrome). The simpler design — let the server fail and interpret the error — was rejected on measured grounds: the server discards Chrome's diagnostic and reports `Target closed` for two unrelated causes (R8), so the information needed for FR-007 does not survive the trip.

## Project Structure

### Documentation (this feature)

```text
specs/005-devtools-mcp-swap/
├── plan.md              # This file
├── research.md          # Phase 0 output — execution records R1-R8
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── browser-preflight.md
│   └── mcp-launch.md
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md             # Created by /speckit-tasks, not by this command
```

### Source Code (repository root)

```text
source/
├── models/
│   ├── browser-preflight.ts     # NEW — verdict type, unmet-requirement kinds, message rendering
│   ├── analysis.ts              # MODIFIED — ReportMetadata gains the provenance field
│   ├── config.ts                # MODIFIED — executable path, external-data opt-in, TLS tolerance
│   └── uxlint-machine.ts        # MODIFIED — preflight-failure state and guard
├── services/
│   ├── browser-preflight.ts     # NEW — probes Chrome: presence, version, sandbox capability
│   ├── mcp-client.ts            # REWRITTEN — chrome-devtools-mcp transport, launch args, stderr disposition
│   ├── ai-service.ts            # MODIFIED — prompt tool names; setPageSnapshot description; mid-run browser loss
│   └── report-builder.ts        # MODIFIED — records provenance into metadata
├── infrastructure/
│   ├── config/config-io.ts      # MODIFIED — validateConfig covers the three new settings (D17)
│   └── console-output.ts        # EXISTING — the only module permitted to write to stdout
├── ci-runner.ts                 # MODIFIED — preflight before analysis; stale Playwright comment
├── app.tsx                      # MODIFIED — renders preflight guidance via the machine's error path
└── cli.tsx                      # MODIFIED — preflight ordering before the analysis actor starts

tests/
├── models/browser-preflight.spec.ts        # NEW
├── models/uxlint-machine.spec.ts           # MODIFIED — preflight-failure transition
├── services/browser-preflight.spec.ts      # NEW — probe outcomes via injected runner
├── services/mcp-client.spec.ts             # NEW — launch argument vector assertions
├── services/ai-service.spec.ts             # MODIFIED — tool names; mid-run browser loss
├── services/report-builder.spec.ts         # MODIFIED — provenance, and existing fields unchanged
├── infrastructure/config/config-io.spec.ts # MODIFIED — validation of the three new settings
├── ci-runner.spec.ts                       # MODIFIED — unmet verdict exits with zero model calls
├── models/llm-response.spec.ts             # MODIFIED — fixtures use new tool names
├── components/app.spec.tsx                 # NEW — visual regression for preflight guidance
├── components/*.spec.tsx                   # MODIFIED — fixtures use new tool names
└── integration/browser-preflight.spec.ts   # NEW — real Chrome probe, skipped when absent
```

**Interactive error path** — the interactive failure surface is `source/app.tsx` (which already renders `<Text color="red">Error: …</Text>`) driven by the guarded `error` state in `source/models/uxlint-machine.ts`. Preflight failure joins that path rather than being rendered ad hoc from `cli.tsx`; `cli.tsx` owns only the ordering, so that an interactive failure also spends zero model tokens.

**`tests/integration/` is new to this repo.** It holds exactly one test — the real-browser probe — because that is the only test here that touches a browser. Everything else injects a process runner and stays deterministic.

**Structure Decision**: The existing single-project layout is kept. Preflight is split model/service the way the codebase already splits them — the verdict and its rendering are a pure model (unit-testable with no process spawning), while the probing that touches the filesystem and spawns Chrome is a service behind an injected runner so tests stay deterministic.

## Design Decisions

### D1. Preflight sequence

Two probes, cheapest first, both before the MCP transport opens:

1. **Resolve and version-check** — locate the browser (configured path first, then platform defaults, then `PATH`), run `--version`, parse, compare against the floor. 31 ms measured. Produces `browser-absent` or `browser-too-old`.
2. **Sandbox capability** — launch `--headless --dump-dom about:blank` with no sandbox flag. Failure (38–66 ms) means the fallback is required and carries Chrome's own explanation; success (~700 ms) means leave the sandbox alone.

Probe 2 runs only if probe 1 passes. A run in a healthy environment pays both (~740 ms, within SC-008); a broken environment answers in under 100 ms.

### D2. Where the verdict goes

The verdict is an input to the client factory, not a global. `getMCPClient()` becomes a function of the preflight result, which is what makes the sandbox relaxation both automatic (FR-009) and disclosed — the same value that decides the launch argument is the one the disclosure is rendered from. This also avoids the 004-era pattern where a cached singleton outlives the state it was built from.

### D3. Disclosure routing

Interactive mode renders through Ink; CI mode goes through `console-output.ts`, the single module permitted to touch stdout, and only at points where the MCP transport is not open — the same discipline `ci-runner.ts` already applies to the gate verdict. Preflight runs *before* the transport opens, so this is safe by construction.

### D4. Child stderr

Set `stderr` explicitly on the transport rather than inheriting (R4). Capture into the Winston log: the banner contains genuine warnings, and the log is the only sanctioned sink. Discarding would also satisfy the constraint but throws away information for no gain.

### D5. What is deliberately not done

Client-side tool filtering via `tools({schemas})` and the newly-discovered server-side category flags both belong to 006; using `lighthouse_audit` and the trace tools belongs to 007. Doing either here would make a behavioural difference impossible to attribute, which is the spec's stated reason for the split.

## Constitution Re-Check (post-design)

Re-evaluated after Phase 1 produced `data-model.md` and the two contracts.

| Principle | Post-design assessment | Verdict |
| --- | --- | --- |
| I. Code Quality Gates | Unchanged by the design | ✅ Pass |
| II. Test-First | The design got *more* testable, not less: splitting preflight into a pure model (verdict + message) and a service behind an injected runner means no unit test spawns a browser, and the launch spec is asserted as a data structure rather than by observing a subprocess. One integration test does a real probe and skips when no browser is present | ✅ Pass |
| III. Persona-First | Contracts assign each verdict an obligation per mode, so the CI and interactive paths cannot silently diverge | ✅ Pass |
| IV. Performance | Both numeric goals now have measured evidence behind them rather than estimates (31 ms / 38–66 ms / ~700 ms), and the baseline is a blocking first task | ✅ Pass |
| V. Simplicity | Design adds two units and one field. The one place complexity grew is `PreflightVerdict` being three-valued rather than a boolean plus a flag — justified in `data-model.md`: it makes FR-009's disclosure structurally impossible to omit | ✅ Pass |

**Still no violations; Complexity Tracking remains omitted.**

The design did change the spec. R8 measured that FR-009's root-based framing was wrong, and FR-009, US2 scenario 4 and SC-004 were corrected to condition-based wording, with US2 gaining a seventh scenario for the case where the sandbox works and must be left alone. This is the intended direction of information flow for this feature — the spec's own Assumptions predicted that research would contradict documentation-derived beliefs.

## Open Risks

| Risk | Evidence | Handling |
| --- | --- | --- |
| Baseline never captured, so SC-001/SC-007 become unfalsifiable | 004's T001 lesson | First task in `tasks.md`, before any source change. Blocking |
| macOS/Windows preflight paths unverified | Phase 0 ran on Linux only | Probe design is platform-agnostic (resolve → `--version` → launch), but default install paths differ. Needs a task to enumerate them and a manual check before release |
| Chrome 151 was the probe version; the floor is whatever the pinned server requires | R6 records engines but not a Chrome floor | Task to extract the server's stated Chrome requirement and encode it, rather than inventing a number |
| The ~700 ms healthy-path preflight eats most of SC-008's budget | Measured | Acceptable now. If it becomes a problem, probe 2 can be cached per boot — deliberately not done yet (YAGNI) |
