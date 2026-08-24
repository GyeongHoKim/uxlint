# Feature Specification: SDK Agent Loop

**Feature Branch**: `008-sdk-agent-loop`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "sdk-agent-loop — Delegate the hand-rolled agent loop in `AIService` to the toolkit's built-in loop control: declarative stop conditions, per-step tool exposure, a per-page time bound, and run-scoped state replacing the global accumulator (roadmap Phase 4 + Phase 0.3, diagnosis D4)."

## Context

uxlint's page analysis is driven by a hand-written loop: count iterations up to
twenty, call the model once per iteration, inspect what came back with a
three-valued classifier (`continue` / `stop` / `completed`), and nudge the
model with reminder messages when it forgets to finish. A comment on that loop
states outright that one of its assumptions is *load-bearing* — the code only
works because the underlying model call is deliberately prevented from ever
doing more than one step. The project maintains, by hand and by prose, machinery
its own toolkit now ships as a primitive.

Four costs follow:

1. **Correctness lives in comments.** The accumulated-across-steps trap is
   documented in words, not prevented by construction. Whoever refactors
   without rereading the paragraph reintroduces the defect — the exact shape
   007's review caught elsewhere ("the feature reintroduced its own flaw").
2. **Progress is blind.** The interface only sees iteration boundaries. Between
   them the user watches randomly rotating filler messages, because the loop
   cannot say what is actually happening.
3. **Nothing bounds a page in time.** One hung model call stalls the entire
   run; in CI, the job hangs until an external timeout kills it with no report
   at all (diagnosed before 006, partially patched by 007 for measurements
   only — the model calls themselves are still unbounded).
4. **Report state is global.** A single module-level accumulator is shared by
   everything. It is the root cause of an already-shipped bug class (one
   failing page erased every previously analysed page) and the standing
   obstacle to ever analysing pages concurrently.

This feature delegates the loop to the toolkit's native agent control and, in
the same motion, removes all four. It is deliberately **behaviour-preserving**:
the reports users receive do not change; the machinery producing them does.

Two properties are already known to be traps, recorded by 007, and are part of
this feature's definition of done:

- Handing a cancellation token to a call is **not** a bound. If the called
  party ignores the signal, the wait simply continues. The bound must live in
  a timer the run owns, raced against the work — not delegated to the work.
