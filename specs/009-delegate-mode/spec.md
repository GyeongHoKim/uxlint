# Feature Specification: Delegate Mode

**Feature Branch**: `009-delegate-mode`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "delegate-mode — Hand UX judgement to the AI coding agent CLI the developer already runs (Claude Code, Codex, Cursor Agent) over MCP, while uxlint keeps every deterministic step: configuration, browser preflight, page capture, measurement, report assembly and the gate verdict."

## Context

Running uxlint today costs a second model bill. The tool requires a model
provider credential of its own and drives the whole analysis through the model
it buys with it. Meanwhile the developer sitting at the terminal is already
paying for a coding agent — Claude Code, Codex or Cursor Agent — whose
subscription includes exactly the model access uxlint just went out and bought
again.

The reason uxlint owns the model is not judgement; it is *evidence*. The
analysis has to open a real browser, navigate, capture the page structure
byte-for-byte, and run an accessibility audit whose violations the report marks
as measured fact rather than opinion. None of that is a language task. Only the
last step — reading a captured page as a persona and saying what is wrong with
it — actually needs a model.

That split already exists in the codebase. Configuration, preflight, browser
startup, measurement, report assembly and the gate verdict are all deterministic
and model-free. The model appears in exactly one place: the page analysis loop.

Delegate mode makes the split explicit. uxlint produces the evidence and hands
the judgement to a host agent the developer already has, receiving the findings
back through tools uxlint itself defines. Three consequences follow:

1. **No second credential.** A developer with a coding-agent subscription and
   no provider key can run a full review. Today that is impossible: the key
   check throws before any analysis begins, even though delegate mode never
   calls a model.
2. **The evidence guarantee survives.** Measured violations still come from the
   audit, judgement findings still get their origin stamped by uxlint rather
   than declared by the model, and the page snapshot is still the browser's own
   output. Delegating judgement must not become delegating provenance.
3. **The reports do not change.** A delegated run produces the same report
   shape, the same page statuses and the same gate verdict as a built-in run.
   Delegate mode is a different way to obtain judgement, not a different
   product.

This feature is deliberately **additive**. The existing execution modes are
untouched; delegate mode is opt-in and sits beside them.

## Target Personas

Two people feel this feature (Constitution III):

- **The subscriber with no API key.** They already pay for a coding agent and
  use it every day. They want to try uxlint on their own project this
  afternoon, and the first thing the tool asks for is a provider key they do
  not have, cannot expense quickly, and would rather not create. They abandon
  the tool at the first screen.
- **The developer under a credential policy.** Their organisation approves one
  agent CLI and routes all model traffic through it. A separate tool holding
  its own provider key is a policy exception they will not get. They need
  uxlint to work through the channel that is already approved, and they need
  to be sure that handing their repository to that agent does not let it change
  anything.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review a site without model credentials (Priority: P1)

A developer has a coding agent CLI installed and signed in, and no provider API
key anywhere on the machine. They write a `.uxlintrc.yml` at their repository
root, run uxlint in delegate mode, and get the same report they would have got
from a built-in run: measured accessibility violations, judgement findings
written from their persona's perspective, and a gate verdict.

**Why this priority**: This is the entire feature. Everything else refines it.
Without this story delegate mode does not exist, and with only this story the
feature is already usable by its primary persona.

**Independent Test**: Unset every provider credential, install one supported
agent CLI, run a delegated review against a fixture site, and confirm a
complete report is written with both measured and judgement findings present.

**Acceptance Scenarios**:

1. **Given** no provider API key is set and a supported host agent is available,
   **When** the developer runs uxlint in delegate mode,
   **Then** the run completes and writes a report containing measured findings
   and judgement findings.
2. **Given** the same configuration,
   **When** the developer compares the delegated report to a built-in report of
   the same page,
   **Then** the measured portion — violations, rule identifiers, affected
   element counts, provenance — is identical, and every judgement finding
   carries an origin assigned by uxlint.
