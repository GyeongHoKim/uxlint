# Feature Specification: Host-Neutral Inverted Delegation

**Feature Branch**: `010-inverted-delegation`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "Host-neutral inverted delegation: let a coding agent the developer is already working inside drive a uxlint UX review itself, instead of uxlint launching the agent as a child process."

## Overview

Delegate mode (009) hands the UX judgement to a coding agent the developer already
pays for, so uxlint needs no model credential. It does this by **launching** the
agent as a child process and serving it evidence over MCP.

Live runs on 2026-09-10 showed that the launching is the part that does not
generalise. It works for Claude Code and for Codex, both of which accept an
injected server and both of which have a real read-only posture. It cannot work
for Cursor Agent at all, and the reasons are structural rather than incidental
(recorded in `specs/009-delegate-mode/research.md`):

- `agent -p` refuses to start without workspace trust, so no Cursor delegated run
  has ever completed.
- Cursor gives an MCP server child none of its own environment, so a per-run
  session cannot reach the server through the static registration file uxlint
  deliberately does not write.
- No flag combination on the installed version both submits findings and refuses
  writes: `--mode plan` blocks the judgement calls, while `--trust` and
  `--sandbox enabled` both let the agent write to an absolute path inside the
  developer's repository, and `--workspace` confines nothing.

This feature adds the other direction, which removes all three problems at their
root: **the agent calls uxlint**. uxlint never launches an agent, so it never has
to confine one, never needs trust, and never needs to get a session into a child
it does not control. It is the shape OpenCodeReview's own delegate mode already
uses, whose documentation states that the agent initiates the tool rather than the
reverse.

The direction is host-neutral by construction. The same two commands serve any
agent; only a short per-agent instruction file differs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A review run from inside the agent the developer is already using (Priority: P1)

A developer is working in their coding agent on a web application. They ask the
agent, in their own words, to review the app's UX. The agent runs uxlint to do the
deterministic work — open every configured page in a real browser, capture its
structure, measure accessibility and performance — reads back what uxlint
captured, judges it as the configured persona, and hands its judgement to uxlint,
which writes the report and decides the gate verdict. No model API key is
involved: the reasoning was done by the agent the developer was already paying
for, and the deterministic work was done by uxlint.

**Why this priority**: This is the feature. It is the only story that delivers
value on its own, and every other story is a consequence of it.

**Independent Test**: With no provider credential set, run the deterministic
command and confirm it emits evidence for every configured page; feed a judgement
back through the submission command and confirm a report is written containing
both measured findings and judgement findings. Fully testable without any agent
present, because both halves are ordinary commands.

**Acceptance Scenarios**:

1. **Given** a valid configuration and no provider credential, **When** the
   deterministic command runs, **Then** it captures and measures every configured
   page and emits each page's evidence in a machine-readable form, and reads no
   provider credential at any point.
2. **Given** evidence emitted for a run, **When** a judgement naming those pages
   is submitted, **Then** every accepted finding is recorded with an origin uxlint
   assigned, a report is written to the configured output path, and the gate
   verdict is reported.
3. **Given** a submitted finding that declares its own origin, rule identifier or
   affected elements, **When** it is submitted, **Then** it is refused with a
   message naming the offending field, and nothing about it reaches the report.
4. **Given** a submitted finding naming a page the run never captured, **When** it
   is submitted, **Then** it is refused and the pages of the run are named in the
   refusal.

---

### User Story 2 - Cursor Agent becomes usable, and stops being advertised as something it is not (Priority: P2)

A developer whose agent is Cursor Agent can complete a UX review. Today they
cannot: `uxlint --delegate --host-agent cursor-agent` fails in about a second and
the report records every page as unjudged. After this feature they follow the same
route as every other agent, and the launcher stops claiming to support a host it
cannot confine.

**Why this priority**: It is the failure that motivated the feature, and it is a
correctness problem in shipped behaviour rather than a new capability. It is P2
only because it is delivered by US1's mechanism plus documentation.

**Independent Test**: Ask for the Cursor launcher route and confirm the developer
is told the supported route instead of being left with a broken run; then complete
a review through the inverted route with Cursor Agent driving.

**Acceptance Scenarios**:

1. **Given** Cursor Agent is the requested host for the launcher route, **When**
   the run starts, **Then** it stops before any browser is opened and names the
   inverted route as the supported way to use Cursor Agent.
2. **Given** Cursor Agent is installed, **When** the developer asks it to review
   the application, **Then** it follows its instruction file, runs both commands,
   and a report is produced.
