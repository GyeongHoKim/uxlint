# Feature Specification: CI Gate — Fail Runs That Breach Severity Thresholds

**Feature Branch**: `004-ci-gate`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Make uxlint fail a CI run when the UX findings cross configured severity thresholds. Today ci-runner always exits 0 once analysis finishes, so a run with 20 critical findings, pages that failed outright, or analyses truncated before they completed all pass the pipeline identically to a clean run — the tool is named a linter but gates nothing. Add a `thresholds` block to .uxlintrc (yml and json) letting teams set maximum counts per severity and decide whether partial or failed pages count as failures, then have the CI path exit non-zero when the report violates them, reporting which threshold was breached. Interactive mode keeps its current behaviour. Depends on the report data-integrity fixes already merged in 4.0.1, which made partial and failed pages visible in the report in the first place."

## Target Persona

**Primary — the pipeline owner.** A developer who maintains their team's CI configuration. They added uxlint to the pipeline expecting it to behave like every other linter in that pipeline: silent when things are fine, loud and blocking when they are not. They do not read the report on every run; they read the exit status. They are on a terminal in a CI log viewer, so output must be legible without colour, without a TTY, and without scrolling.

**Secondary — the developer whose change broke the build.** They see only the CI log. They need to learn, from that log alone, which rule they broke and by how much, without opening the report artifact or re-running locally.

Both personas are served by the same requirement: the reason for failure must be in the exit path's output, not only in the report file.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Block a run that exceeds a severity budget (Priority: P1)

The pipeline owner declares that no critical UX issues are acceptable and at most three high-severity ones. When a run produces more than that, the pipeline stops and the log states which budget was exceeded and by how much.

**Why this priority**: This is the feature. Without it uxlint reports but never gates, and the entire premise of running it in CI is unmet. Every other story here is a refinement of this one.

**Independent Test**: Configure a threshold, run analysis against a target that produces findings above it, and confirm the process exits non-zero and names the breached threshold. Delivers the core value on its own — a team can adopt just this and get a working gate.

**Acceptance Scenarios**:

1. **Given** a configuration allowing at most 0 critical findings, **When** a run produces 2 critical findings, **Then** the process exits non-zero and the output states that the critical budget of 0 was exceeded with a count of 2
2. **Given** a configuration allowing at most 3 high findings, **When** a run produces exactly 3 high findings, **Then** the process exits zero — the threshold is a maximum, not an exclusive bound
3. **Given** a configuration with thresholds for several severities, **When** more than one is breached in the same run, **Then** the output lists every breached threshold, not just the first
4. **Given** a configuration with no `thresholds` block, **When** any run completes, **Then** the process exits zero regardless of findings, preserving today's behaviour for existing users
5. **Given** a run that breaches a threshold, **When** the process exits, **Then** the report file is still written — gating must not cost the user the artifact that explains the failure

---

### User Story 2 - Treat incomplete coverage as a failure (Priority: P1)

The pipeline owner decides whether a run that could not analyse everything should be trusted. A page that failed outright, or one whose analysis was cut short before finishing, means the run's "no findings above threshold" verdict rests on incomplete evidence.

**Why this priority**: Equal to P1 because a gate that ignores incomplete coverage is actively misleading — it reports "pass" for runs where the analysis never happened. A team could ship a regression precisely because the page containing it failed to load. This is the failure mode that makes a silent gate worse than no gate.

**Independent Test**: Run against a configuration containing an unreachable URL with incomplete-coverage gating enabled, and confirm the process exits non-zero and names the affected pages. Testable independently of severity budgets.

**Acceptance Scenarios**:

1. **Given** incomplete-coverage gating is enabled, **When** a run contains at least one failed page, **Then** the process exits non-zero and the output names the failed pages and their recorded reasons
2. **Given** incomplete-coverage gating is enabled, **When** a run contains at least one partial page, **Then** the process exits non-zero and the output names the partial pages
3. **Given** incomplete-coverage gating is disabled, **When** a run contains failed and partial pages but no severity breach, **Then** the process exits zero and the output still reports the counts as a warning
4. **Given** a `thresholds` block is present and every page in a run failed, **When** the run finishes, **Then** the process exits non-zero even with both coverage settings disabled — a report built from nothing cannot be evidence of anything. With no `thresholds` block the gate does not run at all, per US1 scenario 4

---

### User Story 3 - Understand and adopt the gate without trial and error (Priority: P2)

A pipeline owner adding thresholds for the first time writes them into their configuration file and gets immediate, specific feedback if they got the shape wrong, rather than a run that silently ignores their settings.

**Why this priority**: Adoption cost. A gate that silently ignores a typo'd key is indistinguishable from no gate, and the user will not discover it until a regression slips through. Lower than P1 because the gate still functions correctly for users who write valid configuration.

**Independent Test**: Supply a configuration with an unknown or malformed threshold key and confirm the run refuses to start with a message naming the offending key. Testable without running any analysis.

**Acceptance Scenarios**:

1. **Given** a configuration where a threshold value is not a non-negative whole number, **When** the run starts, **Then** it stops immediately with a message naming the key and the received value
2. **Given** a configuration containing an unrecognised key inside the thresholds block, **When** the run starts, **Then** it stops immediately and names the unrecognised key
3. **Given** a valid thresholds block in either supported configuration file format, **When** the run starts, **Then** the thresholds are applied identically regardless of which format was used
4. **Given** a run that passes all thresholds, **When** it completes, **Then** the output states which thresholds were evaluated and the observed counts, so a passing run still shows the gate is active

---

### Edge Cases