3. **Given** a provider API key *is* present in the environment,
   **When** the developer runs uxlint in delegate mode,
   **Then** the key is not read and no request is made to any model provider by
   uxlint itself.

---

### User Story 2 - The repository is never modified (Priority: P2)

The delegated agent runs at the developer's repository root and can read source
code, which makes its recommendations concrete. It must not be able to write.
The developer runs a delegated review on a clean working tree and finds the
tree still clean afterwards — no edited files, no new configuration, no
stray artefacts.

**Why this priority**: Without it the second persona cannot adopt the feature at
all, and every user is one agent misstep away from unreviewed edits landing in
their working tree. It is not P1 only because it has no value until P1 works.

**Independent Test**: Run a delegated review on a clean checkout with each
supported host agent and confirm the working tree is unchanged, including
untracked files.

**Acceptance Scenarios**:

1. **Given** a clean working tree,
   **When** a delegated review completes,
   **Then** the working tree is unchanged and no files were added.
2. **Given** a host agent that would otherwise be permitted to edit files,
   **When** uxlint launches it,
   **Then** the launch enforces a read-only posture that the developer's own
   settings cannot widen.
3. **Given** a delegated review that fails partway,
   **When** the run ends,
   **Then** any working state uxlint created for the run is removed.

---

### User Story 3 - Choosing and preparing a host agent (Priority: P3)

A developer with more than one agent CLI installed picks which one performs the
judgement. A developer with none, or with an unsupported one, is told what to
install rather than left with an opaque failure. A Cursor Agent user is told
about the one-time registration their agent requires, once, in a form they can
copy.

**Why this priority**: It converts a working feature into an adoptable one.
Users can survive without it by having exactly one supported agent installed and
configured correctly.

**Independent Test**: With zero, one, and several supported agents present,
confirm the tool selects sensibly, reports what it selected, and names the
missing prerequisite when it cannot proceed.

**Acceptance Scenarios**:

1. **Given** several supported host agents are installed,
   **When** the developer names one,
   **Then** that one performs the judgement and the report records which agent
   was used.
2. **Given** no supported host agent is installed,
   **When** the developer runs uxlint in delegate mode,
   **Then** the run stops before opening a browser and names the supported
   agents and how to install one.
3. **Given** a host agent is installed but not signed in,
   **When** the developer runs uxlint in delegate mode,
   **Then** the failure names authentication as the cause rather than reporting
   an empty or failed analysis.

---

### Edge Cases

- **The host agent never signals completion.** It exits after submitting some
  findings, or none. The page is recorded with the status its evidence
  supports, matching the existing distinction between a finished sweep and one
  that stopped short, and the run continues to the next page.
- **The host agent submits a malformed finding.** The submission is rejected at
  the moment it arrives, the rejection tells the agent what was wrong so it can
  correct itself, and nothing invalid reaches the report.
- **The host agent claims a finding is measured.** It cannot: origin is assigned
  by uxlint on receipt and is not accepted from the submitter.
- **The host agent hangs.** The session is bounded in time and ends with a
  report rather than waiting indefinitely.
- **The session dies partway through the page list.** It exhausts its context,
  crashes, or is cut off at its time bound after judging three of seven pages.
  The four unjudged pages still appear in the report with their measured
  findings and a status that says judgement never reached them; the three judged
  pages keep their findings.
- **The page list is too large for one session.** Because a run uses a single
  session, page count is the scaling limit. The run must degrade into the
  partial-report case above rather than failing outright or silently dropping
  pages.
- **The host agent is launched but produces no findings at all.** The page is
  still captured and measured, so the report contains the measured findings and
  records that judgement produced nothing.
- **Two delegated runs execute in the same repository at once.** Neither run
  sees the other's findings, and neither corrupts the other's working state.
- **A judgement submission arrives after its page has closed.** It is discarded
  rather than attached to whatever page is open.
- **Delegate mode is requested in a continuous integration environment.** The
  tool proceeds if the prerequisites happen to be met, but the documented and
  supported path for automation remains the existing execution mode.
