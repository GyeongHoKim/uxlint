# Feature Specification: Deterministic Audit

**Feature Branch**: `007-deterministic-audit`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "deterministic-audit — Ground uxlint's performance and accessibility findings in measurement instead of LLM guesswork (roadmap Phase 2.2 + 2.3, diagnosis D3)."

## Context

The analysis prompt asks the model to judge Accessibility and Performance. The
only evidence it is given is an accessibility-tree text snapshot. Contrast
ratios, computed roles, focus order, LCP, CLS and transfer sizes are not in
that text and cannot be derived from it. A `severity: 'high'` performance
finding produced from it is a guess, and the current design asks for one on
every page. **The structure demands judgement without measurement, so it
manufactures hallucination.**

This feature supplies the measurement, and — equally important — makes the
report say which of its statements are measured and which are judged.

## Target Personas

Two people read the output, and the feature exists for both (Constitution III):

- **The developer whose build just failed.** Reads a CI log and a report file.
  Needs to know whether the thing that failed the build is a fact or an
  opinion, because that decides whether they argue with it or fix it.
- **The reviewer comparing this week's report to last week's.** Needs at least
  some numbers that move only when the site moves — not when the model's mood
  moves.

## Clarifications

### Session 2026-08-18

- Q: When the same accessibility rule fails on every page, is that one finding or one per page? → A: One finding per page per rule, as today, plus a recurrence summary in the statistics so a site-wide defect reads as one line.
- Q: If a page's audit or trace never returns, what should happen? → A: Each measurement carries its own time bound; on expiry it is abandoned, rendered as not measured, and the model analysis proceeds.
- Q: Should measurement appear as its own visible phase in the interactive terminal UI? → A: Yes — a distinct named phase showing what is being measured on which page.

Requirements and criteria added by these clarifications carry letter suffixes (FR-005a, FR-013b, SC-008a …) so that identifiers already referenced elsewhere keep pointing at the same requirement.

### Amended by Phase 0 research — 2026-08-19

Four requirements were changed by what the tools actually do when run. Each is evidenced in [`research.md`](./research.md).

- First Contentful Paint is **dropped** (FR-004, SC-004). The trace does not report it as an observed metric; the only FCP figure available is a projected saving from a suggested fix, and publishing that as the page's FCP would fabricate the kind of number this feature removes. LCP and CLS are recorded.
- Absence is tracked **per metric** (FR-006a). A trace can succeed and still report no LCP.
- The audit is taken in a **non-reloading mode** (FR-012a), so the captured structure and the audited state are one page load. This also resolves the ordering question deferred out of clarification.
- The FR-005a bound is **60 seconds**, and SC-008 now carries a measured number rather than a promise to measure.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accessibility problems are measured, not guessed (Priority: P1)

A developer runs uxlint against a page whose buttons fail contrast. The report
names that violation, names the rule that caught it, and points at the
elements — because the page was actually audited, not described to a model and
guessed about.

**Why this priority**: This is the feature. Everything else here labels,
displays or budgets what this story produces. Without it the report has no
verified facts to distinguish from opinions.

**Independent Test**: Run an analysis against a fixture page with a known
accessibility defect and confirm the rendered report contains that violation,
identified by its rule, on the page where it lives. The defect is planted, so
the expected finding is known before the run.

**Acceptance Scenarios**:

1. **Given** a page containing an element whose contrast fails, **When** the
   page is analysed, **Then** the rendered report contains a finding naming
   that violation and its rule identifier.
2. **Given** a page with no detectable violations, **When** the page is
   analysed, **Then** the rendered report states that the page was audited and
   nothing was found — which is not the same statement as silence.
3. **Given** the audit cannot be taken for a page, **When** the page is
   analysed, **Then** the model's own findings for that page are still
   recorded and the report says the measurement is missing.

---

### User Story 2 - A reader can tell a fact from an opinion (Priority: P2)