- **No findings at all.** A run producing zero findings passes every severity budget. It must not be confused with a run that produced no findings because nothing was analysed — that case is covered by incomplete-coverage gating.
- **Thresholds set for a severity that never occurs.** Declaring a budget for a severity with zero occurrences is valid and passes.
- **A threshold of zero.** Distinguishable from an absent threshold: zero means "none permitted", absent means "not gated".
- **Findings from partial and failed pages.** As of 4.0.1 these are counted in the report totals. The gate must count them too — excluding them would let a page fail after producing critical findings and still pass the gate.
- **Analysis throws before any page completes.** The run already exits non-zero on an analysis error; that behaviour is unchanged and takes precedence over threshold evaluation.
- **Interactive mode.** Thresholds are evaluated and reported for visibility, but the exit status is unchanged. A person watching the terminal is not a pipeline.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The configuration file MUST accept an optional thresholds section in both supported file formats, with identical meaning in each.
- **FR-002**: The thresholds section MUST allow a maximum permitted count to be declared independently for each severity level the report uses.
- **FR-003**: The thresholds section MUST allow the pipeline owner to declare whether partial pages and failed pages cause the run to fail, as two independently settable choices.
- **FR-004**: When no thresholds section is present, the run MUST exit with the same status it does today, so upgrading does not break existing pipelines.
- **FR-005**: In non-interactive runs, the process MUST exit non-zero when any declared threshold is exceeded.
- **FR-006**: A threshold MUST be treated as an inclusive maximum — a count equal to the threshold passes, a count above it fails.
- **FR-007**: When a run fails the gate, the output MUST identify every breached threshold, stating the configured limit and the observed count for each.
- **FR-008**: When a run fails because of incomplete coverage, the output MUST name the affected pages, and for failed pages MUST include the recorded reason.
- **FR-009**: When a run passes the gate, the output MUST still report which thresholds were evaluated and the observed counts, so an active gate is visible in a passing log.
- **FR-010**: The report file MUST be written before the process exits, whether or not the gate failed.
- **FR-011**: Threshold counts MUST be taken from all findings in the report, including those collected from partial and failed pages.
- **FR-012**: When the gate is active, a run in which no page was analysed successfully MUST exit non-zero regardless of the coverage settings — including when both are explicitly disabled. This does **not** override FR-004: a config with no thresholds block is not gated at all, so it exits as it always did. "Regardless of configuration" means the user cannot switch this rule off, not that it applies to users who never opted in.
- **FR-013**: Invalid threshold configuration — a non-numeric value, a negative value, a fractional value, or an unrecognised key — MUST stop the run before analysis begins, naming the offending key and value.
- **FR-014**: In interactive runs, threshold results MUST be surfaced to the user, and the exit status MUST remain unchanged from today's behaviour.
- **FR-015**: The configuration documentation MUST describe the thresholds section, its defaults, and a worked example.

### Key Entities

- **Threshold set**: The pipeline owner's declared limits for a run. Holds a maximum permitted count per severity level, plus the two incomplete-coverage choices. Every part is optional; an absent part means "not gated on this".
- **Gate result**: The outcome of evaluating a report against a threshold set. Records whether the run passed, and for each evaluated threshold the configured limit and the observed count. This is what the output is rendered from and what determines the exit status.
- **Breach**: A single evaluated threshold whose observed count exceeded its limit, or a single incomplete-coverage condition that was configured to fail. Carries enough detail to explain itself in one line of log output.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A pipeline owner can make a run block on critical findings by adding no more than three lines to their configuration file.
- **SC-002**: 100% of runs whose findings exceed a declared threshold stop the pipeline; 100% of runs within their thresholds do not.
- **SC-003**: A developer reading only the CI log of a failed run can state which threshold was breached and by how much, without opening the report file.
- **SC-004**: Existing configurations without a thresholds section produce byte-identical exit behaviour to the current release, verified across a run with findings, a run with none, and a run with a failed page.
- **SC-005**: A malformed thresholds section is rejected before any page is analysed, so a misconfigured pipeline costs no analysis time and no model usage.
- **SC-006**: Evaluating the gate adds no more than 50ms to a run, measured on a report containing 500 findings across 50 pages — the gate must be negligible next to analysis time (Constitution IV).
- **SC-007**: A run that analysed nothing successfully never reports a passing gate.

## Assumptions

- **Severity levels are the four the report already uses.** The gate introduces no new severity vocabulary; it gates on what the report already produces.
- **Non-interactive means CI.** The existing interactive flag already separates the two paths, and the gate attaches to the non-interactive one. No new flag is introduced to opt into gating.
- **Interactive mode is deliberately not a user story.** FR-014 has no corresponding user story, and that is intentional rather than an oversight: this feature's user is a pipeline, and a person watching a terminal already sees the findings as they arrive. Showing them the gate verdict is a courtesy so the two modes do not disagree about what the thresholds mean — not a journey anyone adopts the feature for. It is therefore delivered as cross-cutting polish, not as an independently shippable slice.
- **Configuration file is the only source of thresholds.** Command-line overrides and environment-variable overrides are out of scope for this feature; they can be added later without changing the shape of the configuration.
- **A single non-zero exit status suffices.** Distinct exit codes per breach type are not required — the log carries the detail. This keeps the contract simple enough that pipelines only need to check success versus failure.
- **Depends on the 4.0.1 report data-integrity fixes.** Partial and failed pages became distinguishable in the report only in that release. Gating on incomplete coverage is not implementable against earlier behaviour, where a truncated analysis was recorded as complete and failed pages left no trace.
- **Baseline comparison is a separate feature.** This gate evaluates a single run against absolute limits. Failing only on findings that are new since a previous run is the baseline/regression feature and is deliberately not in scope here.