3. **Given** the launcher route, **When** Claude Code or Codex is the host,
   **Then** its behaviour is unchanged from 009.

---

### User Story 3 - A judgement that stops early still produces an honest report (Priority: P3)

An agent runs out of context, is interrupted by the developer, or simply stops
after three of five pages. The report says which pages were judged and which were
not, and does not present an unjudged page as a clean one.

**Why this priority**: It preserves the property 009 already guarantees — page
status is decided by what arrived, never by the agent's account of itself — across
a route where the agent is in charge of its own progress and cannot be timed out
by uxlint.

**Independent Test**: Submit judgement for a subset of the run's pages, then
assemble the report, and confirm the unjudged pages are recorded as partial with a
reason.

**Acceptance Scenarios**:

1. **Given** a run of five pages and judgement submitted for three, **When** the
   report is assembled, **Then** the three carry their findings and the remaining
   two are recorded as partial with a reason saying judgement never reached them.
2. **Given** an agent that reports success but submitted nothing for a page,
   **When** the report is assembled, **Then** that page is still recorded as
   unjudged.

---

### Edge Cases

- **The agent never comes back.** Evidence was captured and no judgement is ever
  submitted. The captured work must not be lost silently, and the developer must
  be able to assemble a report from what exists, or discover that nothing was
  judged, rather than being left with a directory nobody mentions.
- **Two reviews at once.** Two agents, or two terminals, run the deterministic
  command against different configurations at the same time. Neither run's
  judgement may land in the other's report.
- **A judgement submitted twice for one page.** The second submission must be
  refused as late rather than doubling the page's findings, exactly as the
  launcher route already refuses it.
- **A stale handoff.** A judgement is submitted against a run whose evidence was
  captured long ago, or against a run that no longer exists. It must be refused
  with a message that says so, not attributed to whatever run happens to be
  current.
- **A mangled payload.** The agent submits truncated or malformed input. It must
  be refused with a message the agent can act on, and the run's existing state
  must survive.
- **Evidence too large for the agent's context.** A configuration with many pages
  produces more captured structure than an agent can hold at once. The agent must
  be able to take one page at a time rather than being forced to read everything
  before it can judge anything.
- **No browser.** The environment cannot run a browser. The deterministic command
  must fail with the existing preflight explanation before it claims to have
  captured anything.
- **A configuration with no pages, or a page that failed to load.** A page that
  could not be read must still be handed to the agent with the reason, so the
  agent can tell a page it has not reached from a page there is nothing to say
  about.

## Requirements *(mandatory)*

### Functional Requirements

**The deterministic half**

- **FR-001**: uxlint MUST provide a command that performs every deterministic step
  of a review — environment preflight, navigation, structure capture, and
  accessibility and performance measurement — for every page in the configuration,
  without reading any model provider credential and without contacting any model.
- **FR-002**: That command MUST emit, for each page, everything an agent needs to
  judge it: the page's declared features, the run's persona, the captured
  structure, and a description of what was measured.
- **FR-003**: Its output MUST be machine-readable and stable enough for an agent to
  parse without being told the layout, and MUST carry nothing but that output on
  the stream the agent reads.
- **FR-004**: A page whose capture failed MUST still be emitted, carrying the
  reason it could not be read.
- **FR-005**: The command MUST allow an agent to take one page's evidence at a time
  as well as all of it at once, so a configuration larger than the agent's context
  does not have to be read before judgement can begin.

**The intake half**

- **FR-006**: uxlint MUST provide a command that accepts an agent's judgement for a
  run, validates it, assembles the report at the configured output path, and
  reports the gate verdict with the same exit semantics the existing modes use.
- **FR-007**: Every submitted finding MUST pass through the same intake the
  existing judgement server uses, so that origin assignment has exactly one
  implementation. A submission MUST NOT be able to declare its own origin, rule
  identifier, or affected elements, and MUST be refused when it tries.
- **FR-008**: A submission naming a page outside the run MUST be refused, and the
  refusal MUST name the run's pages.
- **FR-009**: A submission arriving after its page was completed MUST be refused as
  late, and MUST not alter what was already recorded for that page.
- **FR-010**: A malformed or truncated submission MUST be refused with a message
  that names what was wrong, and MUST leave the run's recorded state unchanged.
- **FR-011**: Page status in the report MUST be decided by what was submitted,
  never by the agent's own account of what it did.

**Correlating the two halves**