Every finding in the report says where it came from: measured by the audit,
measured from a performance trace, or judged by the model. The developer
reading a failed build can see at a glance which findings they can dispute and
which they cannot.

**Why this priority**: Deterministic findings that look identical to guessed
ones buy nothing — the reader still cannot trust any single line. This story
is what converts P1's accuracy into credibility. It is separable from P1
because the labelling applies to today's model-judged findings too: shipped
alone, it makes the existing report honest about being entirely AI judgement.

**Independent Test**: Render a report containing findings of every provenance
and confirm each one carries its origin visibly, with rule identifiers present
on measured findings and absent on judged ones.

**Acceptance Scenarios**:

1. **Given** a report containing both measured and judged findings, **When**
   the markdown is rendered, **Then** each finding's origin is visible without
   consulting any other file.
2. **Given** a measured finding, **When** it is rendered, **Then** it carries
   the identifier of the rule that produced it.
3. **Given** a judged finding, **When** it is rendered, **Then** it carries no
   rule identifier and is not presented as verified.
4. **Given** a page whose measured violations carry a model-written note,
   **When** the page is rendered, **Then** the note is visibly attributed to
   model judgement and sits outside the findings it discusses.

---

### User Story 3 - The report carries numbers that move only when the site moves (Priority: P3)

The statistics section, which today counts only the model's own severity
judgements, gains measured category scores and the page's Largest Contentful
Paint and Cumulative Layout Shift.

**Why this priority**: It is the smallest slice and depends on the measurement
P1 introduces, but it is what makes a report comparable to an earlier one — the
prerequisite the roadmap records for baseline regression tracking (010).

**Independent Test**: Analyse a page and confirm the rendered statistics carry
per-page scores and the recorded vitals, with an explicit "not measured" where a
measurement was not taken.

**Acceptance Scenarios**:

1. **Given** a page that was audited and traced, **When** the report is
   rendered, **Then** the statistics show that page's category scores and its
   LCP and CLS.
2. **Given** a page whose trace could not be captured, **When** the report is
   rendered, **Then** the vitals for that page read as not measured rather
   than as zero.

---

### Edge Cases

- **The audit fails and the page analysis does not.** A page whose measurement
  errored must keep every model finding already collected and be rendered with
  its measurement marked absent. Silently dropping the page repeats D8, the
  data-loss bug this project already paid for once.
- **The audit succeeds and finds nothing.** "Audited, clean" and "never
  audited" must not render identically. A blank is read as a pass.
- **Navigation failed, so nothing was measured.** The report must not present
  an unvisited page as having passed an audit.
- **A rule fires on dozens of elements.** One rule violated across forty
  buttons is one problem, not forty findings; the report must stay readable.
- **The same rule fires on every page.** The findings stay per page, so a
  site-wide defect is N findings and the gate counts N of them. The report
  must still let the reader see it is one defect — via the recurrence summary
  of FR-013b — and the release notes must say plainly that one site-wide
  defect can exhaust a severity threshold on its own.
- **A run's thresholds were tuned against guessed findings.** Introducing
  measured findings changes the counts a configured gate sees, and a user's
  build can start failing on a run where nothing about their site changed.
- **The trace succeeds but the audit does not** (or the reverse). Partial
  measurement must render as exactly what it is, per measurement.
- **A measurement never returns.** The bound of FR-005a expires, that
  measurement is abandoned, and the page is analysed with whatever was
  measured. A hung page costs one timeout, not the run.

## Requirements *(mandatory)*

### Functional Requirements

**Measurement**

- **FR-001**: For every page that loads, the system MUST take a deterministic
  audit of that page before the model is asked to judge it.
- **FR-002**: Audit violations MUST be recorded as findings without being
  routed through the model. A deterministic result that passes through a model
  can only lose fidelity.
- **FR-003**: Only **accessibility** violations become findings. Performance,
  best practices and SEO results MUST NOT be recorded as findings in this
  feature. Performance appears as measured numbers (FR-004, FR-012) and
  nowhere else. Accessibility violations carry an impact rating that FR-009's
  fixed mapping can read; the other categories do not, so admitting them would
  require inventing a severity for each — reintroducing the guessing this
  feature exists to remove, one layer further down.
