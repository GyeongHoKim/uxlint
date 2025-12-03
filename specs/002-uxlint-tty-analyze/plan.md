# Implementation Plan: Real-time LLM Response Display in TTY Analyze Mode

**Branch**: `002-uxlint-tty-analyze` | **Date**: 2025-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-uxlint-tty-analyze/spec.md`

## Summary

TTY 모드에서 분석 중 **직전 LLM 응답(text + tool calls)을 실시간으로 UI에 표시**하고, LLM 호출 대기 중에는 **유머러스한 폴백 UI + 애니메이션 아이콘**을 보여줍니다.

### 핵심 요구사항 (Priority Order)
1. **직전 LLM Response 표시** (Primary): LLM의 텍스트 응답과 tool calls를 UI에 실시간 표시
2. **유머러스한 대기 메시지 + 애니메이션** (Secondary): 정상 작동 중임을 알리는 폴백 UI

현재 `generateText` 기반의 blocking UI를 유지하면서, 각 iteration마다 LLM 응답을 UI에 전달합니다. 이는 [AI SDK Manual Agent Loop 패턴](https://ai-sdk.dev/cookbook/node/manual-agent-loop)을 따르며 기존 아키텍처를 최소한으로 변경합니다.

## Technical Context

**Language/Version**: TypeScript 5.x with ES modules
**Primary Dependencies**: React (Ink), AI SDK (`ai` package), XState
**Storage**: N/A (in-memory state only)
**Testing**: Ava + ink-testing-library + MockLanguageModelV2 from `ai/test`
**Target Platform**: Node.js >=18.18.0 (CLI application)
**Project Type**: Single project (CLI tool)
**Performance Goals**: UI 업데이트 1초 이내, 초당 5개 메시지까지 반응성 유지
**Constraints**: 기존 Manual Agent Loop 패턴 유지, `generateText` blocking 방식 유지
**Scale/Scope**: 단일 사용자 CLI 도구

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with uxlint Constitution v1.2.0:

**I. Code Quality Gates** (NON-NEGOTIABLE):
- [x] `npm run compile && npm run format && npm run lint` sequence will be run after all code changes
- [x] No linting bypasses (`// eslint-disable-next-line`) planned

**II. Test-First Development** (NON-NEGOTIABLE):
- [x] Tests will be written BEFORE implementation
- [x] Testing strategy defined: Unit tests (Ava) for models, visual regression (ink-testing-library) for components, mock-based tests for language model integrations
- [x] Language model tests use MockLanguageModelV2 from `ai/test`
- [x] 80% coverage target via c8

**III. UX Consistency**:
- [x] Feature references target personas from project context
- [x] Ink ecosystem libraries researched via GitHub MCP for UI patterns
- [x] Library choices documented with rationale (ink-spinner 유지, 기존 코드 일관성)

**IV. Performance Accountability**:
- [x] Measurable performance goals defined (UI 업데이트 1초 이내)
- [x] Baseline metrics identified (현재 iteration당 1회 onProgress 호출)

**V. Simplicity & Minimalism**:
- [x] Simplest viable approach chosen (기존 onProgress 콜백 확장)
- [x] Any complexity justified in Complexity Tracking table below

## Project Structure

### Documentation (this feature)

```
specs/002-uxlint-tty-analyze/
├── plan.md              # This file
├── research.md          # Phase 0 output - completed
├── data-model.md        # Phase 1 output - completed
├── quickstart.md        # Phase 1 output - completed
├── contracts/           # Phase 1 output - completed
│   ├── llm-response-contract.ts      # LLM 응답 타입 계약
│   ├── analysis-state-contract.ts    # 분석 상태 계약
│   └── waiting-messages-contract.ts  # 대기 메시지 계약
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```
source/
├── models/
│   ├── analysis.ts            # MODIFY: Add LLM response fields to AnalysisState
│   └── llm-response.ts        # NEW: LLM response type definitions
├── constants/
│   └── waiting-messages.ts    # NEW: Waiting messages collection
├── hooks/
│   └── use-analysis.ts        # MODIFY: Handle LLM response in state updates
├── services/
│   └── ai-service.ts          # MODIFY: Pass LLM response via callback
└── components/
    ├── analysis-progress.tsx      # MODIFY: Display LLM response + waiting message
    ├── analysis-runner.tsx        # MODIFY: Pass new props
    └── llm-response-display.tsx   # NEW: LLM response display component

tests/
├── models/
│   └── llm-response.spec.ts       # NEW: LLM response type tests
├── constants/
│   └── waiting-messages.spec.ts   # NEW: Waiting messages tests
└── components/
    ├── llm-response-display.spec.tsx  # NEW: LLM response display tests
    └── analysis-progress.spec.tsx     # MODIFY: Visual regression tests