- A timer that only fires while other work keeps the process alive is **not**
  a timer. The standard shortcut (built on unref'd timers) has been observed,
  outside test runners, to never fire at all. Whatever mechanism carries the
  page bound must be demonstrated to fire when the bounded call is the only
  pending work in the process.

## Target Personas

Two people feel this feature (Constitution III):

- **The CI operator whose pipeline hung.** They pushed a commit, the UX check
  never came back, and the job died at some external timeout with neither
  report nor log. They need a run that ends on its own, marks the stuck page
  honestly, and lets the remaining pages produce evidence.
- **The developer running uxlint interactively.** They watch the terminal and
  currently see a slot-machine of reassuring sentences while the analysis does
  something unseen. They need to see the actual work — which tool is running,
  what is being measured — to trust that anything is happening at all.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Same reports, different engine (Priority: P1)

A developer upgrades uxlint and runs it exactly as before. Every report they
could have received yesterday they still receive today, unchanged: complete
pages complete, budget-exhausted pages stay partial, failed navigations stay
partial with the completion escape hatch intact, failing pages are recorded as
failed without destroying earlier pages, and the sequence navigate → capture →
judge remains structurally enforced (an unloaded page is never offered a
capture tool). Additionally, two analyses run back-to-back in one session no
longer share hidden state with each other.

**Why this priority**: This is the contract that makes the rest shippable. The
feature's entire justification is deleting hand-maintained machinery; if
observable behaviour moves, the swap is a regression, not a refactor. Nothing
else in this feature can ship safely before this holds.

**Independent Test**: Drive one full analysis with a scripted
model-and-browser fixture (intercept outgoing requests, replay canned responses
— the same technique as the existing context-budget harness) and compare the
rendered markdown report, page statuses, and finding sets against the pre-swap
output for the identical script. Then run the same analysis twice in one
session and confirm the second result equals a fresh single run.

**Acceptance Scenarios**:

1. **Given** the scripted happy path (navigation succeeds, capture returns
   content, findings recorded, completion invoked), **When** the page is
   analysed, **Then** the rendered report is identical to the pre-swap run of
   the same script, including the page's `complete` status.
2. **Given** a script that exhausts the step budget without ever invoking
   completion, **When** the page is analysed, **Then** it is recorded
   `partial`, indistinguishably from today's behaviour.
3. **Given** a script whose navigation fails, **When** the page is analysed,
   **Then** no capture tool is ever offered, completion remains available as
   the exit, and the page closes `partial`.
4. **Given** a script that issues the completion call and a capture in the
   same response, **When** the page is analysed, **Then** every observation
   from that response is applied before the close-out decision — the snapshot
   is not dropped and the page is not marked `partial` for a capture that did
   happen, regardless of the order the executions resolved in.
5. **Given** two consecutive full analyses in one session, **When** the second
   finishes, **Then** its report equals a fresh single run's report — no
   findings, notes, pages, or capture state leak from the first into the
   second.

---

### User Story 2 - One stuck page cannot stall the run (Priority: P2)

The CI operator points uxlint at ten pages. On page seven the model provider
stalls indefinitely. Instead of hanging until an external job timeout kills
everything, the run abandons page seven when the page's time bound expires,
records it as `partial` with the expiry named as the reason, and continues
with pages eight through ten, producing a report.

**Why this priority**: Today the failure mode is total — one hung call turns a
bounded CI job into an externally killed one with no report whatsoever. This
story is the feature's user-visible reliability win and absorbs the
long-standing gap diagnosed alongside the original roadmap. It builds on P1
(a well-defined page lifecycle must exist to close out) but is independently
demonstrable with a fixture that simply never answers.

**Independent Test**: Run an analysis whose scripted model call never
resolves. Confirm the affected page closes within its bound (plus a small
fixed margin), the rendered report marks that page `partial` and states the
cause, later pages still appear in the report, and the overall run terminates
by itself.

**Acceptance Scenarios**:

1. **Given** a page whose model call never returns, **When** the page's bound
   expires, **Then** the page is recorded `partial` with the expiry as its
   recorded reason and the run proceeds to the remaining pages.
2. **Given** the bound expires while a tool execution (rather than a model
   call) is in flight, **When** expiry fires, **Then** the same close-out
   applies — the bound covers the whole page, not only the model's thinking.
3. **Given** every wrapped call ignores cancellation, **When** the bound
   expires, **Then** the run still stops waiting at the bound — holding it
   does not depend on the stalled party cooperating.
4. **Given** the bounded page is the only pending work the process has left,
   **When** the bound expires, **Then** it actually fires — demonstrated in a
   plain process, outside a test runner, where timer shortcuts are known to
   silently never fire.
5. **Given** a healthy scripted page that takes seconds, **When** analysed
   under the default bound, **Then** the bound never fires — the default
   leaves wide headroom over measured healthy page durations.

---

### User Story 3 - The terminal shows the work, not a roulette of reassurances (Priority: P3)

The developer running interactively watches the analysis happen: navigation
started, snapshot captured, findings recorded, audit measuring. Activity labels
come from lifecycle events the engine emits as tools start and finish, not
from a list of comforting sentences chosen at random. The filler pool survives
only where genuinely no activity exists (startup, report writing).

**Why this priority**: Quality-of-life, and the natural payoff of delegation —
the engine already knows when each piece of work starts and ends; today's
filler exists precisely because the hand-rolled loop hides that information.
Ships last; nothing depends on it.

**Independent Test**: Render the interactive progress display against a
scripted analysis and assert that, for each executed step, at least one genuine
activity label appears while it runs, and that no random filler message is
shown during active work.

**Acceptance Scenarios**:

1. **Given** a scripted analysis executing several steps, **When** watched in
   the interactive interface, **Then** each step surfaces at least one
   concrete activity (tool or measurement name) while it runs.
2. **Given** a tool execution in flight, **When** the display renders, **Then**
   it names that work rather than showing a randomly selected waiting message.
3. **Given** the analysis reaches its measurement phase, **When** the display
   renders, **Then** the distinct measurement-phase presentation introduced by
   the previous feature is preserved.

---

### Edge Cases

- What happens when the model invokes completion at the very first step, with
  nothing captured? The page closes `partial` (existing rule), now expressed
  as a stop condition rather than a classifier return value.
- What happens when the completion call and the bound expiry race? The page
  closes exactly once. If completion was signalled before expiry is
  processed, status follows the evidence rule (`complete` only with a
  successful capture); otherwise the page closes `partial` with the expiry as
  its reason. Either way there is one close-out, not two.
- What happens when the page bound is shorter than a measurement's own bound?
  The page bound dominates; whichever elapses first closes the page with its
  respective reason. Normal configuration keeps the page bound far above the
  measurement bound.
- What happens when a previous analysis closed its connections and a new
  analysis starts afterwards? The new analysis must not attempt to reuse the
  closed resources (this is the root fix of an already-patched bug; the patch
  must become unnecessary by construction).
- What happens to commentary inserted between steps? It must remain positioned
  after the assistant/tool exchange it comments on, never inside one — a
  transcript with a remark wedged between a tool call and its result is
  malformed and rejected by some providers.
- What happens when a tool execution outlives its own page — the bound expired
  and the run moved on while the abandoned engine call was still finishing?
  Observations arriving from an expired page's engine call are **discarded**
  after that page's close-out. They belong to a page that is already recorded;
  applying them would write one page's evidence into another's record within
  the same run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The page analysis MUST be driven by the toolkit's native
  multi-step loop control; a hand-maintained iteration counter with a
  deliberate one-step-per-call workaround MUST NOT remain on the analysis
  path.
- **FR-002**: Ending conditions MUST be declarative: (a) a maximum-step cap
  equivalent to today's twenty iterations, and (b) a condition satisfied by
  the model invoking the completion tool. The internal three-valued result
  classifier MUST be removed, its responsibilities subsumed by these
  conditions.
- **FR-003**: Per-step tool exposure MUST continue to be governed by the
  observed-evidence stage machine (unloaded → loaded → analysable); each
  request presents only the current stage's tools, with the completion tool
  available at every stage.
- **FR-004**: Stage advancement MUST depend solely on observed tool outcomes
  (success, failure, and emptiness rules preserved), never on the model
  asserting it did something.
- **FR-005**: Page status semantics MUST be preserved: `complete` requires the
  completion call AND a successful capture; a page whose structure was never
  captured, whose step budget was exhausted, or whose time bound expired is
  recorded `partial`; a page whose analysis raises is recorded failed with its
  error, as today, without discarding previously analysed pages.
- **FR-006**: All tool observations from a step MUST be applied before the
  page's close-out decision; the outcome MUST NOT depend on the order
  concurrent tool executions happened to resolve in.
- **FR-007**: Each page analysis MUST enforce a configurable page bound,
  enabled by default and configured through the `.uxlintrc` key
  `analysis.pageTimeLimitMs` (positive integer milliseconds). The provisional
  default is generous relative to measured healthy page durations; the shipped
  value is calibrated from baseline timing data during planning. On expiry the
  page closes `partial` with the expiry recorded as its reason, and the run
  continues with the remaining pages.
- **FR-008**: The bound MUST be owned by the run itself: the mechanism MUST
  fire even when every wrapped call ignores cancellation, and MUST fire even
  when the bounded call is the only pending work in the process. Both
  properties MUST be demonstrated during planning research before the
  mechanism is chosen.
- **FR-009**: Report accumulation state MUST be scoped to a single analysis
  run instance; no module-level mutable accumulator MAY remain on the analysis
  path. Consecutive analyses in one process session MUST be fully isolated.
- **FR-010**: The contract consumed by both frontends — the interactive hook
  and the CI runner — MUST be preserved: progress event vocabulary, returned
  per-page analysis shape, and failure recording behaviour unchanged.
- **FR-011**: Commentary injected into the conversation between steps (such as
  the measurement digest) MUST remain positioned after the exchange it
  comments on, never inside it.
- **FR-012**: While a step's work is active, the interactive display MUST
  surface the actual activity (executing tool or running measurement), sourced
  from work-lifecycle events; randomly rotating filler messages MUST NOT be
  shown while such activity is being reported. Filler remains acceptable only
  where no activity exists to report.

### Key Entities *(include if feature involves data)*

- **Analysis Run**: one execution of the analysis over a configuration. Owns
  its report accumulation, its connections, and its clocks. Previously an
  implicit global, now an explicit boundary — the unit of isolation between
  consecutive runs and the future unit of concurrency.
- **Page Analysis**: unchanged shape and statuses; gains one new possible
  close-out path (bound expiry) recorded through the same channel as existing
  failure reasons.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a fixed scripted interaction suite, the post-swap rendered
  markdown reports are byte-identical to pre-swap ones across four canonical
  cases: happy path, step-budget exhaustion, failed navigation, and mid-run
  page failure. Verification reads rendered output, not internal objects.
- **SC-002**: The existing mock-based language-model test suite passes with
  mechanical adaptations only — no behavioural assertion removed — and grows
  by cases for the declarative stop conditions, bound expiry, and run
  isolation described above.
- **SC-003**: With a never-answering fixture, the affected page closes at its
  bound within a small fixed margin (bound + 5 seconds wall clock) even though
  every wrapped call hangs forever, and the full run terminates by itself.
- **SC-004**: Baseline timing data gathered during planning shows the shipped
  default bound leaves at least 10× headroom over observed healthy page
  durations, so ordinary pages never trip it.
- **SC-005**: In the interactive display, every executed step produces at
  least one genuine activity label while it runs, and zero filler messages
  appear during active work.
- **SC-006**: Per-page request bytes for the identical scripted interaction
  are unchanged versus pre-swap measurement within ±1% — the context budgets
  established by the two preceding features are not disturbed by the engine
  swap.
- **SC-007**: Coverage enforcement is active for the analysis path this feature
  comprises — the aggregate of the modules it touches (agent service, report
  builder, measurement, deadline helper, config models, stage machine, tool
  output) reports at least the mandated 80% on every metric and exits nonzero
  below it. Repository-wide enforcement stays off: enabling it today fails the
  build at 74.98% lines, the known debt of diagnosis D18 whose principal cause
  is untested UI components — closing that is its own work, not this feature's.

## Amended during planning — 2026-08-24

- SC-007 was rewritten from "repository-wide threshold check enabled". The
  original was unachievable without first closing D18 (the c8 block declared
  80% on every metric since before 004 while `test:coverage` never passed
  `--check-coverage`, so the number was aspirational). Measured reality:
  branches 82.29% pass; lines/functions/statements fail at ~75%/72%. Per the
  007 precedent (assert the bar where this feature's work lands), enforcement
  now gates exactly the files this feature touches.

## Assumptions

- The installed toolkit version ships the loop-control primitives this feature
  delegates to; export presence was already confirmed against the pinned
  version during roadmap research and will be re-verified in planning.
- Provisional default page bound: 600 seconds per page. This number is a
  placeholder for calibration, not a commitment — the shipped default comes
  from SC-004's baseline data (Constitution IV: no evidence-free constants).
- Parallel page analysis remains out of scope (separate planned feature). This
  feature removes the shared-state obstacle; it does not exploit it.
- The random waiting-message pool remains ONLY for phases where the engine
  emits no activity events; the exhaustive list is startup and report writing.
- The page bound is exposed as the `.uxlintrc` key `analysis.pageTimeLimitMs`
  (positive integer milliseconds), nested under `analysis` so future per-run
  settings share one section.
- Scope boundary: no change to prompts, tool schemas, measurement logic,
  report format, thresholds, or gate behaviour. Everything a user could
  observe in a report or exit code is frozen by SC-001.