- **FR-004**: The system MUST record the page's Largest Contentful Paint and
  Cumulative Layout Shift from an actual page load. First Contentful Paint is
  **not** recorded: Phase 0 established that the trace does not report it as an
  observed metric, and the only FCP figure available is a projected saving from
  a suggested fix. Reporting that as the page's FCP would fabricate exactly the
  kind of number this feature exists to eliminate (research.md R4).
- **FR-005**: A measurement that fails or cannot be taken MUST NOT fail the
  page's analysis, and MUST NOT discard findings already collected for that
  page or any earlier page.
- **FR-005a**: Each measurement MUST carry its own time bound. On expiry the
  measurement is abandoned, that page records it as not taken (FR-006), and
  the model's analysis of the page proceeds. A measurement MUST NOT be able to
  stall a run indefinitely, and the bound MUST hold whether or not the
  loop-wide timeout of feature 008 exists yet.
- **FR-005b**: An abandoned measurement MUST be distinguishable in the log
  from one that failed and from one that was never attempted, so that a slow
  site and a broken one do not read alike.
- **FR-006**: The system MUST distinguish, per page and per measurement,
  between "not taken", "taken and clean" and "taken and violated".
- **FR-006a**: Absence MUST be tracked per metric, not only per measurement. A
  trace can succeed and still report no Largest Contentful Paint — a page with
  no navigation event does exactly that (research.md R4) — so a successful
  measurement is not a guarantee that every metric within it exists.

**Provenance**

- **FR-007**: Every finding MUST carry the origin that produced it — audit
  measurement, performance trace, or model judgement.
- **FR-008**: Every measurement-sourced finding MUST carry the identifier of
  the rule that produced it. Findings from model judgement MUST NOT carry one.
- **FR-009**: The severity of a measurement-sourced finding MUST be derived
  from the measurement by a fixed, published rule, and MUST be identical for
  identical audit output.
- **FR-010**: The report MUST record which audit tooling produced its
  measurements, alongside the browser provenance it already records.

**What the reader sees** *(verified in the rendered report, never in an
in-memory object — recorded lesson from feature 005)*

- **FR-011**: The rendered report MUST make each finding's origin visible
  where the finding is read, in both the per-page listing and the prioritised
  listing.
- **FR-012**: The rendered statistics MUST include, per analysed page, the
  measured category scores and the recorded vitals, and MUST render an absent
  measurement or metric as explicitly absent rather than as a zero or a blank.
- **FR-012a**: The audit is taken in a mode that does not reload the page, so
  that the structure the model reads and the state the audit judged are one
  page load. The accessibility result is unaffected by this choice; the
  companion scores (SEO, best practices, agentic browsing) are degraded by it,
  and the report MUST label them as taken in that mode so no reader compares
  them against a full-navigation score (research.md R3).
- **FR-013**: A rule that fired on multiple elements MUST render as one
  finding stating how many elements it affects.
- **FR-013a**: Findings remain scoped to the page they were measured on. A
  rule that failed on several pages produces one finding per page.
- **FR-013b**: The rendered statistics MUST list every rule that failed on
  more than one page, with the number of pages affected, so that one defect
  repeated site-wide is legible as one defect. This summary is presentation
  only: it MUST NOT alter the finding count the CI gate counts.

**What the person watching sees**

- **FR-013c**: In interactive mode, measurement MUST appear as its own phase
  in the progress display, naming what is being measured and the page it is
  measured on. It is the longest single wait in a run, and an unlabelled wait
  of that length is indistinguishable from the hang FR-005a exists to prevent.
- **FR-013d**: When a measurement is abandoned under FR-005a, the interactive
  display MUST say so rather than moving on silently.

**What the model is asked**