- **The browser preflight fails.** Delegate mode stops for the same reason and
  with the same message as the existing modes, without launching a host agent.

## Requirements *(mandatory)*

### Functional Requirements

**Mode and credentials**

- **FR-001**: Delegate mode MUST be opt-in; existing execution modes MUST behave
  exactly as they do today when it is not requested.
- **FR-002**: Delegate mode MUST complete a full review without any model
  provider credential being present.
- **FR-003**: uxlint MUST NOT issue any model provider request of its own while
  running in delegate mode, whether or not a credential is available.

**Division of work**

- **FR-004**: uxlint MUST perform configuration resolution, browser preflight,
  page navigation, page structure capture, accessibility and performance
  measurement, report assembly, report persistence and gate evaluation itself in
  delegate mode.
- **FR-005**: uxlint MUST supply the host agent with the captured page structure,
  the measurement results, the target persona and the page's declared features,
  so that judgement is made on the same evidence the built-in mode uses.
- **FR-006**: The host agent MUST be responsible only for judgement, and MUST
  NOT be relied upon to navigate, capture or measure.

**Judgement intake**

- **FR-007**: uxlint MUST expose the same judgement operations delegate mode
  needs as the built-in mode uses: recording a finding, recording a single note
  about measured violations, and signalling that a page's judgement is finished.
- **FR-008**: Every submitted finding MUST be validated against the same
  contract the built-in mode enforces, at the moment of submission, and an
  invalid submission MUST be rejected with a reason the submitter can act on.
- **FR-009**: uxlint MUST assign each finding's origin itself. A submitter MUST
  NOT be able to declare a finding measured.
- **FR-010**: A page whose judgement did not complete MUST be recorded with the
  same status the built-in mode would record for an incomplete page, carrying
  the reason it stopped short.

**Host agents**

- **FR-011**: Delegate mode MUST support Claude Code and Codex as hosts uxlint
  launches. *Superseded in part by
  [010-inverted-delegation](../010-inverted-delegation/spec.md):* Cursor Agent
  was listed here originally, but no launch of it is both read-only and able to
  submit findings (tasks.md T041). It is supported through the agent-driven
  route instead, where Cursor Agent follows the uxlint review skill and calls
  uxlint itself.
- **FR-012**: uxlint MUST enforce a read-only posture on the host agent it
  launches, and that posture MUST NOT be weakened by the developer's own agent
  settings.
- **FR-013**: uxlint MUST NOT create, modify or delete any file in the
  developer's repository as part of running a delegated review.
- **FR-014**: *Superseded by
  [010-inverted-delegation](../010-inverted-delegation/spec.md).* This required
  a documented one-time registration for host agents that cannot accept
  judgement operations at launch time, and Cursor Agent was the only one. With
  its launcher withdrawn no launched host needs a registration; Cursor Agent
  setup is the skill install that 010's contract describes.
- **FR-015**: uxlint MUST allow the developer to choose which installed host
  agent performs the judgement, and MUST use the single available agent as the
  default when exactly one is installed. When several are installed and none is
  named, uxlint MUST stop before starting a browser and name the installed
  choices rather than selecting one silently: which agent judges a review
  changes the review, so it is not a decision to make on the developer's behalf.
- **FR-016**: When no supported host agent is available, or the selected one is
  not usable, uxlint MUST stop before starting a browser and MUST name the
  specific unmet prerequisite.

**Run integrity**

- **FR-017**: Each delegated run MUST keep its judgement intake isolated from any
  other run executing at the same time.
- **FR-018**: uxlint MUST bound the time the host agent session may take, and
  MUST produce a report when that bound is reached.
- **FR-019**: uxlint MUST remove the working state it created for a run when the
  run ends, on both the successful and the failing path.
- **FR-020**: The report produced by a delegated run MUST have the same shape,
  the same page statuses and the same gate semantics as one produced by the
  existing modes, and MUST additionally record which host agent produced the
  judgement.

**Invocation shape**

