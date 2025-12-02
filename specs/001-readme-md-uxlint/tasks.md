# Tasks: CLI State Machine Refactor

**Input**: Design documents from `/specs/001-readme-md-uxlint/`  
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Per Constitution v1.2.0 II, tests are MANDATORY and MUST be written BEFORE implementation:
- Models (pure TypeScript classes/functions): Unit tests using Ava
- Components (React/Ink UI): Visual regression tests using ink-testing-library
- Language Model Integrations: Mock-based tests using MockLanguageModelV3 from `ai/test`
- Tests MUST fail initially (red phase) before implementation begins

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions
- **Single project**: `source/`, `tests/` at repository root
- Paths follow existing uxlint structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency installation

- [x] T001 Install xstate and @xstate/react dependencies: `npm install xstate @xstate/react`
- [x] T002 [P] Create `source/machines/` directory
- [x] T003 [P] Create `source/contexts/` directory
- [x] T004 [P] Create `tests/machines/` directory
- [x] T005 [P] Create `tests/components/` directory

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational Infrastructure (MANDATORY per Constitution v1.2.0) ⚠️

**NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T006 [FOUND] Write failing test for MissingConfigError in `tests/models/errors.spec.ts`
- [x] T007 [FOUND] Write failing tests for XState machine initial state in `tests/machines/uxlint-machine.spec.ts`
- [x] T008 [FOUND] Write failing tests for guard functions (isInteractive, hasConfig) in `tests/machines/uxlint-machine.spec.ts`

### Implementation for Foundational Infrastructure

- [x] T009 [FOUND] Add MissingConfigError class to `source/models/errors.ts`
- [x] T010 [FOUND] Create XState machine with setup types in `source/machines/uxlint-machine.ts`
  - Define UxlintMachineContext interface
  - Define UxlintMachineEvent types
  - Define UxlintMachineInput interface
- [x] T011 [FOUND] Implement machine states: idle, tty, ci, reportBuilder, done in `source/machines/uxlint-machine.ts`
- [x] T012 [FOUND] Implement nested states: tty.wizard, tty.analyzeWithUI, ci.analyzeWithoutUI, ci.error
- [x] T013 [FOUND] Implement guards: isInteractive, isCI, hasConfig, noConfig in `source/machines/uxlint-machine.ts`
- [x] T014 [FOUND] Implement actions: assignConfig, assignWizardConfig, assignAnalysisResult, assignError, setExitCodeZero, setExitCodeOne, createMissingConfigError
- [x] T015 [FOUND] Create UxlintMachineContext provider in `source/contexts/uxlint-context.tsx` using createActorContext
- [x] T016 [FOUND] Update `source/hooks/index.ts` to export new context hooks (if needed)
- [x] T017 [FOUND] Run tests and verify they pass (green phase)
- [x] T018 [FOUND] Run quality gates: `npm run compile && npm run format && npm run lint`

**Checkpoint**: Foundation ready - state machine and context provider complete, user story implementation can now begin

---

## Phase 3: User Story 1 - Interactive Mode with Wizard (Priority: P1) 🎯 MVP

**Goal**: 사용자가 `--interactive` 플래그와 함께 uxlint를 실행하고, 설정 파일이 없는 경우 Wizard를 통해 설정을 생성한 후 분석을 수행한다.

**Independent Test**: Wizard 완료 후 AnalyzeWithUI가 자동으로 시작되어 리포트가 생성되는지 확인

### Tests for User Story 1 (MANDATORY per Constitution v1.2.0) ⚠️

**Strategy**: Unit tests (Ava) for machine transitions, visual regression (ink-testing-library) for App component

- [x] T019 [P] [US1] Write failing test for idle → tty transition when interactive=true in `tests/machines/uxlint-machine.spec.ts`
- [x] T020 [P] [US1] Write failing test for tty → tty.wizard transition when configExists=false
- [x] T021 [P] [US1] Write failing test for tty.wizard → tty.analyzeWithUI on WIZARD_COMPLETE event
- [x] T022 [P] [US1] Write failing test for tty.wizard → done on WIZARD_CANCEL event
- [ ] T023 [P] [US1] Write failing snapshot test for App rendering ConfigWizard in `tests/components/app.spec.tsx` (SKIPPED: ESM compatibility issue)

### Implementation for User Story 1

- [x] T024 [US1] Modify `source/cli.tsx` to wrap App with UxlintMachineContext.Provider
- [x] T025 [US1] Modify `source/cli.tsx` to send INITIALIZE event with interactive flag and config status
- [x] T026 [US1] Modify `source/app.tsx` to use UxlintMachineContext.useSelector for state
- [x] T027 [US1] Modify `source/app.tsx` to render ConfigWizard when state matches 'tty.wizard'
- [ ] T028 [US1] Modify `source/components/config-wizard.tsx` to get actorRef from context (PENDING: Optional enhancement)
- [ ] T029 [US1] Modify `source/components/config-wizard.tsx` to send WIZARD_COMPLETE event on completion (PENDING: Using callback props)
- [ ] T030 [US1] Modify `source/components/config-wizard.tsx` to send WIZARD_CANCEL event on cancel (PENDING: Using callback props)
- [ ] T031 [US1] Modify `source/hooks/use-config-wizard.ts` to remove useWizard import dependency (PENDING: For Phase 8 cleanup)
- [x] T032 [US1] Run tests and verify US1 tests pass
- [x] T033 [US1] Run quality gates