- **FR-014**: The analysis prompt MUST NOT ask the model to determine anything
  the run measures. It MUST NOT ask for performance judgements the model has
  no evidence for.
- **FR-015**: The model MUST be given the measured facts for the page it is
  judging, so that its own findings do not contradict or duplicate them.
- **FR-016**: The model MUST remain able to raise issues measurement cannot
  reach — wording, information architecture, whether a flow makes sense for
  the persona — and those findings MUST be labelled as judgement.
- **FR-017**: A measured violation MUST be recorded with the audit's own
  wording and rule identifier, unaltered. No model-authored text may appear
  inside a finding the report labels as measured.
- **FR-018**: For each page that produced measured violations, the model MUST
  additionally write **one** page-level note explaining what that set of
  violations means for this persona and how to address it in this product.
  The note MUST be stored and rendered as model judgement, separately from the
  findings it discusses, and MUST NOT be attributed to the measurement.
- **FR-019**: The per-page note MUST be produced at most once per page,
  whatever the violation count. Annotating each violation separately would
  make model output scale with violation count and work against the budget
  FR-021 holds.

**Gate and cost**

- **FR-020**: Measurement-sourced findings MUST participate in the CI gate's
  severity counting on the same terms as any other finding, and the change in
  gate behaviour MUST be documented as a breaking change for existing
  threshold configurations.
- **FR-021**: Adding measurement MUST NOT undo feature 006. The evidence given
  to the model per page MUST stay within the budget stated in SC-007, with the
  per-page note of FR-018 counted inside it.

### Key Entities

- **Page Measurement**: What was measured for one page — the category scores,
  the recorded vitals, the list of violations, and, for each of those, whether it
  was taken at all. Belongs to exactly one page analysis.
- **Violation**: One rule that failed on one page — its identifier, its
  impact, and how many elements it affected. Becomes exactly one finding.
- **Finding Origin**: Which of the three sources produced a finding. Carried
  by every finding, rendered wherever a finding is rendered.

## Success Criteria *(mandatory)*

All criteria are verified against the **rendered markdown report** a user
opens, or against measurements taken from real request bodies — not against
internal objects. Feature 005 shipped a defect that every object-level test
passed, and feature 006 shipped two more; this is the correction.

### Measurable Outcomes

- **SC-001**: For a fixture page carrying a planted accessibility defect, the
  rendered report contains a finding for that defect, naming the rule that
  caught it, on the page where it was planted. 100% of runs.
- **SC-002**: 100% of findings in a rendered report state their origin. No
  finding is rendered without one.
- **SC-003**: Two runs against an unchanged fixture page produce identical
  measurement-sourced findings — same rules, same count, same severities.
  Vitals may differ between runs; the violation set may not.
- **SC-004**: The rendered statistics carry the recorded vitals and the
  category scores for every page that was measured, and words identifying a
  measurement or metric as not taken wherever one is missing — including a
  trace that succeeded but produced no Largest Contentful Paint. No page
  renders a measurement it did not take as a number.
- **SC-005**: When the audit fails on a page, that page's model findings are
  all present in the rendered report — zero findings lost — and every earlier
  page's findings are present too.
- **SC-006**: A rule that fired on N elements renders as one finding stating
  N, for every such rule in the report.
- **SC-007**: Total model request bytes per page stay at or below **192,000**
  bytes — 1.25× the 153,913-byte measurement recorded for v4.3.0 in
  `specs/006-context-diet/baseline.md` — measured with the same intercepting
  harness, so the number is comparable to the one it is compared against.
- **SC-008**: Measurement adds no more than **60 seconds** per page, the bound
  of FR-005a. Recorded from a real run in Phase 0: 7.6 seconds per page against
  a localhost fixture (1.7s audit, 5.9s trace), of which 5 seconds is a fixed
  sleep the tracing tool performs by design. The bound is a safety net against
  a hang, not a performance target — a run that regularly approaches it should
  be read as something being wrong (research.md R5).
