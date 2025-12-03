# Implementation Plan: CLI State Machine Refactor

**Branch**: `001-readme-md-uxlint` | **Date**: 2025-12-02 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/001-readme-md-uxlint/spec.md`

## Summary

README.md에 정의된 CLI State Machine을 XState v5와 @xstate/react를 사용하여 구현한다. 기존의 useReducer 기반 모드 결정 로직을 XState 상태 머신으로 대체하고, createActorContext를 통해 전역 상태로 관리하여 props drilling을 방지한다.

## Technical Context

**Language/Version**: TypeScript 5.5.4  
**Primary Dependencies**: 
- xstate (신규 설치 필요)
- @xstate/react (신규 설치 필요)
- ink, @inkjs/ui (기존)
- react 18.2.0 (기존)

**Storage**: N/A  
**Testing**: 
- Ava for unit tests
- ink-testing-library for component snapshot tests (기존 설치됨)
- @testing-library/react for hook tests (기존 설치됨, renderHook 포함)

**Target Platform**: Node.js >= 18.18.0, CLI  
**Project Type**: Single project (Ink-based CLI)  
**Performance Goals**: CLI 초기화 시간 500ms 이하 유지  
**Constraints**: 기존 기능 회귀 없음  
**Scale/Scope**: 기존 코드베이스 리팩토링

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with uxlint Constitution v1.2.0:

**I. Code Quality Gates** (NON-NEGOTIABLE):
- [x] `npm run compile && npm run format && npm run lint` sequence will be run after all code changes
- [x] No linting bypasses (`// eslint-disable-next-line`) planned

**II. Test-First Development** (NON-NEGOTIABLE):
- [x] Tests will be written BEFORE implementation
- [x] Testing strategy defined: Unit tests (Ava) for state machine transitions, visual regression (ink-testing-library) for App component
- [x] Language model tests use MockLanguageModelV2 from `ai/test` (N/A for this feature - no new LLM integration)
- [x] 80% coverage target via c8

**III. UX Consistency**:
- [x] Feature references target personas from project context (CLI developers in TTY/CI environments)
- [x] Ink ecosystem libraries researched via GitHub MCP for UI patterns (ink-testing-library)
- [x] Library choices documented with rationale (see research.md)

**IV. Performance Accountability**:
- [x] Measurable performance goals defined: CLI initialization under 500ms
- [x] Baseline metrics identified: Current initialization time will be measured before refactoring

**V. Simplicity & Minimalism**:
- [x] Simplest viable approach chosen (XState with createActorContext)
- [x] Any complexity justified in Complexity Tracking table below

## Project Structure

### Documentation (this feature)

```
specs/001-readme-md-uxlint/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Research findings on XState, testing
├── data-model.md        # State machine model definition
├── quickstart.md        # Quick reference guide
├── contracts/           # Type contracts
│   └── state-machine-contract.ts
└── checklists/
    └── requirements.md  # Specification quality checklist
```

### Source Code (repository root)

```
source/
├── cli.tsx                      # MODIFY: Add XState provider, remove mode logic
├── app.tsx                      # MODIFY: Use XState context instead of mode prop
├── machines/                    # NEW DIRECTORY
│   └── uxlint-machine.ts        # NEW: XState machine definition
├── contexts/                    # NEW DIRECTORY
│   └── uxlint-context.tsx       # NEW: createActorContext wrapper
├── components/
│   ├── config-wizard.tsx        # MODIFY: Send WIZARD_COMPLETE event
│   ├── analysis-runner.tsx      # MODIFY: Send ANALYSIS_COMPLETE event
│   └── ... (unchanged)
├── hooks/
│   ├── use-wizard.ts            # DELETE: Replaced by XState
│   ├── use-config-wizard.ts     # MODIFY: Remove useWizard dependency
│   └── ... (unchanged)
└── models/
    ├── errors.ts                # MODIFY: Add MissingConfigError
    └── ... (unchanged)

tests/
├── machines/                    # NEW DIRECTORY
│   └── uxlint-machine.spec.ts   # NEW: Machine transition tests
├── components/
│   └── app.spec.tsx             # NEW: App component snapshot tests
└── hooks/
    └── use-config-wizard.spec.tsx  # UPDATE: Adapt to XState integration
```