- **FR-012**: The two commands MUST be correlated by a run identity the
  deterministic half produces and the intake half requires, so that concurrent
  runs cannot cross and a judgement cannot be attributed to a run it was not made
  against.
- **FR-013**: A submission naming a run that does not exist MUST be refused with a
  message saying so.
- **FR-014**: A run whose judgement never arrives MUST be discoverable and
  disposable, and MUST NOT accumulate silently on the developer's machine.
- **FR-015**: Nothing either command writes MUST land inside the developer's
  repository except the report at the configured output path.

**Host neutrality and the launcher route**

- **FR-016**: Neither command MUST behave differently according to which agent is
  calling it; no agent-specific knowledge belongs in either one.
- **FR-017**: uxlint MUST ship, for each supported agent, an instruction file that
  tells that agent the sequence to follow, installable by the developer in one
  documented step.
- **FR-018**: The launcher route MUST continue to work unchanged for the two hosts
  whose read-only posture is verified, and MUST NOT be removed by this feature.
- **FR-019**: Requesting Cursor Agent on the launcher route MUST stop before a
  browser is opened and name the inverted route instead, rather than starting a run
  that cannot complete.
- **FR-020**: The documentation MUST state, for each supported agent, which route
  applies to it and why, so a developer is not left to discover a broken
  combination by running it.

### Key Entities

- **Review run**: One review's deterministic output and the judgement recorded
  against it. Has an identity, the configuration it was made from, the evidence for
  each page, and the submissions received so far. Outlives the process that created
  it, because the two halves are separate invocations.
- **Page evidence**: What an agent is given about one page — declared features,
  persona, captured structure, measurement description, and, when the page could
  not be read, the reason. Produced entirely without a model.
- **Judgement submission**: One thing an agent asserts about one page: a finding, a
  note about the measured violations, or a signal that a page is finished. Carries
  no provenance of its own; uxlint assigns that.
- **Agent instruction file**: The per-agent artefact that tells one agent the
  sequence to follow. The only part of this feature that is agent-specific.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer working inside any of the three supported agents can
  complete a UX review with no model provider credential configured, and the
  resulting report contains both measured findings and judgement findings.
- **SC-002**: A Cursor Agent user can complete a review. Today the success rate for
  that combination is zero: every run fails within about a second and reports every
  page as unjudged.
- **SC-003**: For the same configuration, the measured portion of the report is
  identical between the launcher route and the inverted route — same violations,
  same rule identifiers, same affected element counts, same provenance. Only the
  judgement findings may differ, because a different model wrote them.
- **SC-004**: No route can produce a finding presented as measured that was not
  measured. Demonstrated by attempting it through both routes and being refused
  in both.
- **SC-005**: Using the inverted route costs the developer at most one setup step
  beyond installing uxlint, and that step is documented.
- **SC-006**: The deterministic half takes no longer per page than the existing
  delegated route does, which measured 8 seconds per page for capture and
  measurement.
- **SC-007**: A review abandoned partway through still produces a report, and every
  page it did not judge is marked as unjudged rather than clean.

## Assumptions

- **The developer is inside an agent for this route.** The inverted route is for
  interactive use in an agent session. Continuous integration keeps using the
  existing execution mode with a credential, because no agent is driving there and
  the subscription-reuse premise does not hold — the same assumption 009 records.
- **The launcher route stays.** For Claude Code and Codex it is one command and its
  read-only posture is structural and verified. This feature adds a route; it does
  not replace one.
- **Cursor Agent keeps its identifier.** `--host-agent cursor-agent` continues to
  be accepted rather than becoming an unknown value, so that a developer who used
  the documented flag gets an explanation instead of a parse error. Nothing
  regresses by changing its behaviour, because that combination has never
  completed a run.
- **Existing machinery is reused, not rebuilt.** The evidence builder, run state,
  judgement intake, report builder and gate evaluation all exist from 009 and are
  the same ones both routes use. This feature adds two entry points and removes one
  adapter.
- **Judgement may arrive incrementally or all at once.** The run already tracks
  per-page state, so an agent may submit as it works through pages or in one final
  submission. Both are supported rather than one being mandated.
- **The instruction files are installed by the developer.** This matches the
  precedent the 009 research cites: OpenCodeReview's delegate mode requires
  installing a skill before first use. The difference is that here it is the whole
  integration rather than a workaround for a launcher.
- **The agent is trusted for judgement, not for provenance or status.** It reasons
  about the pages; it does not get to say what was measured or which pages are
  done.
