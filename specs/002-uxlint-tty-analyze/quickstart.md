# Quickstart: Real-time LLM Response Display in TTY Analyze Mode

**Feature Branch**: `002-uxlint-tty-analyze`
**Date**: 2025-01-27

## Overview

이 기능은 uxlint TTY 모드에서 분석 중 **직전 LLM 응답을 실시간으로 표시**하고, LLM 호출 대기 중에는 **유머러스한 폴백 UI**를 보여줍니다.

### 핵심 기능
1. **직전 LLM Response 표시** (Primary): LLM의 텍스트 응답과 tool calls를 UI에 표시
2. **유머러스한 대기 메시지** (Secondary): LLM 응답 대기 중 정상 작동 중임을 알리는 메시지

## Quick Implementation Guide

### Step 1: Create LLM Response Type

```typescript
// source/models/llm-response.ts
export type LLMToolCall = {
  toolName: string;
  args: Record<string, unknown>;
};

export type LLMResponseData = {
  text?: string;
  toolCalls?: LLMToolCall[];
  finishReason?: string;
  iteration: number;
  timestamp: number;
};
```

### Step 2: Create Waiting Messages Module

```typescript
// source/constants/waiting-messages.ts
export const waitingMessages = [
  '🤔 AI is pondering the mysteries of your UI...',
  '🔍 Examining every pixel with care...',
  '☕ The AI is taking a coffee break... just kidding!',
  // ... more messages
] as const;

export function getRandomWaitingMessage(): string {
  return waitingMessages[Math.floor(Math.random() * waitingMessages.length)]!;
}
```

### Step 3: Extend AnalysisState

```typescript
// source/models/analysis.ts
import type {LLMResponseData} from './llm-response.js';

export type AnalysisState = {
  // ... existing fields
  lastLLMResponse?: LLMResponseData;  // NEW: 직전 LLM 응답
  waitingMessage?: string;             // NEW: 대기 메시지
  isWaitingForLLM?: boolean;           // NEW: LLM 대기 중 여부
  currentIteration?: number;           // NEW: 현재 iteration
};
```

### Step 4: Extend AnalysisProgressCallback

```typescript
// source/services/ai-service.ts
import type {LLMResponseData} from '../models/llm-response.js';

export type AnalysisProgressCallback = (
  stage: AnalysisStage,
  message?: string,
  llmResponse?: LLMResponseData,  // NEW
) => void;
```

### Step 5: Update AIService.analyzePage

```typescript
// source/services/ai-service.ts
import {getRandomWaitingMessage} from '../constants/waiting-messages.js';

// In analyzePage method:
while (iterations < MAX_AGENT_ITERATIONS && !analysisCompleted) {
  iterations++;

  // BEFORE generateText: 대기 메시지 표시
  onProgress?.('analyzing', getRandomWaitingMessage(), undefined);

  const result = await generateText({...});

  // AFTER generateText: LLM 응답 표시
  onProgress?.('analyzing', undefined, {
    text: result.text,
    toolCalls: result.toolCalls?.map(tc => ({
      toolName: tc.toolName,
      args: tc.args,
    })),
    finishReason: result.finishReason,
    iteration: iterations,
    timestamp: Date.now(),
  });

  // ... rest of loop
}
```

### Step 6: Update useAnalysis Hook

```typescript
// source/hooks/use-analysis.ts
const pageAnalysis = await aiService.analyzePage(
  config,
  page,
  (stage: AnalysisStage, message?: string, llmResponse?: LLMResponseData) => {
    updateAnalysisState(previous => ({
      ...previous,
      currentStage: stage,
      // LLM 응답이 있으면 표시, 없으면 대기 상태
      lastLLMResponse: llmResponse ?? previous.lastLLMResponse,
      waitingMessage: llmResponse ? undefined : message,
      isWaitingForLLM: !llmResponse && stage === 'analyzing',
      currentIteration: llmResponse?.iteration ?? previous.currentIteration,
    }));
  },
);
```

### Step 7: Create LLMResponseDisplay Component

```tsx
// source/components/llm-response-display.tsx
import {Box, Text} from 'ink';
import type {LLMResponseData} from '../models/llm-response.js';

export type LLMResponseDisplayProps = {
  readonly response: LLMResponseData;
  readonly maxTextLength?: number;
};

export function LLMResponseDisplay({
  response,
  maxTextLength = 200,
}: LLMResponseDisplayProps) {
  const displayText = response.text && response.text.length > maxTextLength
    ? response.text.slice(0, maxTextLength) + '...'
    : response.text;

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Iteration header */}
      <Text color="cyan" bold>
        📝 LLM Response (Iteration {response.iteration}):
      </Text>

      {/* Text response */}
      {displayText && (
        <Box marginLeft={2} marginTop={1}>
          <Text wrap="wrap">"{displayText}"</Text>
        </Box>
      )}

      {/* Tool calls */}
      {response.toolCalls && response.toolCalls.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">🔧 Tool Calls:</Text>
          {response.toolCalls.slice(0, 5).map((tc, i) => (
            <Box key={i} marginLeft={2}>
              <Text>• {tc.toolName}</Text>
            </Box>
          ))}
          {response.toolCalls.length > 5 && (
            <Box marginLeft={2}>
              <Text dimColor>+{response.toolCalls.length - 5} more...</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
```

### Step 8: Update AnalysisProgress Component