**Structure Decision**: Single project structure maintained. New `machines/` and `contexts/` directories added under `source/` for XState-related code.

## Implementation Phases

### Phase 1: Dependencies & Type Contracts (P0)
1. Install xstate and @xstate/react
2. Create type contracts in `contracts/state-machine-contract.ts`
3. Add MissingConfigError to `source/models/errors.ts`

### Phase 2: Tests First - Machine (P1)
1. Create `tests/machines/uxlint-machine.spec.ts`
2. Write tests for all state transitions
3. Write tests for guards and actions
4. Verify tests fail (red phase)

### Phase 3: Implement State Machine (P1)
1. Create `source/machines/uxlint-machine.ts`
2. Implement states: idle, tty (wizard, analyzeWithUI), ci (analyzeWithoutUI, error), reportBuilder, done
3. Implement guards: isInteractive, hasConfig
4. Implement actions: assignConfig, assignWizardConfig, assignAnalysisResult, assignError, setExitCode
5. Verify tests pass (green phase)

### Phase 4: Tests First - Context & Integration (P2)
1. Create `tests/components/app.spec.tsx`
2. Write snapshot tests for App component states
3. Verify tests fail

### Phase 5: Implement Context & Integration (P2)
1. Create `source/contexts/uxlint-context.tsx`
2. Modify `source/cli.tsx` to wrap App with provider
3. Modify `source/app.tsx` to use XState context
4. Verify tests pass

### Phase 6: Component Integration (P2)
1. Modify `source/components/config-wizard.tsx` to send WIZARD_COMPLETE
2. Modify `source/components/analysis-runner.tsx` to send ANALYSIS_COMPLETE
3. Modify `source/hooks/use-config-wizard.ts` to remove useWizard dependency
4. Delete `source/hooks/use-wizard.ts`

### Phase 7: Cleanup & Validation (P3)
1. Update existing tests to work with new structure
2. Run full test suite
3. Run quality gates
4. Verify 80% coverage

## Files to Delete

| File | Reason |
|------|--------|
| `source/hooks/use-wizard.ts` | Replaced by XState machine; useReducer-based state management no longer needed |

## Files to Create

| File | Purpose |
|------|---------|
| `source/machines/uxlint-machine.ts` | XState v5 machine definition with states, guards, actions |
| `source/contexts/uxlint-context.tsx` | createActorContext wrapper for global state |
| `tests/machines/uxlint-machine.spec.ts` | Unit tests for machine transitions |
| `tests/components/app.spec.tsx` | Snapshot tests for App component |

## Files to Modify

| File | Changes |
|------|---------|
| `source/cli.tsx` | Remove mode logic, add XState provider, send INITIALIZE event |
| `source/app.tsx` | Remove mode prop, use UxlintMachineContext to determine rendering |
| `source/components/config-wizard.tsx` | Send WIZARD_COMPLETE/WIZARD_CANCEL events |
| `source/components/analysis-runner.tsx` | Send ANALYSIS_COMPLETE/ANALYSIS_ERROR events |
| `source/hooks/use-config-wizard.ts` | Remove useWizard import, integrate with XState |
| `source/hooks/index.ts` | Remove useWizard export |
| `source/models/errors.ts` | Add MissingConfigError class |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| XState library addition | State machine with guards, actions, and visual debugging needed for complex CLI flow | useReducer doesn't provide guard conditions, state visualization, or typed transitions |
| createActorContext pattern | Prevents props drilling across component tree | Manual Context with useContext requires more boilerplate and doesn't integrate with XState |

## Dependencies to Install

```bash
npm install xstate @xstate/react
```

## Test Coverage Requirements

| Component | Test Type | Coverage Target |
|-----------|-----------|-----------------|
| uxlint-machine.ts | Unit (Ava) | 100% of transitions |
| App.tsx | Snapshot (ink-testing-library) | All render states |
| use-config-wizard.ts | Unit (renderHook) | Existing tests updated |

## Quality Gates Checklist

- [ ] `npm run compile` passes
- [ ] `npm run format` applied
- [ ] `npm run lint` passes  
- [ ] All tests pass
- [ ] Coverage >= 80%
- [ ] No regressions in existing functionality