**Checkpoint**: At this point, User Story 1 should be fully functional - `uxlint --interactive` shows wizard when no config exists

---

## Phase 4: User Story 2 - Interactive Mode with Existing Config (Priority: P2)

**Goal**: 사용자가 `--interactive` 플래그와 함께 uxlint를 실행하고, 설정 파일이 이미 있는 경우 Wizard를 건너뛰고 바로 분석을 수행한다.

**Independent Test**: 설정 파일이 있는 상태에서 `--interactive` 플래그로 실행 시 Wizard 없이 AnalyzeWithUI가 시작되는지 확인

### Tests for User Story 2 (MANDATORY per Constitution v1.2.0) ⚠️

- [ ] T034 [P] [US2] Write failing test for tty → tty.analyzeWithUI transition when configExists=true
- [ ] T035 [P] [US2] Write failing test for tty.analyzeWithUI → reportBuilder on ANALYSIS_COMPLETE
- [ ] T036 [P] [US2] Write failing test for tty.analyzeWithUI → done on ANALYSIS_ERROR
- [ ] T037 [P] [US2] Write failing snapshot test for App rendering AnalysisRunner in tty.analyzeWithUI state

### Implementation for User Story 2

- [ ] T038 [US2] Modify `source/app.tsx` to render AnalysisRunner when state matches 'tty.analyzeWithUI'
- [ ] T039 [US2] Modify `source/components/analysis-runner.tsx` to get actorRef from context
- [ ] T040 [US2] Modify `source/components/analysis-runner.tsx` to send ANALYSIS_COMPLETE event on success
- [ ] T041 [US2] Modify `source/components/analysis-runner.tsx` to send ANALYSIS_ERROR event on failure
- [ ] T042 [US2] Run tests and verify US2 tests pass
- [ ] T043 [US2] Run quality gates

**Checkpoint**: At this point, User Stories 1 AND 2 should both work - interactive mode works with or without existing config

---

## Phase 5: User Story 3 - CI Mode with Existing Config (Priority: P2)

**Goal**: 사용자가 `--interactive` 플래그 없이 uxlint를 실행하고, 설정 파일이 있는 경우 UI 없이 분석을 수행한다.

**Independent Test**: 설정 파일이 있는 상태에서 `--interactive` 없이 실행 시 UI 없이 분석이 수행되는지 확인

### Tests for User Story 3 (MANDATORY per Constitution v1.2.0) ⚠️

- [ ] T044 [P] [US3] Write failing test for idle → ci transition when interactive=false
- [ ] T045 [P] [US3] Write failing test for ci → ci.analyzeWithoutUI transition when configExists=true
- [ ] T046 [P] [US3] Write failing test for ci.analyzeWithoutUI → reportBuilder on ANALYSIS_COMPLETE
- [ ] T047 [P] [US3] Write failing snapshot test for App rendering AnalyzeWithoutUI component

### Implementation for User Story 3

- [ ] T048 [US3] Create AnalyzeWithoutUI component in `source/components/analyze-without-ui.tsx` (headless analysis)
- [ ] T049 [US3] Export AnalyzeWithoutUI from `source/components/index.ts`
- [ ] T050 [US3] Modify `source/app.tsx` to render AnalyzeWithoutUI when state matches 'ci.analyzeWithoutUI'
- [ ] T051 [US3] Implement AnalyzeWithoutUI to run analysis without UI feedback
- [ ] T052 [US3] Send ANALYSIS_COMPLETE/ANALYSIS_ERROR from AnalyzeWithoutUI
- [ ] T053 [US3] Run tests and verify US3 tests pass
- [ ] T054 [US3] Run quality gates

**Checkpoint**: At this point, CI mode with config works - `uxlint` runs analysis without UI when config exists

---

## Phase 6: User Story 4 - CI Mode Error on Missing Config (Priority: P3)

**Goal**: 사용자가 `--interactive` 플래그 없이 uxlint를 실행하고, 설정 파일이 없는 경우 에러를 표시한다.

**Independent Test**: 설정 파일이 없는 상태에서 `--interactive` 없이 실행 시 에러 메시지와 함께 종료되는지 확인

### Tests for User Story 4 (MANDATORY per Constitution v1.2.0) ⚠️

- [ ] T055 [P] [US4] Write failing test for ci → ci.error transition when configExists=false
- [ ] T056 [P] [US4] Write failing test for ci.error → done transition with exitCode=1
- [ ] T057 [P] [US4] Write failing test verifying MissingConfigError is created in ci.error state
- [ ] T058 [P] [US4] Write failing snapshot test for App rendering error message in ci.error state

