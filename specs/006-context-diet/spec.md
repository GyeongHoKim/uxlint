# Feature Specification: Context Diet — Stop Paying for What the Analysis Never Uses

**Feature Branch**: `006-context-diet`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "Start 006, the context diet. Combine roadmap Phase 1.1 (limit which tools are exposed) and Phase 1.2 (remove the snapshot round trip) into one feature. Today every model call is offered the browser server's entire tool surface even though the analysis names two of those tools, and the page's accessibility snapshot is read by the model and then dictated straight back out through a second tool call, so the same tree occupies the conversation twice and every later turn carries both copies."

## Target Persona

**Primary — the team paying per run.** They adopted uxlint to review a handful of pages on every pull request. They do not read token counters, but they feel the bill and the wait. What they are buying is the model's attention on their product; what they are currently buying is largely a catalogue of browser tools nobody invoked and a page structure transcribed twice.

**Secondary — the reader of a saved report.** They open the snapshot recorded for a page to see what was actually analysed. Today that text was retyped by a language model rather than copied by the machine, so it can be truncated or subtly altered, and nothing marks where. They cannot tell a faithful record from a paraphrase.

**Tertiary — the next feature.** 007 adds audit and trace tools to the same conversation, and 010 compares snapshots between runs to decide what is new. Neither works on the current footing: 007 has no room to add tools to a context already spending most of itself on unused ones, and 010 cannot fingerprint a snapshot that is not reproducible.

The three are served by one idea: the conversation should carry what the analysis uses, once.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The recorded snapshot is what the browser produced (Priority: P1)

A developer opens the report for a page and reads its captured structure. What they see is exactly what the browser returned — not a version the model retyped, and not a truncated one.

**Why this priority**: This is a correctness problem wearing a performance costume. The saved snapshot is presented as a record of what was analysed, and today it is a transcription with no guarantee of fidelity. Any later feature that compares runs rests on it. Fixing it also happens to remove the single largest repeated cost, but it would be worth doing at equal cost.

**Independent Test**: Analyse a page, capture what the browser returned, and compare it byte for byte with what the report recorded. Deterministic, requires no token measurement, and delivers value on its own.

**Acceptance Scenarios**:

1. **Given** a page whose structure the browser captured, **When** the report is written, **Then** the recorded snapshot is byte-identical to what the browser returned
2. **Given** a page with a very large structure, **When** the report is written, **Then** the recorded snapshot is still byte-identical — size must not silently truncate it
3. **Given** an analysis in progress, **When** the model works through a page, **Then** it is never asked to reproduce the snapshot it has already been shown
4. **Given** a page where the structure was never captured, **When** the report is written, **Then** the page records an empty snapshot and its status reflects that the capture did not happen, rather than appearing complete with a silently missing record

---

### User Story 2 - A run costs what the analysis actually uses (Priority: P1)

The same configuration against the same pages consumes materially fewer tokens per page, and the analysis reaches the same kind of conclusions. The user changes nothing.

**Why this priority**: Equal to P1 because it is the feature's stated purpose and the reason the next two features are blocked. A context spent on unused tool descriptions and a duplicated page tree is capacity denied to the reasoning the user is paying for.

**Independent Test**: Intercept the provider endpoint, run the analysis against fixture pages before and after, and compare the recorded request bodies. Requires no provider account — the request is observable at the point it would be sent.

**Acceptance Scenarios**:

1. **Given** a fixed set of target pages, **When** they are analysed after the change, **Then** median prompt tokens per page fall by at least the threshold derived from the recorded baseline
2. **Given** the same run, **When** the report is compared with the baseline, **Then** every page that completed before completes now
3. **Given** a run after the change, **When** the model is called, **Then** it is offered only tools the analysis can act on at that point, and no others
4. **Given** the browser server exposes tools this product does not use, **When** the tool surface is assembled, **Then** those tools are absent from the conversation entirely rather than merely unmentioned in the prompt

---

### User Story 3 - The analysis follows its sequence because it cannot do otherwise (Priority: P2)

