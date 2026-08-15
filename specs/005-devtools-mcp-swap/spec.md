# Feature Specification: Single Browser Server — Swap to chrome-devtools-mcp

**Feature Branch**: `005-devtools-mcp-swap`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "Replace the Playwright MCP browser server with chrome-devtools-mcp as uxlint's single browser automation source, pin the server version instead of resolving `@latest` on every run, add a preflight check that fails with installation guidance when no usable Chrome is present, and stop private URLs from being sent to third-party services. This swap is a prerequisite for the deterministic-audit and context-diet features: the Lighthouse and performance-trace tools those features need live only in the new server, and doing the swap afterwards would mean rewriting the same prompts and tool wiring twice. The swap itself must preserve today's analysis behaviour — it is the plumbing change that unlocks the next three features, not a change to what uxlint reports."

## Target Persona

**Primary — the pipeline owner** (carried over from 004). They run uxlint in a CI container they did not build and cannot easily inspect. Their container is slim: it has Node and not much else. They need uxlint to tell them, in the CI log, exactly what their image is missing and how to add it — not to fail somewhere inside an analysis with a message about a page that would not load. They read the exit status and the log, nothing else.

**Secondary — the developer analysing a private target.** They point uxlint at a staging host, an internal admin tool, or a URL carrying a preview token. They assume a local UX linter keeps those URLs local. If any part of the toolchain transmits the URL to a third-party service, that is a disclosure they were never asked about, and they would find out only by reading someone else's release notes.

**Tertiary — the existing user on a laptop.** They already have uxlint working and did not ask for this change. For them, success is that nothing they can see changes: the same command produces the same kind of report, and no new setup step appears between them and a run.

The three are served by one requirement: the change of engine must be invisible in the report, visible and actionable at the moment the environment cannot support it, and silent toward the outside world.

## Clarifications

### Session 2026-08-15

- Q: When a report records which browser tooling version produced it, is adding that field to the report an acceptable change, given the spec elsewhere requires the report's field set to stay unchanged? (FR-003 / FR-011) → A: Provenance is an additive field in the report's run-level metadata; FR-003 protects existing fields from removal, renaming or change of meaning, and does not forbid additions.
- Q: Should the pinned browser tooling be installed as a declared dependency of uxlint, or fetched from the package registry at the start of each run? (FR-010) → A: A declared dependency. It arrives with installation, runs offline thereafter, and an acquisition failure surfaces at install time rather than mid-run.
- Q: When uxlint detects it is running as root in a container, where the browser refuses to start under its normal security sandbox, should uxlint disable that sandbox automatically or require the user to opt in? (FR-009) → A: Disable it automatically so the run works unattended, and state in the run output that the sandbox was disabled and why. The weakening is permitted; hiding it is not.
- Q: Should uxlint keep ignoring untrusted TLS certificates by default, or start failing on them unless the user opts out? (FR-015) → A: Keep today's default and expose it as a documented setting. Changing the default in the same release as the engine swap would leave any behavioural difference with two possible causes; the flip is a later decision with its own evidence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The analysis keeps working after the engine change (Priority: P1)

An existing user upgrades and runs the command they always run, against the pages they always analyse. They get a report of the same shape, with the same fields populated, covering the same pages. They do not learn from the report that the browser engine underneath changed.

**Why this priority**: This is the feature. The swap exists to unlock later work, so its entire value is delivered by *not* costing anything — a swap that quietly degrades snapshots, drops a page, or leaves a report field empty has negative value, because it trades a working tool for a prerequisite.

**Independent Test**: Record a baseline of report structure and per-page outcome on the current release against a fixed set of target pages, perform the swap, re-run the same configuration, and confirm every structural property of the baseline still holds. Testable on its own and the only story that must pass for the feature to ship at all.

**Acceptance Scenarios**:

1. **Given** a configuration that analyses successfully today, **When** the same configuration is run after the swap, **Then** every page that reached completed status before reaches completed status after
2. **Given** a page analysis after the swap, **When** the report is written, **Then** the page's captured structure snapshot is present and non-empty, as it is today
3. **Given** a run after the swap, **When** the report is written, **Then** every field that existed before is still present and still means the same thing, with the run-level metadata (analysed, partial and failed page lists, finding total, persona) populated by the same rules — the one addition being the provenance field required by FR-011
4. **Given** a run of several pages after the swap, **When** the pages are processed, **Then** each page's findings are attributed to that page's URL, with no bleed between pages
5. **Given** an interactive run after the swap, **When** analysis progresses, **Then** the terminal still reports navigation, capture and analysis activity as it does today