### Implementation for User Story 4

- [ ] T059 [US4] Modify `source/app.tsx` to render error message when state matches 'ci.error'
- [ ] T060 [US4] Display MissingConfigError message with helpful guidance
- [ ] T061 [US4] Suggest using `--interactive` flag in error message
- [ ] T062 [US4] Ensure process.exit(1) is called when machine reaches done with exitCode=1
- [ ] T063 [US4] Run tests and verify US4 tests pass
- [ ] T064 [US4] Run quality gates

**Checkpoint**: All user stories complete - CLI handles all 4 scenarios correctly

---

## Phase 7: ReportBuilder & Completion States

**Goal**: 분석 완료 후 리포트 생성 및 프로세스 종료 처리

### Tests for ReportBuilder (MANDATORY)

- [ ] T065 [P] [SHARED] Write failing test for reportBuilder → done on REPORT_COMPLETE
- [ ] T066 [P] [SHARED] Write failing test for reportBuilder → done on REPORT_ERROR
- [ ] T067 [P] [SHARED] Write failing test verifying exitCode=0 on successful completion

### Implementation for ReportBuilder

- [ ] T068 [SHARED] Modify `source/app.tsx` to render ReportBuilder when state matches 'reportBuilder'
- [ ] T069 [SHARED] Send REPORT_COMPLETE/REPORT_ERROR from report generation
- [ ] T070 [SHARED] Handle process exit based on exitCode in context
- [ ] T071 [SHARED] Run tests and verify all tests pass
- [ ] T072 [SHARED] Run quality gates

**Checkpoint**: Complete flow works end-to-end

---

## Phase 8: Cleanup & Cross-Cutting Concerns

**Purpose**: Remove obsolete code and final validation

- [ ] T073 Delete `source/hooks/use-wizard.ts` (replaced by XState)
- [ ] T074 Update `source/hooks/index.ts` to remove useWizard export
- [ ] T075 [P] Update existing tests in `tests/hooks/use-config-wizard.spec.tsx` to work with new structure
- [ ] T076 Remove obsolete 'normal' mode handling from codebase
- [ ] T077 [P] Update README.md if any CLI usage changed
- [ ] T078 Run full test suite: `npm test`
- [ ] T079 Run coverage check and verify >= 80%: `npm run test:coverage`
- [ ] T080 Final quality gates: `npm run compile && npm run format && npm run lint`
- [ ] T081 Manual verification of all 4 user story scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-6)**: All depend on Foundational phase completion
  - User stories can proceed sequentially in priority order (P1 → P2 → P2 → P3)
  - US2 and US3 are both P2, can be developed in parallel if team capacity allows
- **ReportBuilder (Phase 7)**: Can start after any analysis user story (US1-3)
- **Cleanup (Phase 8)**: Depends on all phases being complete

### User Story Dependencies

| Story | Priority | Dependencies | Can Run After |
|-------|----------|--------------|---------------|
| US1 | P1 | Foundational (Phase 2) | Phase 2 |
| US2 | P2 | US1 recommended (shares AnalysisRunner) | Phase 3 |
| US3 | P2 | None (independent CI path) | Phase 2 |
| US4 | P3 | None (error handling) | Phase 2 |

### Within Each User Story

1. Tests MUST be written and FAIL before implementation
2. Modify app.tsx to handle new state
3. Modify components to send events
4. Run tests and verify pass
5. Run quality gates

### Parallel Opportunities

- Setup tasks T002-T005 can run in parallel
- US1 tests T019-T023 can run in parallel
- US2 tests T034-T037 can run in parallel
- US3 tests T044-T047 can run in parallel
- US4 tests T055-T058 can run in parallel
- US3 (CI mode) can be developed in parallel with US2 (TTY mode)

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all US1 tests together:
Task T019: "Write failing test for idle → tty transition"
Task T020: "Write failing test for tty → tty.wizard transition"
Task T021: "Write failing test for tty.wizard → tty.analyzeWithUI"
Task T022: "Write failing test for tty.wizard → done on cancel"
Task T023: "Write failing snapshot test for App in wizard state"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - state machine core)
3. Complete Phase 3: User Story 1 (Interactive with Wizard)
4. **STOP and VALIDATE**: Test `uxlint --interactive` without config
5. Demo/deploy if ready

### Incremental Delivery

1. Setup + Foundational → State machine ready
2. Add US1 → Test → Deploy (Interactive wizard works!)
3. Add US2 → Test → Deploy (Interactive with config works!)
4. Add US3 → Test → Deploy (CI mode works!)
5. Add US4 → Test → Deploy (CI error handling works!)
6. Cleanup → Final release

### Recommended Single Developer Path

```
Phase 1 (Setup) → Phase 2 (Foundation) → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6 (US4) → Phase 7 → Phase 8
```

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- [FOUND] = Foundational task needed by all stories
- [SHARED] = Shared functionality across stories
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD red phase)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Quality gates MUST pass after each phase