Navigation happens before capture, and capture before analysis, because at each point that is what is available — not because the prompt asked politely and the system nudged when it was ignored.

**Why this priority**: Below P1 because the current arrangement usually works. It earns its place because the fallback for when it does not work is a reminder message injected into the conversation, which costs tokens precisely when the context is already in trouble, and because a sequence enforced by what is offered cannot be skipped by a model that stops early.

**Independent Test**: Script the intercepted provider to reply out of order, or to stop early, and confirm from the recorded requests that the out-of-order tool was never offered and that no reminder text was appended.

**Acceptance Scenarios**:

1. **Given** a model that would call tools out of order, **When** the analysis runs, **Then** the out-of-order call is not available to it
2. **Given** a model that stops without finishing, **When** the loop continues, **Then** no reminder message is appended to the conversation
3. **Given** navigation that failed, **When** the next step is prepared, **Then** the analysis does not proceed to capture and record a blank page as analysed

---

### Edge Cases

- **The capture tool is called more than once.** A page may be re-captured after an interaction. The record should reflect the last successful capture rather than the first, and must not accumulate copies.
- **The capture tool returns an error.** An error result is not a snapshot and must not be recorded as one.
- **A page produces an enormous structure.** Reducing tokens must never be achieved by silently shortening what is recorded; if a limit is ever needed, it belongs to a later decision and must be visible in the report.
- **A tool the analysis relies on disappears from the browser server.** Narrowing the exposed surface must fail loudly at startup rather than leaving the model without a tool the prompt tells it to call.
- **The model calls a tool that was filtered out.** It should be impossible; if it happens, the run must not silently proceed as though the call succeeded.
- **Zero findings.** A cheaper context must not change what counts as a complete analysis.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The page structure snapshot MUST be recorded by the system directly from the browser's output, without passing through the model.
- **FR-002**: The recorded snapshot MUST be byte-identical to what the browser returned.
- **FR-003**: The model MUST NOT be given any means of supplying the snapshot, and the analysis instructions MUST NOT ask it to.
- **FR-004**: A failed or error capture MUST NOT be recorded as a snapshot.
- **FR-005**: When a page's structure was never captured, the page's recorded status MUST make that visible rather than presenting the page as fully analysed.
- **FR-006**: Only tools the analysis can act on MUST be present in the conversation; every other tool the browser server offers MUST be absent from it.
- **FR-007**: The set of tools offered MUST vary with the stage the analysis has reached, so that a stage's inapplicable tools are unavailable rather than merely discouraged.
- **FR-008**: The system MUST NOT append reminder or re-prompting text to the conversation to recover from the model deviating from the expected sequence.
- **FR-009**: When navigation has not succeeded, the analysis MUST NOT proceed to capture and record the result as an analysed page.
- **FR-010**: If a tool the analysis depends on is not offered by the browser server, the run MUST fail with a message naming the missing tool, rather than proceeding.
- **FR-011**: Reducing context MUST NOT change which findings a page is capable of producing, the report's structure, or the meaning of any recorded status.
- **FR-012**: The reduction achieved MUST be measured against a baseline captured before the change on the same fixture pages, recorded, and reproducible without credentials or network access.

### Key Entities

- **Captured snapshot**: The page structure as the browser produced it, recorded verbatim against the page being analysed. Has one source — the browser — and one writer: the system, never the model.
- **Offered tool set**: The tools present in a given model call. Derived from what the analysis needs at that stage, not from what the browser server happens to provide.
- **Analysis stage**: Where a page's analysis has reached — not yet loaded, loaded but not captured, or ready to be judged. Determines the offered tool set, and is what makes the sequence structural rather than requested.

## Success Criteria *(mandatory)*

### Measurable Outcomes