```

**Structure Decision**: Single project structure maintained. New `models/llm-response.ts` and `components/llm-response-display.tsx` added for LLM response handling.

## Complexity Tracking

*No violations - simplest approach chosen*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

## Implementation Approach

### Phase 1: Data Model & Contracts ✅

1. **LLMResponseData Type**: LLM 응답 데이터 구조 정의 (text, toolCalls, iteration, timestamp)
2. **AnalysisState Extension**: `lastLLMResponse`, `waitingMessage`, `isWaitingForLLM` 필드 추가
3. **AnalysisProgressCallback Extension**: `llmResponse` 파라미터 추가
4. **WaitingMessagesModule**: 대기 메시지 컬렉션 및 랜덤 선택 함수

### Phase 2: Implementation Tasks (for `/speckit.tasks`)

**Task 1: Create LLM Response Type**
- 파일: `source/models/llm-response.ts`
- `LLMResponseData`, `LLMToolCall` 타입 정의
- 테스트: `tests/models/llm-response.spec.ts`

**Task 2: Create Waiting Messages Module**
- 파일: `source/constants/waiting-messages.ts`
- 유머러스한 대기 메시지 20개 이상 정의
- `getRandomWaitingMessage()` 함수 구현
- 테스트: `tests/constants/waiting-messages.spec.ts`

**Task 3: Extend AnalysisState Type**
- 파일: `source/models/analysis.ts`
- `lastLLMResponse`, `waitingMessage`, `isWaitingForLLM`, `currentIteration` 필드 추가
- 기존 테스트 업데이트

**Task 4: Update AIService**
- 파일: `source/services/ai-service.ts`
- `AnalysisProgressCallback` 타입 확장 (llmResponse 파라미터)
- `analyzePage` 메서드에서:
  - generateText 호출 전: `onProgress('analyzing', waitingMessage, undefined)`
  - generateText 호출 후: `onProgress('analyzing', undefined, llmResponse)`
- 테스트: MockLanguageModelV2 사용

**Task 5: Update useAnalysis Hook**
- 파일: `source/hooks/use-analysis.ts`
- `onProgress` 콜백에서 LLM 응답 및 대기 상태 처리
- 상태 업데이트 로직:
  - `llmResponse` 있으면: `lastLLMResponse` 설정, `isWaitingForLLM: false`
  - `llmResponse` 없으면: `waitingMessage` 설정, `isWaitingForLLM: true`
- 테스트: hook 테스트 업데이트

**Task 6: Create LLMResponseDisplay Component**
- 파일: `source/components/llm-response-display.tsx`
- LLM 텍스트 응답 표시 (truncate 200자)
- Tool calls 목록 표시 (최대 5개)
- Iteration 번호 표시
- 테스트: ink-testing-library 시각 회귀 테스트

**Task 7: Update AnalysisProgress Component**
- 파일: `source/components/analysis-progress.tsx`
- `lastLLMResponse`, `waitingMessage`, `isWaitingForLLM` props 추가
- `LLMResponseDisplay` 컴포넌트 통합
- 대기 중 스피너 + 메시지 표시
- 테스트: ink-testing-library 시각 회귀 테스트

**Task 8: Update AnalysisRunner Component**
- 파일: `source/components/analysis-runner.tsx`
- 새로운 props를 `AnalysisProgress`에 전달
- 테스트: 통합 테스트

## Key Design Decisions

### 1. 직전 LLM Response 표시 (Primary Feature)

**Decision**: 각 iteration 후 `result.text`와 `result.toolCalls`를 UI에 표시

**Rationale**:
- 사용자 핵심 요구사항: "LLM이 무엇을 하고 있는지 알고 싶다"
- `generateText` 결과에서 직접 데이터 추출 가능
- 기존 Manual Agent Loop 패턴 유지

**Data Flow**:
```
generateText() → result.text, result.toolCalls
                        ↓
              onProgress(stage, msg, llmResponse)
                        ↓
              useAnalysis → AnalysisState.lastLLMResponse
                        ↓
              AnalysisProgress → LLMResponseDisplay
```

### 2. 유머러스한 대기 메시지 (Secondary Feature)

**Decision**: LLM 호출 전 유머러스한 메시지 표시, 응답 후 실제 응답으로 교체

**Rationale**:
- 정상 작동 중임을 사용자에게 알림
- `generateText` blocking 동안 사용자 경험 개선
- 스피너 애니메이션으로 진행 중임을 시각적으로 표시

### 3. generateText 유지 vs streamText 전환

**Decision**: `generateText` 유지

**Rationale**:
- 현재 Manual Agent Loop 패턴과 호환성 유지
- `streamText` 전환 시 tool call 처리 로직 재설계 필요
- 핵심 요구사항은 "직전 응답 표시"이며 실시간 스트리밍이 아님
- [AI SDK Manual Agent Loop](https://ai-sdk.dev/cookbook/node/manual-agent-loop) 패턴 준수

### 4. 콜백 확장 방식

**Decision**: 기존 `AnalysisProgressCallback`에 `llmResponse` 파라미터 추가

**Rationale**:
- 최소 변경 원칙
- 기존 호출 코드와 하위 호환성 유지 (optional 파라미터)
- 별도 콜백 추가 대비 복잡도 감소

### 5. 메시지 Truncation

**Decision**: 텍스트 200자, tool calls 5개로 제한

**Rationale**:
- 터미널 UI 공간 제한
- 사용자는 요약만 필요
- 상세 내용은 기존 로그 파일에서 확인 가능

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ⏳ Analyzing with AI                                            │
│ Page 1/3                                                        │
│ https://example.com/dashboard                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 📝 LLM Response (Iteration 3):                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ "I'm analyzing the navigation menu for accessibility        │ │
│ │ issues. The contrast ratio between the text and background  │ │
│ │ appears to be below WCAG AA standards..."                   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ 🔧 Tool Calls:                                                  │
│ • browser_snapshot                                              │
│ • addFinding (severity: high, category: accessibility)          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ ⏳ 🤔 AI is pondering the mysteries of your UI...              │
│ (Shown only when waiting for next LLM response)                │
└─────────────────────────────────────────────────────────────────┘
```

## References

- [AI SDK Manual Agent Loop](https://ai-sdk.dev/cookbook/node/manual-agent-loop)
- [AI SDK Stream Text with Chat Prompt](https://ai-sdk.dev/cookbook/next/stream-text-with-chat-prompt)
- [Ink Documentation](https://github.com/vadimdemedes/ink)
- [Ink UI Components](https://github.com/vadimdemedes/ink-ui)
- Constitution v1.2.0