- **SC-008a**: A page whose measurement never returns completes its analysis
  within the FR-005a bound plus the time the analysis would have taken
  unmeasured. Verified by driving a measurement that never resolves and
  observing the run finish with that page rendered as not measured.
- **SC-009**: The rendered report contains no performance finding at all —
  neither measured nor judged. After this feature, performance appears in the
  report as numbers in the statistics or not at all.
- **SC-009a**: In an interactive run, the progress display shows a measurement
  phase naming the page, for every page measured, and says so when a
  measurement is abandoned. Verified against what the display renders, not
  against the state that drove it.
- **SC-010**: For every page carrying measured violations, the rendered report
  contains exactly one model-written note about them, attributed to model
  judgement. No page carries more than one, whatever its violation count.
- **SC-011**: No text inside a finding marked as measured differs from the
  audit's own wording for that rule. Checked by comparing rendered finding
  text against the audit output for the same run.

## Assumptions

These are decisions taken here because a reasonable default exists. Each is
open to being overturned in `/speckit-clarify` or `/speckit-plan`.

- **The audit source is the one already installed.** The browser server this
  project pinned in feature 005 exposes both the audit and the trace. No new
  external service, MCP server or vendor account is introduced. Introducing
  one would reopen the procurement cost feature 005 spent its whole budget on.
- **Severity comes from the accessibility audit's own impact rating**, mapped
  by a fixed table (critical → critical, serious → high, moderate → medium,
  minor → low). A published table is what makes FR-009 checkable; the exact
  mapping is cheap to revise and expensive to leave implicit. This mapping is
  the reason FR-003 admits only the accessibility category: it is the only
  one that arrives with an impact rating to map.
- **One violation is one finding**, however many elements it touched. Forty
  findings for one CSS rule would drown the report the feature is trying to
  make trustworthy.
- **Measured findings are capped per page** at a limit set in the plan from an
  observed distribution, with the report stating plainly when a cap truncated
  the list. An uncapped audit can produce a report nobody reads.
- **The vitals are recorded as measured, not judged.** A slow LCP appears as a
  number in the statistics. Whether a number is bad enough to be a finding is
  a threshold question, and thresholds for it are not introduced here.
- **Existing reports remain readable.** A report produced before this feature
  has no origin on its findings; nothing in this feature requires reading old
  reports, and no migration of stored reports is performed.

## Out of Scope

- **Performance, best-practices and SEO audits as findings.** They are
  measured and their scores are reported, but they do not become findings
  here. None of them carries an impact rating, so each would need a severity
  rule invented for it — and inventing one is the guessing this feature was
  written to remove. Revisit when the knowledge-as-skills work (feature 009)
  supplies a rule table those categories can be judged against.
- **axe MCP.** The audit's accessibility category is already built on
  axe-core, so a second source would duplicate rule identifiers, add an
  enterprise dependency, and delay this feature. It stays a deferred item,
  triggered only if measurement shows the audit missing rules that matter. At
  that point the lighter path — injecting axe-core through script evaluation —
  is evaluated before adding a server.
- **Baseline and regression tracking across runs** (roadmap 5.2, feature 010).
  This feature makes the numbers exist; comparing them between runs is the
  next feature and needs a stored artefact this one does not define.
- **Severity thresholds on the vitals themselves.** Turning "LCP is 4.1s" into
  a finding requires agreeing what "too slow" means for a persona, which is
  the knowledge-as-skills work (roadmap Phase 3, feature 009).
- **Replacing the manual agent loop** (feature 008). This feature works within
  the loop as it stands.

## Dependencies

- Feature 005 (`devtools-mcp-swap`) — supplies the browser server that exposes
  the audit and trace tools. Shipped.
- Feature 006 (`context-diet`) — supplies both the stage model that decides
  which tools a step may call, and the intercepting measurement harness SC-007
  is expressed in. Shipped.
- Feature 004 (`ci-gate`) — supplies the severity counting FR-020 changes the
  inputs to. Shipped.