Every criterion below except SC-009 is **measured without a language model provider account**, by intercepting the provider's HTTP endpoint and reading the request the system actually sends. That is measurable end to end — through the real provider client, the real serialisation, the real request body — so what is counted is what would have gone over the wire rather than an approximation taken further up the stack. It costs nothing, needs no credential beyond a placeholder, and runs in CI on every commit. Criteria that genuinely need a live model are separated out and labelled, because a criterion CI cannot enforce is a criterion that stops being checked.

**Deterministic — enforceable on every run of the test suite**

- **SC-001**: 100% of recorded snapshots are byte-identical to what the browser returned, verified across structures of varying size including one exceeding 100 KB.
- **SC-002**: **Total** request bytes per analysed page fall by at least 40% against the recorded baseline, measured from the intercepted request bodies, on the same fixture pages. Total rather than median because it is what a run actually pays, and because removing a round trip changes how many requests there are — comparing medians across different request counts compares different statistics.
- **SC-003**: The page structure appears at most once in any request body, at any point in the analysis.
- **SC-004**: The tool definitions carried in a request never exceed those the analysis can act on at that stage, verified for every stage from the intercepted bodies.
- **SC-005**: No request body in any run contains system-authored reminder text.
- **SC-006**: A scripted analysis driven end to end against an intercepted provider — navigate, capture, findings, complete — reaches the same per-page status after the change as before.
- **SC-007**: A run whose browser server lacks a required tool fails within 5 seconds, naming the tool, and spends no model tokens.
- **SC-008**: The measurement that produces SC-002 is reproducible: two runs of it on the same commit yield identical numbers.

**Live — checked before release, not in CI**

- **SC-009**: Against real targets and a real model, median findings per page stays within 20% of the same measurement taken before the change, so a cheaper context is not quietly a weaker analysis. This is the one question a mock cannot answer, because it is about what the model does with what it is given rather than about what it is given.

## Assumptions

- **Verification happens at the transport boundary, against an intercepted provider endpoint.** The analysis runs end to end — real provider client, real serialisation, real request bodies — with the HTTP call intercepted and scripted rather than sent. This measures what would actually have gone over the wire, and it drives multi-turn flows deterministically. This project already intercepts HTTP this way for its authentication tests, so the approach and its tooling are established here rather than introduced.
- **The baseline is a committed number, produced by that harness, not a field measurement.** It is captured on current `main` before any change and it is this feature's first task — but it needs no provider account, no live targets and no network. Any contributor can reproduce it on any machine and get the same answer, which is what SC-008 exists to hold.
- **Tying context measurement to live runs would have been a design error.** An earlier draft of this spec made the token criteria depend on real analyses against real targets, inheriting the shape of 005's baseline. That was wrong. 005 needed live runs because it asked whether a *browser engine swap* preserved behaviour, which only a real browser and a real model can answer. This feature asks what the system puts into a request, which is knowable before the request is sent. A criterion that needs a credential is one CI cannot enforce, and one that only runs by hand is one that stops running.
- **40% is a floor, not a forecast.** The two changes remove a duplicated page structure from every subsequent turn and roughly twenty-seven unused tool descriptions from every call, so the reduction should exceed this comfortably. The number is set where it is because a threshold that only an exceptional run can clear invites the threshold to be lowered later rather than met.
- **The model still sees the snapshot.** Removing the round trip removes the model's *re-emission* of the tree, not its sight of it. The analysis still reasons over the page structure; it simply stops dictating it back.
- **Trimming the snapshot before the model sees it is out of scope.** The roadmap raises injecting only relevant regions of very large trees. That trades fidelity for size and needs its own evidence about what analysis quality costs. This feature only stops paying for the same text twice.
- **Which filtering layer is used is a planning decision, not a requirement.** The requirement is that unused tools are absent. As of the pinned browser server, both a client-side selection and server-side category switches exist. The server-side performance category is the one 007 depends on, so any use of server-side filtering must not disable it — recorded here so the two features do not collide.
- **The manual analysis loop stays.** Replacing it with the SDK's own agent loop is 008. This feature changes what each call is given, not who drives the calls.
- **Deterministic audit tooling is out of scope.** 007 adds it. This feature makes room for it.