```tsx
// source/components/analysis-progress.tsx
import {LLMResponseDisplay} from './llm-response-display.js';
import Spinner from 'ink-spinner';

export function AnalysisProgress({
  theme,
  stage,
  currentPage,
  totalPages,
  pageUrl,
  error,
  lastLLMResponse,      // NEW
  waitingMessage,       // NEW
  isWaitingForLLM,      // NEW
}: AnalysisProgressProps) {
  return (
    <Box flexDirection="column" gap={1}>
      {/* Existing stage indicator */}
      {/* ... */}

      {/* NEW: LLM Response Display */}
      {lastLLMResponse && stage === 'analyzing' && (
        <LLMResponseDisplay response={lastLLMResponse} />
      )}

      {/* NEW: Waiting message with spinner */}
      {isWaitingForLLM && waitingMessage && (
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" /> {waitingMessage}
          </Text>
        </Box>
      )}
    </Box>
  );
}
```

### Step 9: Update AnalysisRunner Component

```tsx
// source/components/analysis-runner.tsx
<AnalysisProgress
  theme={theme}
  stage={analysisState.currentStage}
  currentPage={analysisState.currentPageIndex + 1}
  totalPages={analysisState.totalPages}
  pageUrl={getCurrentPageUrl()}
  error={analysisState.error?.message}
  lastLLMResponse={analysisState.lastLLMResponse}    // NEW
  waitingMessage={analysisState.waitingMessage}       // NEW
  isWaitingForLLM={analysisState.isWaitingForLLM}    // NEW
/>
```

## Testing

### Unit Test for LLM Response Data

```typescript
// tests/models/llm-response.spec.ts
import test from 'ava';
import type {LLMResponseData} from '../../source/models/llm-response.js';

test('LLMResponseData accepts valid data', t => {
  const response: LLMResponseData = {
    text: 'Analyzing navigation...',
    toolCalls: [{toolName: 'browser_snapshot', args: {}}],
    finishReason: 'tool-calls',
    iteration: 1,
    timestamp: Date.now(),
  };
  t.truthy(response);
});
```

### Visual Regression Test for LLMResponseDisplay

```tsx
// tests/components/llm-response-display.spec.tsx
import test from 'ava';
import {render} from 'ink-testing-library';
import {LLMResponseDisplay} from '../../source/components/llm-response-display.js';

test('displays LLM text response', t => {
  const {lastFrame} = render(
    <LLMResponseDisplay
      response={{
        text: 'Analyzing the page...',
        iteration: 1,
        timestamp: Date.now(),
      }}
    />
  );

  t.true(lastFrame()?.includes('Analyzing the page'));
  t.true(lastFrame()?.includes('Iteration 1'));
});

test('displays tool calls', t => {
  const {lastFrame} = render(
    <LLMResponseDisplay
      response={{
        toolCalls: [{toolName: 'browser_snapshot', args: {}}],
        iteration: 2,
        timestamp: Date.now(),
      }}
    />
  );

  t.true(lastFrame()?.includes('browser_snapshot'));
});
```

## Verification Checklist

- [ ] `npm run compile` passes
- [ ] `npm run format` applied
- [ ] `npm run lint` passes
- [ ] All tests pass
- [ ] **직전 LLM 응답이 UI에 표시됨** (핵심)
- [ ] Tool calls가 표시됨
- [ ] 대기 중 유머러스한 메시지 표시됨
- [ ] 스피너 애니메이션 작동

## Key Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `source/models/llm-response.ts` | NEW | LLM 응답 타입 정의 |
| `source/constants/waiting-messages.ts` | NEW | 대기 메시지 컬렉션 |
| `source/models/analysis.ts` | MODIFY | AnalysisState 확장 |
| `source/services/ai-service.ts` | MODIFY | 콜백에 LLM 응답 전달 |
| `source/hooks/use-analysis.ts` | MODIFY | 상태 업데이트 로직 |
| `source/components/llm-response-display.tsx` | NEW | LLM 응답 표시 컴포넌트 |
| `source/components/analysis-progress.tsx` | MODIFY | LLM 응답 영역 추가 |
| `source/components/analysis-runner.tsx` | MODIFY | props 전달 |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     TTY Mode Flow                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AIService.analyzePage()                                         │
│       │                                                          │
│       │ ┌─────────────────────────────────────────────────────┐ │
│       │ │ LOOP: while (iterations < MAX)                      │ │
│       │ │                                                     │ │
│       │ │  1. onProgress('analyzing', waitingMsg, undefined)  │ │
│       │ │     └─► UI shows: "🤔 AI is pondering..."          │ │
│       │ │                                                     │ │
│       │ │  2. result = await generateText({...})             │ │
│       │ │     [blocking - user sees waiting message]          │ │
│       │ │                                                     │ │
│       │ │  3. onProgress('analyzing', undefined, {            │ │
│       │ │       text: result.text,                            │ │
│       │ │       toolCalls: result.toolCalls,                  │ │
│       │ │       iteration: N                                  │ │
│       │ │     })                                              │ │
│       │ │     └─► UI shows: LLM response + tool calls        │ │
│       │ │                                                     │ │
│       │ └─────────────────────────────────────────────────────┘ │
│       │                                                          │
│       ▼                                                          │
│  useAnalysis.updateAnalysisState()                               │
│       │                                                          │
│       ▼                                                          │
│  AnalysisProgress                                                │
│       │                                                          │
│       ├─► LLMResponseDisplay (직전 LLM 응답)                     │
│       └─► Waiting Message + Spinner (대기 중)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## References

- [AI SDK Manual Agent Loop](https://ai-sdk.dev/cookbook/node/manual-agent-loop)
- [Ink Documentation](https://github.com/vadimdemedes/ink)
- Constitution v1.2.0 (Code Quality Gates, Test-First Development)
