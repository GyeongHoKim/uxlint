---
description: 'Task list for 010-inverted-delegation'
---

# Tasks: Host-Neutral Inverted Delegation

**Input**: Design documents from `/specs/010-inverted-delegation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included and **not optional**. Constitution principle II makes
Test-First Development non-negotiable in this project: tests are written first,
must fail (red), and only then is the implementation written. Every phase below
therefore opens with its red tests.

**Organization**: Grouped by user story so each can be implemented, tested and
delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task serves (US1, US2, US3)
- Every task names the file it touches

## Path Conventions

Single project. Source under `source/`, tests under `tests/`, both at the
repository root, per [plan.md](./plan.md). Ava runs against the compiled `dist/`
output, so `npm run build` precedes any test run.

---

## Phase 1: Setup

**Purpose**: The seams every later phase writes into.

- [X] T001 Add the `delegate` verb group to the usage text and argument parsing in `source/cli.tsx`, recognising `capture`, `evidence`, `submit`, `runs` and `discard` and rejecting an unknown verb by name, with every verb still unimplemented
- [X] T002 [P] Create `source/delegate/driven/` and `tests/delegate/driven/` with the package documentation header the other delegate modules carry, stating that this directory holds the route where the agent drives

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: What every verb needs, plus the two properties that have to hold from
the first module rather than be retrofitted. No user story work can begin until
these are done.

**⚠️ CRITICAL**: T003–T011 block Phase 3 onwards.

### Tests first

- [X] T003 [P] Red test in `tests/delegate/stdout-discipline.spec.ts`: a structured payload writer exists in `source/infrastructure/console-output.ts`, it is the only other module member permitted to touch stdout, and it remains unreachable from `source/delegate/mcp-server.ts` — the judgement server's stdout carries JSON-RPC and must not gain a second writer
- [X] T004 [P] Red test in `tests/delegate/session.spec.ts`: a run created by one process is loadable by identity in another, is **not** removed when the creating process exits, and reports when the identity names no run (FR-013, data-model "Review run")
- [X] T005 [P] Red test in `tests/delegate/driven/prune.spec.ts`: runs older than the retention window are swept, runs inside it are left alone, and a sweep that cannot remove a directory does not fail the command (FR-014, research R4)
- [X] T006 [P] Red test in `tests/delegate/session.spec.ts`: page judgement state derived from a run's submission log reproduces the launcher route's transitions and refusals exactly — an unopened page, a late submission after the page was finished, and an unknown page all refused with the same messages (FR-009, data-model "Page judgement state")
- [X] T007 [P] Red test in `tests/delegate/driven/host-neutrality.spec.ts`: no module under `source/delegate/driven/` reaches `source/delegate/host/`, proved by walking relative imports the way `tests/delegate/stdout-discipline.spec.ts` walks them. Host neutrality is the feature's central claim and would otherwise hold only because nobody has written host-specific code yet — which is how 009 came to assert a Cursor posture that had never been exercised (FR-016)

### Implementation

- [X] T008 Add the structured payload writer to `source/infrastructure/console-output.ts` as a second named function, documenting why the existing terminating-message exception was not widened (plan Complexity Tracking)
- [X] T009 Extend `source/delegate/session.ts` so a run survives the process that created it: remove disposal from the creating path, keep `dispose` for explicit removal, and add loading by identity with the "no run here" failure
- [X] T010 [P] Implement age-based sweeping in `source/delegate/driven/runs.ts`, with the 24-hour retention window research R4 settled
- [X] T011 Derive `PageJudgementTracker` state from a run's submission log in `source/delegate/session.ts`, so the state machine has one implementation across both routes rather than one in memory and one on disk

**Checkpoint**: The run outlives its process, stdout has a second disciplined
writer, and page state is reconstructible. User story work can begin.

---

## Phase 3: User Story 1 — A review run from inside the agent (Priority: P1) 🎯 MVP

**Goal**: A developer inside any coding agent completes a UX review with no model
provider credential, through `capture` → `evidence` → `submit`.

**Independent Test**: With `UXLINT_AI_API_KEY` unset, run the three verbs by hand
with no agent present and confirm a report appears carrying both measured and
judgement findings. Quickstart Scenario 1.

### Tests first

- [ ] T012 [P] [US1] Red test in `tests/delegate/driven/capture.spec.ts`: with an injected browser client, `capture` captures and measures every configured page, creates the run, and emits the run identity and per-page result on stdout and nothing else (FR-001, FR-003)
- [ ] T013 [P] [US1] Red test in `tests/delegate/driven/capture.spec.ts`: `capture` reads no model provider credential, asserted by spying on the credential reader the way `tests/services/ai-service.spec.ts` already does for the launcher route (FR-001, SC-001)
- [ ] T014 [P] [US1] Red test in `tests/delegate/driven/evidence.spec.ts`: `evidence` returns every page's features, persona, captured structure and measurement description from an existing run, opens no browser, and serves a failed page with its reason rather than withholding it (FR-002, FR-004)
- [ ] T015 [P] [US1] Red test in `tests/delegate/driven/evidence.spec.ts`: `evidence --page` serves one page without re-capturing, and a page outside the run is refused with the run's pages named (FR-005, FR-008)
- [ ] T016 [P] [US1] Red test in `tests/delegate/driven/submission-document.spec.ts`: the judgement document schema accepts the shape in `contracts/submission.md`, and refuses `origin`, `ruleId` and `affectedElements` by name, a second measurement note for a page, and a malformed document (FR-007, FR-010, SC-004)
- [ ] T017 [P] [US1] Red test in `tests/delegate/driven/submit.spec.ts`: every accepted finding reaches the report carrying an origin uxlint assigned, and no path through `submit` constructs a finding itself — the document is split and handed to the existing intake (FR-007, research R6)
- [ ] T018 [P] [US1] Red test in `tests/delegate/driven/submit.spec.ts`: a document mixing one refused finding with good ones has the good ones accepted and the bad one refused by name, and the report contains exactly the accepted ones (contracts/submission.md "Partial acceptance")
- [ ] T019 [P] [US1] Red test in `tests/delegate/driven/submit.spec.ts`: `submit` writes the report at the configured output path and reports the gate verdict with the existing exit semantics, on every call rather than only a final one (FR-006, research R2)
- [ ] T020 [P] [US1] Red test in `tests/delegate/driven/skill.spec.ts`: every flag and verb named in `skills/uxlint-review/SKILL.md` exists in the CLI surface — a skill naming a flag uxlint does not have fails at the agent's first attempt, and nothing else would catch that drift
- [ ] T021 [P] [US1] Red test in `tests/delegate/repo-untouched.spec.ts`: running every verb leaves the working tree exactly as it found it, untracked files included, except the report at the configured output path. This route touches the filesystem more than the launcher route does — it creates runs, sweeps directories and writes across separate invocations — so the guarantee 009 asserts for one route has to be asserted for this one too (FR-015)

### Implementation

- [ ] T022 [US1] Factor the capture pass out of `source/delegate/runner.ts` into a function both routes call, leaving the launcher route's behaviour unchanged
- [ ] T023 [US1] Implement `capture` in `source/delegate/driven/capture.ts`: preflight, the shared capture pass, run creation, the age sweep from T010, and the payload on stdout (depends on T008, T009, T010, T022)
- [ ] T024 [P] [US1] Implement `evidence` in `source/delegate/driven/evidence.ts`, serving one page or all and marking pages open through the shared tracker (depends on T011)
- [ ] T025 [P] [US1] Add the judgement document schema to `source/models/delegate.ts`, strict, reusing `judgementFindingSchema` for each finding so the two routes cannot diverge
- [ ] T026 [US1] Implement `submit` in `source/delegate/driven/submit.ts`: decompose the document, hand each submission to `validateFinding`, record accepted ones, then assemble the report and report the gate verdict (depends on T025, T011)
- [ ] T027 [US1] Wire `capture`, `evidence` and `submit` into the verb group in `source/cli.tsx`, keeping Ink unrendered on all three because the caller is a program
- [ ] T028 [US1] Write `skills/uxlint-review/SKILL.md` with the frontmatter convention research R1 verified, giving the agent the verb sequence exactly as `contracts/cli-surface.md` defines it (FR-017, SC-005)

**Checkpoint**: The feature works end to end without any agent present. This is the
MVP and Quickstart Scenarios 1–3 should pass.

---

## Phase 4: User Story 2 — Cursor becomes usable, the launcher stops pretending (Priority: P2)

**Goal**: Cursor Agent users have a route that works, and the launcher no longer
offers one that cannot.

**Independent Test**: Ask for the Cursor launcher route and confirm the developer is
pointed at the skill route before any browser opens; then complete a review with
Cursor driving. Quickstart Scenarios 8 and 9 step 3.

### Tests first

- [ ] T029 [P] [US2] Red test in `tests/delegate/host/selection.spec.ts`: requesting `cursor-agent` stops before a browser is started and names the skill route, and the identifier is still accepted rather than reported as unsupported (FR-019)
- [ ] T030 [P] [US2] Red test in `tests/delegate/host/selection.spec.ts`: `claude-code` and `codex` selection is unchanged, including Codex's signed-out probe (FR-018)

### Implementation

- [ ] T031 [US2] Remove `source/delegate/host/cursor-agent.ts` and drop it from the registry in `source/delegate/host/index.ts`, replacing it with the signpost branch
- [ ] T032 [US2] Remove the `cursor-agent` entry from `readOnlyPosture` in `source/delegate/host/types.ts`, since it asserted a guarantee the live run disproved
- [ ] T033 [P] [US2] Remove the Cursor launcher specs `tests/delegate/host/cursor-agent.spec.ts` and the Cursor cases in `tests/delegate/host/fake-binaries.spec.ts`, which encode documentation that has since been falsified
- [ ] T034 [P] [US2] Remove the fake `agent` argument parsing from `tests/fixtures/fake-hosts/argv.ts` and its host id from the fake host harness
- [ ] T035 [US2] Update `README.md`: state which route applies to each agent and why, replace the Cursor `~/.cursor/mcp.json` registration section with the skill install step, and give the install path for all three agents from research R1 (FR-017, FR-020)

**Checkpoint**: No supported combination fails silently, and no test asserts a
posture that does not hold.

---

## Phase 5: User Story 3 — A judgement that stops early still reports honestly (Priority: P3)

**Goal**: Pages nobody judged are recorded as unjudged, and an abandoned run is
discoverable rather than accumulating unmentioned.

**Independent Test**: Judge three of five pages, assemble the report, and confirm
the other two are partial with a reason; then find and remove the run. Quickstart
Scenario 4.

### Tests first

- [ ] T036 [P] [US3] Red test in `tests/delegate/driven/submit.spec.ts`: with judgement for three of five pages, the report records the other two as partial with a reason, and a page an agent marked finished having submitted nothing is recorded as judged-and-empty rather than clean (FR-011, SC-007)
- [ ] T037 [P] [US3] Red test in `tests/delegate/driven/runs.spec.ts`: `runs` lists each run with its identity, capture time, configuration, page count and judged count, and exits 0 when there are none (FR-014)
- [ ] T038 [P] [US3] Red test in `tests/delegate/driven/runs.spec.ts`: `discard` removes a run and exits 0 on a second call for the same identity, because a cleanup command that fails on a second call is one a developer stops trusting
- [ ] T039 [P] [US3] Red test in `tests/delegate/driven/concurrency.spec.ts`: two runs captured from different configurations stay separate, and judgement submitted against the wrong identity is refused naming that run's pages without touching the other report (FR-012)

### Implementation

- [ ] T040 [US3] Record unjudged pages as partial with a reason in `source/delegate/driven/submit.ts`, reusing the launcher route's page status rules rather than restating them (depends on T026)
- [ ] T041 [P] [US3] Implement `runs` and `discard` in `source/delegate/driven/runs.ts` (depends on T010)
- [ ] T042 [US3] Wire `runs` and `discard` into the verb group in `source/cli.tsx`

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T043 Final confirmation that the quality gates pass in order — `npm run compile`, `npm run format`, `npm run lint` — with zero errors and zero new violations. This confirms, it does not substitute: constitution principle I requires the same sequence after **every** code change, so each implementation task above runs it too (Constitution I)
- [ ] T044 Confirm coverage stays at or above 80% via `npm run test:coverage` (Constitution II)
- [ ] T045 [P] Record the three open measurements in `quickstart.md`: per-page `capture` time against the launcher route's 8 s, per-verb scaffolding cost against 009's 1.6–2.0 ms, and evidence payload size per page (SC-006, Constitution IV, research open items)
- [ ] T046 [P] Update `specs/009-delegate-mode/contracts/cli-surface.md` and `research.md` to point at this feature for Cursor Agent, so the falsified claims there carry their resolution
- [ ] T047 Run Quickstart Scenario 6 live with Claude Code driving, and record the result
- [ ] T048 Run Quickstart Scenario 7 live with Codex driving, and record the result
- [ ] T049 Run Quickstart Scenario 8 live with Cursor Agent driving, and record the result — this is the scenario the feature exists for and the one that has never passed (SC-002)
- [ ] T050 Run Quickstart Scenario 9 live: both launcher hosts still complete, and the measured half of a launcher-route report is identical to an inverted-route report for the same configuration (SC-003, FR-018)

**⚠️ T047–T050 are not a formality.** In 009 every adapter passed every test and
one of them had never worked in a real run. Tests built on assumptions cannot
catch a false assumption; only these can.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks every user story**
- **US1 (Phase 3)**: depends on Phase 2. The MVP
- **US2 (Phase 4)**: depends on Phase 2. Independent of US1 in code, but its README task (T035) documents the skill US1 produces, so finish T028 before T035
- **US3 (Phase 5)**: depends on Phase 2, and T040 depends on US1's T026
- **Polish (Phase 6)**: depends on whichever stories are being delivered

### Within each story

- Red tests first, and they must fail before implementation — non-negotiable
- Schemas before the verbs that use them
- Verbs before their CLI wiring
- No story's tests may depend on another story's implementation

### Parallel opportunities

- T003–T007 are five separate test files and can be written together
- T012–T021 are US1's red tests across six files and can be written together
- T024 and T025 touch different files and can proceed together once T011 lands
- T033 and T034 are removals in different files
- US2's code tasks (T031–T034) are independent of US1 entirely and can run alongside Phase 3 if staffed
- T047–T049 are three separate live runs and can be done in any order

---

## Parallel Example: User Story 1 red tests

```bash
# Six test files, no shared state — write them together, then watch all fail:
Task: "capture: pages captured, run created, payload on stdout, no credential read — tests/delegate/driven/capture.spec.ts"
Task: "evidence: whole run and single page, no browser — tests/delegate/driven/evidence.spec.ts"
Task: "submission document: strict schema, provenance refused — tests/delegate/driven/submission-document.spec.ts"
Task: "submit: one intake, partial acceptance, report and verdict — tests/delegate/driven/submit.spec.ts"
Task: "skill: every flag it names exists in the CLI — tests/delegate/driven/skill.spec.ts"
Task: "repository untouched by every verb — tests/delegate/repo-untouched.spec.ts"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1: Setup
2. Phase 2: Foundational — blocks everything, do not skip
3. Phase 3: User Story 1
4. **Stop and validate**: Quickstart Scenarios 1–3 pass with no agent present
5. At this point the feature is usable by any agent, including Cursor, even before
   Phase 4 removes the broken launcher adapter

### Incremental delivery

1. Setup + Foundational → the run outlives its process
2. US1 → the route works end to end → **MVP**
3. US2 → no combination fails silently, and the docs match reality
4. US3 → abandoned reviews are honest and discoverable
5. Polish → measurements recorded, and the three live runs done

### Notes

- `[P]` means different files and no dependency on an incomplete task
- Ava runs against `dist/`, so `npm run build` before any test run
- Commit after each task or logical group, following the repository's conventional
  commit style
- The stdout rule applies to every task in this feature: nothing under `source/`
  may write to stdout except `source/infrastructure/console-output.ts`