---

### User Story 2 - An environment without a usable browser fails immediately and says why (Priority: P1)

A pipeline owner adds uxlint to a slim container. The image has no Chrome. The run stops before any page is analysed, with a message naming what is missing and what to install. It does not hang, does not report a page failure, and does not spend any model tokens.

**Why this priority**: Equal to P1 because this is the cost the swap imposes, and leaving it unhandled is what turns the swap from neutral into a regression. The previous engine downloaded its own browser; the new one does not. Without this story, the swap converts a working CI job into one that fails deep inside an analysis with a misleading reason. This is the same failure shape as D15 — a missing native dependency killing a run with a message about something else — and that one cost a release to find.

**Independent Test**: Run in an environment with no browser present and confirm the process stops before analysis with a message naming the missing dependency. Requires no model access and no network target, so it is testable in isolation.

**Acceptance Scenarios**:

1. **Given** an environment with no usable browser, **When** a non-interactive run starts, **Then** it exits non-zero before any page is analysed, with a message naming the missing browser and how to install it
2. **Given** an environment with no usable browser, **When** an interactive run starts, **Then** the same guidance is shown in the terminal UI rather than as a stack trace or a silent hang
3. **Given** an environment whose browser is older than the supported floor, **When** a run starts, **Then** it stops with a message stating both the detected version and the minimum required
4. **Given** a container in which the browser's security sandbox cannot start — whether the run is as root or as an ordinary user — **When** a run starts, **Then** analysis proceeds normally rather than the browser terminating on startup, and the output states that the browser's security sandbox was disabled to make that possible
7. **Given** a container whose configuration does permit the browser's sandbox to start, **When** a run starts, **Then** the sandbox is left enabled and no relaxation notice is emitted — the fallback is applied only where it is actually needed
5. **Given** a usable browser installed outside the default location, **When** the user points uxlint at it explicitly, **Then** preflight accepts it and the run proceeds
6. **Given** the browser becomes unavailable partway through a run, **When** the remaining pages are processed, **Then** those pages are recorded as failed with the reason, and the report is still written — a mid-run browser loss is a page failure, not a preflight failure

---

### User Story 3 - Private URLs stay private (Priority: P2)

A developer analyses an internal staging host. No part of the run transmits that URL, or anything derived from it, to a third-party service. If a capability exists that would do so, it is off unless the user turns it on knowingly.

**Why this priority**: Below P1 because the analysis still works without it, but above everything else because it is the one property of this change that a user cannot detect, cannot undo after the fact, and would not forgive. The new engine's performance tooling can consult an external field-data service using the analysed URL, and its usage reporting is only automatically suppressed under a CI environment marker — meaning an interactive run on a laptop is precisely the case that would leak.

**Independent Test**: Run an analysis against a local target while observing outbound network activity, and confirm no request carries the analysed URL to any host other than the target. Testable independently of report contents.

**Acceptance Scenarios**:

1. **Given** a default configuration, **When** any page is analysed, **Then** no request containing the analysed URL is sent to any host other than the analysis target itself
2. **Given** a default configuration in an interactive session on a developer machine, **When** a run completes, **Then** no usage or telemetry report is emitted by the browser tooling
3. **Given** a user who explicitly opts in to external field-data lookups, **When** a run executes, **Then** the lookups occur and the report states that external data was consulted
4. **Given** the documentation, **When** a privacy-sensitive user reads it before adopting uxlint, **Then** they can determine what leaves their machine during a run without reading the source

---

### User Story 4 - The same configuration produces a run that can be explained later (Priority: P2)

A team member looks at a report from three weeks ago and can determine which browser tooling version produced it. Two runs of the same uxlint version use the same browser tooling, so a difference between two reports is a difference in the site, not in the toolchain.

**Why this priority**: Reproducibility is a precondition for every later feature that compares runs — deterministic audits, measured token baselines, regression baselines. Making it a property of this swap costs almost nothing now and cannot be retrofitted onto reports already written. It is P2 rather than P1 because a run that lacks it is still a correct run today.

**Independent Test**: Run twice on the same machine and confirm both runs use the same browser tooling version and both reports record it. Verifiable with no network access at all beyond the analysis target.

**Acceptance Scenarios**:

1. **Given** a fixed uxlint version, **When** two runs execute days apart, **Then** both use the same browser tooling version without any user action
2. **Given** a completed run, **When** the report is read, **Then** it states which browser tooling and which version produced it
3. **Given** an installed uxlint on a machine with no access to a package registry, **When** a run starts, **Then** it proceeds normally — the tooling was acquired at installation and no run-time resolution occurs

---

### Edge Cases

- **A browser is present but cannot start.** Distinct from absence: a browser that exists and then exits on launch (missing shared libraries, a locked profile) must produce a message about startup failure, not "not installed" — the remedies are different. The one startup failure uxlint handles rather than reports is the privileged-container case, per FR-009.
- **A browser is already running with the user's profile.** The run must not depend on, disturb, or inherit state from the user's everyday browsing session.
- **A page requires an oversized viewport.** The headless engine has a maximum renderable viewport; a request beyond it must be reported rather than silently clamped in a way that changes what was analysed.
- **The target uses an untrusted TLS certificate.** Today's behaviour ignores such errors silently. That behaviour is preserved by default here (see Assumptions), but the decision must be an explicit, documented setting rather than a hard-coded flag no user can see.
- **The browser subprocess writes to the shared output stream.** stdout carries the machine protocol for this application. A new subprocess must not break that boundary, and any message intended for the user must go through the single sanctioned output path.
- **Preflight passes, then the environment changes.** A browser removed or upgraded between preflight and analysis is a run-time failure, handled per US2 scenario 6.
- **Zero pages configured.** Preflight still runs, since the failure it reports is about the environment rather than about the targets.
- **The user has no network access to a package registry.** Once installed, this must not affect a run at all (US4 scenario 3). Acquisition problems belong to installation, where the package manager already reports them, and must never be diagnosed as a browser problem at analysis time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Analysis MUST be driven by a single browser tooling source; the previous browser server MUST be removed from the product and its dependency dropped.
- **FR-002**: The captured page-structure snapshot MUST continue to be recorded for every completed page, and MUST remain non-empty for a page that renders.
- **FR-003**: No existing report field may be removed, renamed, or changed in meaning by this feature, and the per-page status rules — including how partial and failed pages are recorded — MUST be unchanged. Adding a field is permitted; FR-011 adds exactly one.
- **FR-004**: Before any page is analysed, the system MUST verify that a usable browser is available and meets the minimum supported version.
- **FR-005**: When preflight fails, the run MUST stop before any model request is made, exit non-zero in non-interactive runs, and state which requirement was unmet and how to satisfy it.
- **FR-006**: Preflight failure guidance MUST be surfaced in both interactive and non-interactive runs, using each mode's normal output path and without violating the reserved-stream boundary.
- **FR-007**: The system MUST distinguish, in its message, a browser that is absent from one that is present but fails to start.
- **FR-008**: Users MUST be able to point the system at a browser installed outside the default location.
- **FR-009**: Runs in environments where the browser's security sandbox cannot start MUST complete analysis successfully without requiring the user to discover and pass browser-level workarounds themselves. Where this is achieved by relaxing a browser security protection, the run output MUST state that the protection was relaxed and why. The condition MUST be determined by observing whether the browser can actually start, not by inferring it from the user the process runs as — Phase 0 research (R8) measured non-root containers failing identically to root ones, so an identity check would leave them broken.
- **FR-010**: The browser tooling MUST be acquired at installation time at a version pinned by the product. No run may resolve the tooling from a package registry, and no run may resolve a floating "latest" version.
- **FR-011**: The report MUST record which browser tooling and version produced it, as an addition to its run-level metadata rather than a change to any existing field.
- **FR-012**: By default, no analysed URL or data derived from it may be transmitted to any third party; any capability that would do so MUST be off unless the user explicitly enables it.
- **FR-013**: Usage or telemetry reporting by the browser tooling MUST be suppressed in all modes by default, not only in continuous-integration environments.
- **FR-014**: When a user has enabled external data lookups, the report MUST state that external data was consulted, recorded inside the same provenance record FR-011 adds rather than as a further field.
- **FR-015**: Tolerance of untrusted TLS certificates MUST become an explicit, documented setting rather than an unconditional behaviour, and MUST default to today's behaviour of tolerating them.
- **FR-016**: A browser failure occurring after analysis has begun MUST be recorded as a failure of the affected page, leaving previously completed pages and the report intact.
- **FR-017**: Documentation MUST state the browser requirement, the minimum version, container guidance, and what the run transmits externally, before a user's first run.
- **FR-018**: The analysis prompt and tool wiring MUST refer only to tools the adopted server actually provides, with no references to the removed server remaining in the product or its tests.