- **FR-021**: uxlint MUST invoke the host agent once per run, presenting every
  page's evidence within a single host agent session, so that the agent's fixed
  startup cost is paid once rather than once per page.
- **FR-022**: Within that single session, judgement MUST still be delimited per
  page: findings MUST be attributed to the page they were submitted against, and
  the agent MUST signal each page's judgement as finished before the next page's
  judgement begins.
- **FR-023**: When the host agent session ends before every page has been
  judged, uxlint MUST still write a report covering all pages. Pages the session
  never reached MUST carry their measured findings and a status reflecting that
  judgement did not happen, distinguishable from a page the agent judged and
  found nothing wrong with.

### Key Entities

- **Delegation Session**: One delegated run. Owns the working state that
  judgement submissions arrive into, identifies itself so that submissions
  cannot cross between concurrent runs, and is disposed of when the run ends.
- **Page Evidence**: What uxlint hands to the host agent for one page — the
  captured page structure, the measurement results, the persona and the page's
  declared features. It is produced entirely without a model.
- **Judgement Finding**: A UX problem asserted by the host agent. Carries
  severity, category, description, persona relevance, recommendation and the
  page it belongs to. Its origin is stamped by uxlint on receipt.
- **Host Agent Adapter**: The knowledge of how one agent CLI is launched
  non-interactively, how judgement operations are made available to it, how a
  read-only posture is enforced on it, and how its outcome is determined.
- **Host Agent Availability**: Whether a given agent is installed, authenticated
  and prepared, resolved before a browser is started.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with a supported agent CLI and no model provider
  credential completes a full review and receives a report, where today the run
  fails before any analysis begins.
- **SC-002**: For the same page and configuration, the measured portion of a
  delegated report is identical to that of a built-in report: same violations,
  same rule identifiers, same affected element counts, same provenance.
- **SC-003**: A delegated review over a clean working tree leaves the working
  tree clean, with no modified, added or removed files, for every supported host
  agent.
- **SC-004**: No submission that violates the finding contract ever appears in a
  report, and every rejection tells the submitter what to fix.
- **SC-005**: A run whose host agent fails, stalls or produces nothing still
  writes a report in which the affected pages carry their measured findings and
  an honest status.
- **SC-006**: A developer using Claude Code or Codex reaches their first
  delegated review with no setup beyond installing uxlint; a developer using
  Cursor Agent reaches it after one documented registration step.
- **SC-007**: Concurrent delegated runs in the same repository each produce a
  report containing only their own findings.
- **SC-008**: The host agent is started exactly once per delegated run,
  regardless of how many pages the configuration lists, so the startup cost of a
  review does not grow with page count.
- **SC-009**: A run whose host agent session ends after judging only some of the
  pages still yields a report covering every configured page, in which a judged
  page and an unreached page are distinguishable without reading logs.

## Assumptions

- The developer has installed and authenticated their host agent CLI themselves.
  uxlint detects and reports on that state but does not install or sign in to
  anything.
- Delegate mode targets the developer's own machine. Continuous integration
  keeps using the existing execution mode, because the premise of delegate mode
  — reusing a subscription the developer already holds — does not hold in an
  automation environment where credentials would have to be provisioned anyway.
- The delegated agent runs at the developer's repository root and may read the
  source tree, which is what allows its recommendations to name real files. Read
  access is intended; write access is not.
- The report format, page status semantics and gate thresholds established by
  earlier features are unchanged. Delegate mode adds a producer of judgement, not
  a new report.
- Cursor Agent requires a one-time registration by the developer because it
  discovers judgement operations only from its own configuration file, which
  uxlint declines to write into the developer's repository or home directory at
  run time.
- One host agent session handles every page in a run. Page count is therefore
  the scaling limit of a delegated review, and a configuration large enough to
  exhaust a session degrades into a partial report rather than an error. No
  page-count ceiling is set in this specification; the degradation path is what
  is required.
- Host agent CLIs change their command-line surface between releases. The
  adapters are expected to be version-sensitive, and a host agent whose surface
  has moved is treated as an unmet prerequisite rather than a crash.
