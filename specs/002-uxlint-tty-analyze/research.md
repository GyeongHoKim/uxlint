# Research: Real-time LLM Response Display in TTY Analyze Mode

**Date**: 2025-01-27
**Feature Branch**: `002-uxlint-tty-analyze`

## Research Summary

### 1. 핵심 요구사항 재정의

**Primary Requirement**: 직전 LLM response를 UI에 실시간 표시
**Secondary Requirement**: 유머러스한 폴백 UI + 애니메이션 아이콘 (정상 작동 중 표시)

**Rationale**:
- 사용자의 핵심 불만: "LLM이 무엇을 하고 있는지 알 수 없음"
- 해결책: LLM 응답(text, tool calls)을 직접 보여줌
- 폴백 UI: LLM 응답 대기 중 "정상 작동 중"임을 알리는 보조 역할

### 2. Current Architecture Analysis

**Decision**: `generateText` 유지 + LLM response를 콜백으로 UI에 전달

**Rationale**:
- 현재 `AIService.analyzePage`는 `generateText`를 사용하는 blocking 방식
- [AI SDK Manual Agent Loop 패턴](https://ai-sdk.dev/cookbook/node/manual-agent-loop)을 따름
- 각 iteration 후 `result.text`와 `result.toolCalls`를 UI에 전달 가능

**Current Flow**:
```typescript
const result = await generateText({...});
// result.text: LLM의 텍스트 응답
// result.toolCalls: LLM이 호출한 도구들
// result.finishReason: 'stop' | 'tool-calls' | ...
```

### 3. LLM Response Data Structure

**Decision**: LLM 응답 데이터를 구조화하여 UI에 전달

**Key Data Points from `generateText` result**:
1. `result.text`: LLM의 텍스트 응답 (사용자에게 표시)
2. `result.toolCalls`: 호출된 도구 목록 (도구 이름, 인자 표시)
3. `result.finishReason`: 종료 사유 (상태 표시)
4. `result.usage`: 토큰 사용량 (선택적 표시)

**UI Display Strategy**:
- **Text Response**: LLM이 생성한 텍스트 전체 또는 요약 표시
- **Tool Calls**: 도구 이름과 간략한 설명 표시 (예: "🔧 browser_navigate → https://...")
- **Waiting State**: 다음 LLM 호출 대기 중 유머러스한 메시지 + 스피너

### 4. Progress Callback Extension

**Decision**: `AnalysisProgressCallback` 타입 확장하여 LLM 응답 데이터 전달

**Current Type**:
```typescript
export type AnalysisProgressCallback = (
  stage: AnalysisStage,
  message?: string,
) => void;
```

**Proposed Extension** (Option A - 콜백 확장):
```typescript
export type LLMResponseData = {
  text?: string;
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
  }>;
  finishReason?: string;
  iteration: number;
};

export type AnalysisProgressCallback = (
  stage: AnalysisStage,
  message?: string,
  llmResponse?: LLMResponseData,
) => void;
```

**Alternative** (Option B - 별도 콜백):
```typescript
export type LLMResponseCallback = (response: LLMResponseData) => void;

// analyzePage 시그니처 변경
async analyzePage(
  config: UxLintConfig,
  page: Page,
  onProgress?: AnalysisProgressCallback,
  onLLMResponse?: LLMResponseCallback,  // NEW
): Promise<PageAnalysis>
```

**Selected**: Option A (기존 콜백 확장) - 최소 변경 원칙

### 5. UI Display Components

**Decision**: `AnalysisProgress` 컴포넌트에 LLM 응답 표시 영역 추가

**UI Layout**:
```
┌─────────────────────────────────────────────────────────┐
│ ⏳ Analyzing with AI                                    │
│ Page 1/3 - https://example.com                          │
├─────────────────────────────────────────────────────────┤
│ 💬 LLM Response (Iteration 3):                          │
│ "I'm analyzing the navigation menu for accessibility    │
│ issues. The contrast ratio appears to be..."            │
├─────────────────────────────────────────────────────────┤
│ 🔧 Tool Calls:                                          │
│ • browser_snapshot                                      │
│ • addFinding (severity: high)                           │
├─────────────────────────────────────────────────────────┤
│ 🤔 Thinking... (AI is pondering the mysteries of UX)   │
└─────────────────────────────────────────────────────────┘
```

### 6. Waiting Messages (Secondary Feature)

**Decision**: LLM 응답 대기 중 유머러스한 메시지 표시

**Purpose**:
- 정상 작동 중임을 사용자에게 알림
- 긴 대기 시간 동안 사용자 경험 개선

**Implementation**:
- LLM 호출 전: 유머러스한 대기 메시지 표시
- LLM 응답 후: 실제 응답으로 교체

**Sample Messages**:
```typescript
const waitingMessages = [
  "🤔 AI is pondering the mysteries of your UI...",
  "🔍 Examining every pixel with care...",
  "☕ The AI is taking a coffee break... just kidding!",
  // ... more
];
```

### 7. AnalysisState Extension

**Decision**: `AnalysisState` 타입에 LLM 응답 데이터 필드 추가

**Proposed Extension**:
```typescript
export type AnalysisState = {
  currentPageIndex: number;
  totalPages: number;
  currentStage: AnalysisStage;
  analyses: PageAnalysis[];
  error?: Error;

  // NEW: LLM 응답 관련 필드
  lastLLMResponse?: LLMResponseData;
  waitingMessage?: string;
  currentIteration?: number;
};
```

### 8. Message Truncation Strategy

**Decision**: 긴 LLM 응답은 truncate하고 전체 내용은 로그에 기록

**Rationale**:
- 터미널 UI 공간 제한
- 사용자는 요약만 필요, 상세 내용은 로그 파일에서 확인 가능

**Implementation**:
```typescript
const MAX_DISPLAY_LENGTH = 200;
const displayText = text.length > MAX_DISPLAY_LENGTH
  ? text.slice(0, MAX_DISPLAY_LENGTH) + '...'
  : text;
```

## Technical Decisions Summary

| Area | Decision | Rationale |
|------|----------|-----------|
| LLM 호출 방식 | `generateText` 유지 | Manual Agent Loop 패턴 호환성 |
| 핵심 기능 | **직전 LLM response 표시** | 사용자 핵심 요구사항 |
| 보조 기능 | 유머러스한 대기 메시지 | 정상 작동 표시, UX 개선 |
| 콜백 확장 | `AnalysisProgressCallback`에 `llmResponse` 추가 | 최소 변경 |
| 상태 관리 | `AnalysisState`에 `lastLLMResponse` 추가 | UI 연동 |
| 메시지 길이 | 200자 truncate | 터미널 공간 제한 |

## References

- [AI SDK Manual Agent Loop](https://ai-sdk.dev/cookbook/node/manual-agent-loop)
- [AI SDK Stream Text with Chat Prompt](https://ai-sdk.dev/cookbook/next/stream-text-with-chat-prompt)
- [Ink UI Spinner](https://github.com/vadimdemedes/ink-ui)
- [Ink Documentation](https://github.com/vadimdemedes/ink)