### Key Entities

- **Browser requirement**: What the environment must provide for a run to be possible — a browser of at least a minimum version, startable in the current environment. Owned by the product, not by the user's configuration.
- **Preflight result**: The verdict of checking the environment against the browser requirement before analysis. Either "ready", or a specific unmet requirement carrying the remedy for it. Determines whether a run begins at all.
- **Browser tooling provenance**: What produced a report — the identity and exact version of the browser tooling, and whether any external data source was consulted during the run. Lives in the report's run-level metadata, alongside the timestamp and persona, so a report found later can explain itself. It is the only field this feature adds; FR-014's disclosure is carried inside it rather than beside it.
- **External transmission setting**: The user's explicit choice about whether anything derived from the analysed URL may reach a third party. Defaults to "no".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a fixed set of target pages, three consecutive runs after the swap complete the same pages as three consecutive runs recorded before the swap, with no page moving from completed to partial or failed.
- **SC-002**: 100% of completed pages after the swap carry a non-empty structure snapshot.
- **SC-003**: A run in an environment with no browser stops within 5 seconds of starting, spends zero model tokens, and its message alone is sufficient for a pipeline owner to fix their image without consulting the source or the issue tracker.
- **SC-004**: A run completes analysis with no user-supplied browser workarounds in both a root container and a non-root container whose sandbox cannot start, and its output names the security protection that was relaxed to allow it. In a container where the sandbox does start, no protection is relaxed.
- **SC-005**: Observed outbound traffic during a default run contains zero requests carrying the analysed URL to any host other than the target.
- **SC-006**: Two runs of the same uxlint version on the same machine use identical browser tooling versions, and both reports state that version.
- **SC-007**: Median wall-clock time per analysed page after the swap is within 20% of the pre-swap baseline measured on the same targets and machine (Constitution IV). A larger regression must be measured and explained before the feature ships, not discovered afterwards.
- **SC-008**: Preflight adds no more than 1 second to a run in an environment that passes it.
- **SC-009**: No product code, prompt, test or document references the removed browser server after the change.
- **SC-010**: An installed uxlint completes a run with the package registry unreachable, and a cold first run performs no registry lookup.

## Assumptions

- **The baseline is recorded before the swap, not reconstructed after it.** SC-001 and SC-007 compare against measurements of the current release on the same targets and machine. Capturing that baseline is the first piece of work, not a step to be back-filled — 004 established that the first act of measuring is what finds the environment problems, and this feature's whole risk profile is environmental.
- **"Equivalent" means structurally equivalent, never textually identical.** The findings themselves come from a language model and vary between runs on the same page; requiring identical text would set a bar no implementation can clear. Equivalence here is a property of the pipeline — same pages reached, same statuses, snapshot captured, same report shape — and explicitly not a property of the prose. Textual comparison is out of scope for every acceptance scenario above.
- **Untrusted TLS certificates continue to be tolerated by default** (confirmed in clarification). The current release ignores them unconditionally. Flipping the default in the same change that swaps the engine would make any resulting failure ambiguous between the two causes. This feature turns the behaviour into a visible setting; changing its default is a separate decision with its own evidence.
- **Cross-browser analysis was never a supported capability.** The configuration file offers no browser selection, so narrowing to a single browser engine removes no feature a user could have been relying on.
- **The environment findings must come from execution, not documentation.** Browser procurement, privileged-container startup and external transmission are all properties that a README states and an environment contradicts. Planning research for this feature is expected to be the record of what actually happened in a container, not a summary of what the tooling's documentation claims.
- **Sequential page processing is unchanged.** Running pages concurrently is a later feature with its own measurement precondition. This feature keeps one browser and one page at a time.
- **Tool-set reduction is not in scope.** The adopted server exposes a large tool surface, and narrowing it is the next feature. Doing both at once would make any behavioural difference impossible to attribute to one cause or the other.
- **Deterministic auditing is not in scope.** The audit and performance-trace capabilities are the reason this server was chosen, but using them is a separate feature. This one only makes them reachable.
- **The minimum browser version tracks the tooling's own stated floor.** uxlint does not define an independent support window; it enforces what the adopted tooling requires, and states it in the documentation.
