---
description: 'Task list for delegate mode implementation'
---

# Tasks: Delegate Mode

**Input**: Design documents from `/specs/009-delegate-mode/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included and mandatory. Constitution II makes Test-First Development
non-negotiable for this project: every test task below is written first, must
fail before the implementation task that follows it, and the ordering within
each phase reflects that. No language model is constructed anywhere on this
path, so the constitution's `MockLanguageModelV4` requirement does not engage;
its substitute is a scripted host-agent process outcome.

**Traceability**: every task ends with the requirement identifiers it serves, so
coverage can be checked mechanically rather than inferred from wording.

**Organization**: Tasks are grouped by user story so each story can be
implemented, tested and demonstrated on its own.

## Format: `[ID] [P?] [Story] Description (requirements)`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Every task names the exact file it touches

## Path Conventions

Single project. Sources under `source/`, tests under `tests/`, per
[plan.md](./plan.md) Structure Decision.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring in the one new dependency and create the module skeleton

- [X] T001 Add `@modelcontextprotocol/sdk@1.30.0` to `dependencies` in `package.json`, install, and confirm it resolves under the pinned Node version (research R1)
- [X] T002 [P] Create the directories `source/delegate/`, `source/delegate/host/`, `tests/delegate/` and `tests/delegate/host/` (plan Structure Decision)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The judgement contract, the session, and the server. Every user
story submits findings through these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests (write first, must fail)

- [X] T003 [P] Red tests for the judgement submission contract in `tests/delegate/ingest.spec.ts`: each field rejected when it violates the contract, the rejection naming the offending field; a submission carrying `origin`, `ruleId` or `affectedElements` refused; a valid submission stored with `origin: 'judgement'` assigned by uxlint (FR-008, FR-009, SC-004)
- [X] T004 [P] Red tests for the session in `tests/delegate/session.spec.ts`: the directory is created outside the repository, two sessions never share an identity, page judgement state transitions `not-started → open → finished`, a submission naming a `finished` or `abandoned` page is refused as late (FR-013, FR-017, FR-022)
- [X] T005 [P] Red tests for model-free assembly in `tests/services/ai-service.spec.ts`: a run assembles with no `UXLINT_AI_API_KEY` present, and no provider is constructed when one *is* present (FR-002, FR-003)
- [X] T006 [P] Red tests for stdout discipline in `tests/delegate/stdout-discipline.spec.ts`: nothing reachable from `source/delegate/mcp-server.ts` imports `source/infrastructure/console-output.ts` (research R10)
- [X] T007 [P] Red tests for the five judgement tools in `tests/delegate/mcp-server.spec.ts`, driven over a transport: `listPages`, `getPageEvidence`, `addFinding`, `noteOnMeasuredIssues`, `completePageAnalysis`, each with its rejection cases from `contracts/judgement-tools.md` (FR-005, FR-007, FR-022)

### Implementation

- [X] T008 [P] Define the judgement submission contract, session, evidence and page-judgement-state types in `source/models/delegate.ts`, reusing `UxFinding`, `AnalysisStatus` and `FindingOrigin` from `source/models/analysis.ts` rather than restating them (FR-008, FR-009)
- [X] T009 [P] Implement the session lifecycle and page judgement state machine in `source/delegate/session.ts` (directory creation outside the repository, identity, unconditional disposal, state transitions) (FR-013, FR-017, FR-019, FR-022)
- [X] T010 Implement judgement intake in `source/delegate/ingest.ts`: validate against the contract, assign `origin`, refuse late and unknown-page submissions, return rejections that say what to fix (depends on T008, T009) (FR-008, FR-009, SC-004)
- [X] T011 Split model resolution out of `createAIService` in `source/services/ai-service.ts` so a run can be assembled with the browser client and report builder alone; leave the existing signature and behaviour unchanged (research R7) (FR-001, FR-002, FR-003)
- [X] T012 [P] Build per-page evidence in `source/delegate/evidence.ts`: persona, features, snapshot, measurement digest, and a capture-failure reason when the page was never read (FR-005)
- [X] T013 Implement the judgement MCP server in `source/delegate/mcp-server.ts` on the SDK's stdio transport, exposing exactly the five tools and nothing else (depends on T007, T010, T012) (FR-005, FR-006, FR-007)
- [X] T014 Add the `mcp-serve` entry point in `source/cli.tsx`: reads `UXLINT_DELEGATE_SESSION`, fails loudly when it is absent or names no directory, renders no Ink, and never reaches `source/infrastructure/console-output.ts` (FR-014, research R5, R10)

**Checkpoint**: A host agent can connect to the judgement server, pull evidence and submit findings. Nothing launches it yet.

---

## Phase 3: User Story 1 — Review a site without model credentials (Priority: P1) 🎯 MVP

**Goal**: A developer with Claude Code installed and no provider credential runs
uxlint and gets a report containing both measured and judgement findings.

**Independent Test**: Unset every provider credential, run
`node dist/source/cli.js --delegate` against a fixture site, and confirm a
report is written with `origin: audit` and `origin: judgement` findings present
(quickstart Scenario 1).

**Why Claude Code first**: it is the only host whose full path — injection,
auto-approval, tool calls arriving with conforming arguments — was verified by
execution during research. Codex and Cursor arrive in US3.

### Tests (write first, must fail)

- [X] T015 [P] [US1] Red tests for the Claude Code launch specification in `tests/delegate/host/claude-code.spec.ts`: the built command carries `-p`, `--output-format json`, `--mcp-config` naming the session, `--strict-mcp-config`, `--allowedTools` listing exactly the five tools, and `--restricted`; and the prompt is supplied on stdin, never as a trailing argument (research R2) (FR-011, FR-012)
- [X] T016 [P] [US1] Red tests for the orchestrator in `tests/delegate/runner.spec.ts`: a report is written with no credential present; every page is captured and measured before the host agent is launched; findings are attributed to the page they were submitted against; the report records which host agent judged the run; and a failing browser preflight stops the run with the same message the existing modes produce, without launching a host agent (FR-002, FR-004, FR-020, FR-022, SC-001)
- [X] T017 [P] [US1] Red test for one spawn per run in `tests/delegate/runner-spawns.spec.ts`: a four-page configuration launches the host agent exactly once (FR-021, SC-008)
- [X] T018 [P] [US1] Red tests for the early-ending session in `tests/delegate/runner-partial.spec.ts`: pages the session finished are `complete` and keep their findings; pages it never reached are `partial`, keep their measured findings, and carry a reason; a page judged clean is distinguishable from a page never reached (FR-010, FR-023, SC-005, SC-009)
- [X] T019 [P] [US1] Red test for measured parity in `tests/delegate/measured-parity.spec.ts`: for one fixture page, the measured portion of a delegated report — violations, rule identifiers, affected element counts, provenance — is identical to that of a built-in report, and only judgement findings differ (SC-002)

### Implementation

- [X] T020 [US1] Define the host adapter contract in `source/delegate/host/types.ts`: `id`, `detect()`, `buildLaunch(session)` kept pure so a command line is assertable without spawning, and `run(launch)` (FR-011)
- [X] T021 [US1] Implement the Claude Code adapter in `source/delegate/host/claude-code.ts` (depends on T020) (FR-011, FR-012)
- [X] T022 [US1] Implement the orchestrator in `source/delegate/runner.ts`: preflight, capture and measure every page, start one session, launch the adapter once, collect submissions, assemble the report through the existing `ReportBuilder`, evaluate the gate through the existing `evaluateGate` (depends on T009, T012, T021) (FR-004, FR-021)
- [X] T023 [US1] Map page judgement state to page status in `source/delegate/runner.ts`, reusing `complete` and `partial` rather than introducing a status (data-model) (FR-010, FR-023)
- [X] T024 [US1] Record the host agent that produced the judgement on the report's provenance, beside the browser server identity already recorded, in `source/delegate/runner.ts` (FR-020)
- [X] T025 [US1] Add the `--delegate` and `--host-agent` flags in `source/cli.tsx` and route them to the orchestrator; the flags do not exist in `.uxlintrc.yml` and must not be read from it (`contracts/cli-surface.md`) (FR-001, FR-015)

**Checkpoint**: US1 complete. A credential-free review works end to end with Claude Code.

---

## Phase 4: User Story 2 — The repository is never modified (Priority: P2)

**Goal**: A delegated run leaves the developer's working tree exactly as it
found it, and cannot be talked into doing otherwise by the developer's own agent
settings.

**Independent Test**: Capture `git status --porcelain` before and after a
delegated run on a clean checkout; the two must be identical, untracked files
included (quickstart Scenario 3).

### Tests (write first, must fail)

- [X] T026 [P] [US2] Red test in `tests/delegate/repo-untouched.spec.ts`: a completed delegated run adds, modifies and removes nothing under the repository root, including untracked files (FR-013, SC-003)
- [X] T027 [P] [US2] Red tests in `tests/delegate/session-disposal.spec.ts`: the session directory is removed on the success path, on an adapter failure, on time-bound expiry and on an orchestrator exception (FR-019)
- [X] T028 [P] [US2] Red test in `tests/delegate/host/read-only.spec.ts`: a shared invariant check over every registered adapter — each built command carries its host's read-only mechanism and none carries a write-enabling flag (FR-012)
- [X] T029 [P] [US2] Red test in `tests/delegate/concurrent-runs.spec.ts`: two delegated runs started against the same repository at the same time each produce a report containing only their own findings, and neither session reads the other's submissions (FR-017, SC-007)

### Implementation

- [X] T030 [US2] Make session disposal unconditional in `source/delegate/runner.ts` and `source/delegate/session.ts`, on every exit path including the failure and expiry paths (FR-019)
- [X] T031 [US2] Add the session time bound in `source/delegate/runner.ts` as a timer the run owns, raced against the adapter, following the pattern `source/services/deadline.ts` already establishes rather than trusting the child to honour a signal (FR-018)
- [X] T032 [US2] Add the adapter read-only invariant to `source/delegate/host/types.ts` as a checked property of a built launch, so a future adapter cannot omit it silently (FR-012)

**Checkpoint**: US2 complete. The read-only guarantee holds for every adapter, present and future.

---

## Phase 5: User Story 3 — Choosing and preparing a host agent (Priority: P3)

**Goal**: The other two hosts work, the tool picks sensibly among what is
installed, and a developer who is missing a prerequisite is told which one.

**Independent Test**: With zero, one and several supported agents present,
confirm selection, reporting, and a failure that names the specific unmet
prerequisite before any browser opens (quickstart Scenario 7).

### Tests (write first, must fail)

- [ ] T033 [P] [US3] Red tests for the Codex launch specification in `tests/delegate/host/codex.spec.ts`: the built command uses the `exec` subcommand and never `-p`, carries `-s read-only`, and injects the server through `-c 'mcp_servers.uxlint={…}'` with the session in `env` (research R2, R3) (FR-011, FR-012)
- [ ] T034 [P] [US3] Red tests for the Cursor launch specification in `tests/delegate/host/cursor-agent.spec.ts`: the built command carries `-p` and `--approve-mcps`, never carries `--force` or `--yolo`, and writes no configuration file anywhere (FR-011, FR-012, FR-013, FR-014)
- [ ] T035 [P] [US3] Red tests for availability and selection in `tests/delegate/host/selection.spec.ts`: no agent installed; the named agent missing; an agent installed but unauthenticated; exactly one installed and none named, which is used and reported; several installed and none named, which stops and names them — each failing before a browser is started (FR-015, FR-016)

### Implementation

- [ ] T036 [P] [US3] Implement the Codex adapter in `source/delegate/host/codex.ts` (FR-011, FR-012)
- [ ] T037 [P] [US3] Implement the Cursor Agent adapter in `source/delegate/host/cursor-agent.ts` (FR-011, FR-012, FR-013)
- [ ] T038 [US3] Implement availability detection and selection in `source/delegate/host/index.ts`, run before preflight so an unusable host costs no capture pass (depends on T036, T037) (FR-015, FR-016)
- [ ] T039 [US3] Document delegate mode in `README.md`: what it is, the `--delegate` and `--host-agent` flags, the supported hosts, the Cursor Agent one-time `~/.cursor/mcp.json` registration exactly as given in `contracts/cli-surface.md` with the note that uxlint deliberately does not write that file, and the guidance that continuous integration keeps using the existing execution mode because the subscription-reuse premise does not hold there (FR-014, SC-006, spec Assumptions)
- [ ] T040 [US3] Run quickstart Scenario 9 on a machine with a Codex login, and record in `research.md` whether `codex exec` auto-approves MCP tool calls or needs a flag; update `contracts/cli-surface.md` if it does (research open item)
- [ ] T041 [US3] Run quickstart Scenario 8 with Cursor Agent installed, and update `research.md` and `contracts/cli-surface.md` with what was actually observed; every Cursor claim is documentation-derived until this task closes (research open item)

**Checkpoint**: All three hosts supported. The two research open items about host behaviour are closed by evidence rather than by assumption.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T042 Measure a healthy delegated run and set the session time bound default in `source/delegate/runner.ts` with headroom over the observation, replacing the provisional figure in `plan.md` Performance Goals with the measured one (FR-018, Constitution IV)
- [ ] T043 Measure the judgement scaffolding overhead — session setup, server startup, adapter launch — and replace the provisional ≤2 s target in `plan.md` with the measured baseline (Constitution IV)
- [ ] T044 [P] Update `CLAUDE.md` with delegate mode: the new execution path, the `mcp-serve` process role, and the stdout rule that now applies to uxlint's own output rather than only to a child's transport (research R10)
- [ ] T045 Run every scenario in `specs/009-delegate-mode/quickstart.md` end to end and record the observed result beside each scenario in that file (all SC)
- [ ] T046 Run the quality gates defined in `package.json` — `npm run compile`, `npm run format`, `npm run lint` in that order, then `npm run test:coverage` — and confirm the 80% threshold holds with `source/delegate/` included (Constitution I, II)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks every user story**
- **US1 (Phase 3)**: depends on Foundational
- **US2 (Phase 4)**: depends on Foundational **and on US1** — see below
- **US3 (Phase 5)**: depends on Foundational and on the adapter contract from T020
- **Polish (Phase 6)**: depends on the stories being delivered

### User Story Dependencies

- **US1 (P1)**: independent once Foundational is done. This is the MVP
- **US2 (P2)**: **not independent of US1.** Its tests assert properties of a
  completed delegated run — an untouched working tree (T026), two concurrent
  runs producing two reports (T029) — which requires the orchestrator and at
  least one adapter. US2 follows US1 rather than running beside it. The
  invariant test T028 is the one exception and could run earlier
- **US3 (P3)**: independent of US2. Needs only the adapter contract from T020,
  not the Claude Code implementation

### Within Each Story

Red tests first, and they must fail. Then contract types, then adapters, then
the orchestrator, then the CLI surface. Nothing is implemented before the test
that describes it exists and fails.

### Parallel Opportunities

- Phase 2 red tests T003–T007 are five different files — all parallel
- T008, T009, T012 touch three different source files — parallel
- US1 red tests T015–T019 are five different files — parallel
- US2 red tests T026–T029 — parallel
- US3 red tests T033–T035 — parallel; adapters T036 and T037 — parallel
- **Not parallel**: T010 depends on T008 and T009; T013 depends on T007, T010 and T012; T022 depends on T009, T012 and T021; T022, T023, T024, T030 and T031 all edit `source/delegate/runner.ts`; T014 and T025 both edit `source/cli.tsx`; T020 and T032 both edit `source/delegate/host/types.ts`

---

## Parallel Example: Phase 2 Foundational

```bash
# The five red-test files, together:
Task: "Red tests for the judgement submission contract in tests/delegate/ingest.spec.ts"
Task: "Red tests for the session in tests/delegate/session.spec.ts"
Task: "Red tests for model-free assembly in tests/services/ai-service.spec.ts"
Task: "Red tests for stdout discipline in tests/delegate/stdout-discipline.spec.ts"
Task: "Red tests for the five judgement tools in tests/delegate/mcp-server.spec.ts"

# Then the three independent source files, together:
Task: "Define the judgement contract and delegate types in source/models/delegate.ts"
Task: "Implement the session lifecycle in source/delegate/session.ts"
Task: "Build per-page evidence in source/delegate/evidence.ts"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 Setup
2. Phase 2 Foundational — blocks everything, do not skip ahead
3. Phase 3 US1
4. **Stop and validate**: quickstart Scenarios 1, 2 and 4 with Claude Code
5. At this point the feature's whole reason for existing is demonstrable: a
   review completes with no provider credential

### Incremental Delivery

1. Setup + Foundational → a host agent can submit findings
2. US1 → credential-free review with Claude Code (MVP)
3. US2 → the read-only guarantee and run isolation, provable per host
4. US3 → Codex and Cursor, selection, documentation
5. Polish → measured baselines replace the two provisional figures

### Notes

- `[P]` means different files with no incomplete dependency
- Commit after each task or logical group; run compile → format → lint before
  each commit (Constitution I)
- Two figures in `plan.md` are deliberately provisional and are closed by T042
  and T043. Do not ship them as if they were measured
- Every Cursor Agent claim in the design documents is documentation-derived
  until T041 closes it, and T040 does the same for Codex tool approval
