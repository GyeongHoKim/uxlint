# Tasks: Real-time LLM Response Display in TTY Analyze Mode

**Input**: Design documents from `/specs/002-uxlint-tty-analyze/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Per Constitution v1.2.0 II, tests are MANDATORY and MUST be written BEFORE implementation:
- Models (pure TypeScript classes/functions): Unit tests using Ava
- Components (React/Ink UI): Visual regression tests using ink-testing-library
- Language Model Integrations: Mock-based tests using MockLanguageModelV2 from `ai/test` (AI SDK 5.x standard)
- Tests MUST fail initially (red phase) before implementation begins

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## User Stories Summary

| Story | Priority | Description |
|-------|----------|-------------|
| US1 | P1 | View LLM Responses During Analysis (직전 LLM response 표시) |
| US2 | P2 | Distinguish Between Different Message Types (메시지 타입 구분) |
| US3 | P3 | Handle Long Messages and Message Overflow (긴 메시지 처리) |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project structure and new file scaffolding

- [x] T001 [P] Create `source/models/llm-response.ts` file scaffold
- [x] T002 [P] Create `source/constants/waiting-messages.ts` file scaffold
- [x] T003 [P] Create `source/components/llm-response-display.tsx` file scaffold
- [x] T004 [P] Create `tests/models/llm-response.spec.ts` file scaffold
- [x] T005 [P] Create `tests/constants/waiting-messages.spec.ts` file scaffold
- [x] T006 [P] Create `tests/components/llm-response-display.spec.tsx` file scaffold

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types and utilities that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational (MANDATORY per Constitution v1.2.0) ⚠️

**Strategy**: Unit tests (Ava) for models

- [x] T007 [P] [FOUND] Write unit tests for `LLMResponseData` type validation in `tests/models/llm-response.spec.ts`
  - Test valid LLMResponseData creation
  - Test with text only, toolCalls only, both
  - Test iteration and timestamp fields

- [x] T008 [P] [FOUND] Write unit tests for waiting messages in `tests/constants/waiting-messages.spec.ts`
  - Test messages array is not empty
  - Test getRandomWaitingMessage returns valid message
  - Test all messages are non-empty strings

### Implementation for Foundational

- [x] T009 [P] [FOUND] Implement `LLMResponseData` and `LLMToolCall` types in `source/models/llm-response.ts`
  - Define LLMToolCall type (toolName, args)
  - Define LLMResponseData type (text, toolCalls, finishReason, iteration, timestamp)
  - Export types for use in other modules

- [x] T010 [P] [FOUND] Implement waiting messages module in `source/constants/waiting-messages.ts`
  - Define waitingMessages array with 20+ humorous messages
  - Implement getRandomWaitingMessage() function
  - Export messages and function

- [x] T011 [FOUND] Extend `AnalysisState` type in `source/models/analysis.ts`
  - Import LLMResponseData from llm-response.ts
  - Add `lastLLMResponse?: LLMResponseData` field
  - Add `waitingMessage?: string` field
  - Add `isWaitingForLLM?: boolean` field
  - Add `currentIteration?: number` field

- [x] T012 [FOUND] Extend `AnalysisProgressCallback` type in `source/services/ai-service.ts`
  - Import LLMResponseData from models
  - Add optional `llmResponse` parameter to callback type
  - Maintain backward compatibility with existing calls

**Checkpoint**: Foundation ready - all core types defined, user story implementation can now begin

---

## Phase 3: User Story 1 - View LLM Responses During Analysis (Priority: P1) 🎯 MVP

**Goal**: Display the last LLM response (text + tool calls) in the terminal UI during analysis

**Independent Test**: Run uxlint in TTY mode and observe that LLM responses appear in the terminal as they are generated

### Tests for User Story 1 (MANDATORY per Constitution v1.2.0) ⚠️

**Strategy**: Visual regression (ink-testing-library) for components, mocks (MockLanguageModelV3) for LLM integrations

- [x] T013 [P] [US1] Write visual regression tests for `LLMResponseDisplay` component in `tests/components/llm-response-display.spec.tsx`
  - Test renders LLM text response correctly
  - Test renders tool calls list correctly
  - Test renders iteration number
  - Test renders empty state when no response

- [x] T014 [P] [US1] Write visual regression tests for updated `AnalysisProgress` in `tests/components/analysis-progress.spec.tsx`
  - Test renders lastLLMResponse when provided
  - Test renders LLMResponseDisplay component integration
  - Test does not break existing functionality

- [x] T015 [US1] Write mock-based tests for AIService LLM response callback in `tests/services/ai-service.spec.ts`
  - Use MockLanguageModelV3 from `ai/test`
  - Test onProgress is called with llmResponse after generateText
  - Test llmResponse contains text, toolCalls, iteration, timestamp

### Implementation for User Story 1

- [x] T016 [US1] Implement `LLMResponseDisplay` component in `source/components/llm-response-display.tsx`
  - Create LLMResponseDisplayProps type
  - Render iteration header with emoji (📝)
  - Render LLM text response in Box
  - Render tool calls list with emoji (🔧)
  - Use Ink Text and Box components

- [x] T017 [US1] Update `AIService.analyzePage` to pass LLM response in `source/services/ai-service.ts`
  - Import getRandomWaitingMessage from constants
  - After generateText call: create LLMResponseData from result
  - Call onProgress with llmResponse parameter
  - Include text, toolCalls, finishReason, iteration, timestamp

- [x] T018 [US1] Update `useAnalysis` hook to handle LLM response in `source/hooks/use-analysis.ts`
  - Update onProgress callback signature to accept llmResponse
  - When llmResponse provided: set lastLLMResponse, isWaitingForLLM: false
  - When llmResponse not provided: preserve lastLLMResponse
  - Update currentIteration from llmResponse

- [x] T019 [US1] Update `AnalysisProgress` component in `source/components/analysis-progress.tsx`
  - Add lastLLMResponse prop to AnalysisProgressProps
  - Import and render LLMResponseDisplay when lastLLMResponse exists
  - Only show when stage is 'analyzing'

- [x] T020 [US1] Update `AnalysisRunner` component in `source/components/analysis-runner.tsx`
  - Pass analysisState.lastLLMResponse to AnalysisProgress

- [x] T021 [US1] Export LLMResponseDisplay from `source/components/index.ts`

**Checkpoint**: User Story 1 complete - LLM responses now visible in terminal UI

---

## Phase 4: User Story 2 - Distinguish Between Different Message Types (Priority: P2)

**Goal**: Visually distinguish between LLM text responses and tool calls

**Independent Test**: Verify that text responses and tool calls have different visual styling

### Tests for User Story 2 (MANDATORY per Constitution v1.2.0) ⚠️

**Strategy**: Visual regression (ink-testing-library) for components

- [x] T022 [P] [US2] Write visual regression tests for message type distinction in `tests/components/llm-response-display.spec.tsx`
  - Test text response has distinct styling (color, prefix)
  - Test tool calls have distinct styling (different color, bullet points)
  - Test finishReason is indicated visually

- [x] T023 [P] [US2] Write visual regression tests for waiting message display in `tests/components/analysis-progress.spec.tsx`
  - Test waiting message displays with spinner when isWaitingForLLM is true
  - Test waiting message has distinct styling from LLM response

### Implementation for User Story 2

- [x] T024 [US2] Enhance `LLMResponseDisplay` with visual distinction in `source/components/llm-response-display.tsx`
  - Add color coding: cyan for text response header
  - Add color coding: yellow for tool calls header
  - Add emoji prefixes: 📝 for text, 🔧 for tools
  - Add bullet points (•) for tool call items

- [x] T025 [US2] Add waiting message display in `source/components/analysis-progress.tsx`
  - Add waitingMessage and isWaitingForLLM props
  - Show spinner + waitingMessage when isWaitingForLLM is true
  - Use cyan color and dimColor for waiting state

- [x] T026 [US2] Update AIService to send waiting message before LLM call in `source/services/ai-service.ts`
  - Before generateText: call onProgress('analyzing', waitingMessage, undefined)
  - This sets isWaitingForLLM: true in state

- [x] T027 [US2] Update useAnalysis hook to handle waiting state in `source/hooks/use-analysis.ts`
  - When message provided but no llmResponse: set waitingMessage, isWaitingForLLM: true
  - When llmResponse provided: clear waitingMessage, isWaitingForLLM: false

- [x] T028 [US2] Update AnalysisRunner to pass waiting state props in `source/components/analysis-runner.tsx`
  - Pass analysisState.waitingMessage to AnalysisProgress
  - Pass analysisState.isWaitingForLLM to AnalysisProgress

**Checkpoint**: User Story 2 complete - Message types visually distinguished

---

## Phase 5: User Story 3 - Handle Long Messages and Message Overflow (Priority: P3)

**Goal**: Handle long LLM responses and many tool calls gracefully

**Independent Test**: Verify that long messages are truncated and many tool calls are limited

### Tests for User Story 3 (MANDATORY per Constitution v1.2.0) ⚠️

**Strategy**: Unit tests (Ava) for truncation logic, visual regression for display

- [x] T029 [P] [US3] Write unit tests for text truncation in `tests/models/llm-response.spec.ts`
  - Test truncateText function with short text (no truncation)
  - Test truncateText function with long text (200+ chars)
  - Test truncation adds "..." indicator

- [x] T030 [P] [US3] Write visual regression tests for overflow handling in `tests/components/llm-response-display.spec.tsx`
  - Test long text is truncated with "..." indicator
  - Test many tool calls (6+) shows "+N more..." indicator
  - Test display adapts to content without breaking layout

### Implementation for User Story 3

- [x] T031 [US3] Add truncation utility functions in `source/models/llm-response.ts`
  - Implement truncateText(text: string, maxLength: number): string
  - Implement formatToolCall(toolCall: LLMToolCall): string
  - Export utility functions

- [x] T032 [US3] Update `LLMResponseDisplay` with truncation in `source/components/llm-response-display.tsx`
  - Add maxTextLength prop (default: 200)
  - Add maxToolCalls prop (default: 5)
  - Truncate text response to maxTextLength
  - Limit tool calls display to maxToolCalls
  - Show "+N more..." when tool calls exceed limit

- [x] T033 [US3] Add wrap="wrap" to text display in `source/components/llm-response-display.tsx`
  - Ensure long lines wrap properly within terminal width
  - Use Ink's Text wrap prop

**Checkpoint**: User Story 3 complete - Long messages handled gracefully

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Quality assurance and final integration

- [x] T034 [P] Run `npm run compile` and fix any TypeScript errors
- [x] T035 [P] Run `npm run format` to apply Prettier formatting
- [x] T036 [P] Run `npm run lint` and fix any XO linting issues
- [x] T037 Run full test suite `npm test` and ensure all tests pass
- [x] T038 Verify 80% coverage threshold is met via c8
- [x] T039 Manual integration test: run uxlint in TTY mode and verify:
  - LLM responses appear in terminal
  - Tool calls are displayed
  - Waiting messages show during LLM calls
  - Long messages are truncated
- [x] T040 Update component exports in `source/components/index.ts` if needed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion
- **User Story 2 (Phase 4)**: Depends on User Story 1 completion (builds on US1 components)
- **User Story 3 (Phase 5)**: Depends on User Story 1 completion (builds on US1 components)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - Core feature, MVP
- **User Story 2 (P2)**: Can start after US1 - Enhances US1 with visual distinction
- **User Story 3 (P3)**: Can start after US1 - Enhances US1 with overflow handling

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD)
- Models/Types before services
- Services before components
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks (T001-T006) can run in parallel
- Foundational tests (T007-T008) can run in parallel
- Foundational types (T009-T010) can run in parallel
- US1 tests (T013-T015) can run in parallel
- US2 tests (T022-T023) can run in parallel
- US3 tests (T029-T030) can run in parallel
- Polish tasks (T034-T036) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (write tests first):
Task T013: "Visual regression tests for LLMResponseDisplay"
Task T014: "Visual regression tests for AnalysisProgress"
Task T015: "Mock-based tests for AIService"

# After tests fail, implement in dependency order:
Task T016: "Implement LLMResponseDisplay component"
Task T017: "Update AIService.analyzePage"
Task T018: "Update useAnalysis hook"
Task T019: "Update AnalysisProgress component"
Task T020: "Update AnalysisRunner component"
Task T021: "Export LLMResponseDisplay"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T012)
3. Complete Phase 3: User Story 1 (T013-T021)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Run quality gates: `npm run compile && npm run format && npm run lint`
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### TDD Workflow (per Constitution v1.2.0)

For each user story:
1. Write tests first (T0XX tests)
2. Run tests → Verify they FAIL (red phase)
3. Implement code (T0XX implementation)
4. Run tests → Verify they PASS (green phase)
5. Refactor if needed
6. Run quality gates

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- [FOUND] = Foundational tasks that block all user stories
- Each user story should be independently completable and testable
- Verify tests fail before implementing (Constitution v1.2.0 II)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Run quality gates after each phase: `npm run compile && npm run format && npm run lint`

