# Data Model: Real-time LLM Response Display in TTY Analyze Mode

**Date**: 2025-01-27
**Feature Branch**: `002-uxlint-tty-analyze`

## Entity Definitions

### 1. LLMResponseData (NEW)

LLM 응답 데이터를 나타내는 타입. UI에 표시할 정보를 포함.

```typescript
/**
 * Represents LLM response data to be displayed in the UI
 */
export type LLMResponseData = {
  /**
   * LLM's text response (may be empty if only tool calls)
   */
  text?: string;

  /**
   * Tool calls made by the LLM
   */
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
  }>;

  /**
   * Reason for completion ('stop', 'tool-calls', etc.)
   */
  finishReason?: string;

  /**
   * Current iteration number in the agent loop
   */
  iteration: number;

  /**
   * Timestamp when response was received
   */
  timestamp: number;
};
```

### 2. AnalysisState (Extended)

현재 분석 진행 상태를 나타내는 타입. LLM 응답 데이터 필드가 추가됨.

```typescript
export type AnalysisState = {
  /**
   * Index of currently processing page (0-based)
   */
  currentPageIndex: number;

  /**
   * Total number of pages to analyze
   */
  totalPages: number;

  /**
   * Current processing stage
   */
  currentStage: AnalysisStage;

  /**
   * Completed/failed analyses (accumulates)
   */
  analyses: PageAnalysis[];

  /**
   * Fatal error that aborts entire analysis
   */
  error?: Error;

  /**
   * NEW: Last LLM response data for UI display
   * Contains text, tool calls, and metadata from the most recent LLM call
   */
  lastLLMResponse?: LLMResponseData;

  /**
   * NEW: Waiting message to display during LLM call
   * Humorous/informative message shown while waiting for response
   */
  waitingMessage?: string;

  /**
   * NEW: Current iteration in the agent loop
   */
  currentIteration?: number;

  /**
   * NEW: Whether currently waiting for LLM response
   */
  isWaitingForLLM?: boolean;
};
```

**Changes from current**:
- Added `lastLLMResponse?: LLMResponseData`
- Added `waitingMessage?: string`
- Added `currentIteration?: number`
- Added `isWaitingForLLM?: boolean`

### 3. AnalysisProgressCallback (Extended)

분석 진행 콜백 타입. LLM 응답 데이터를 전달할 수 있도록 확장.

```typescript
/**
 * Extended callback type for analysis progress with LLM response support
 */
export type AnalysisProgressCallback = (
  stage: AnalysisStage,
  message?: string,
  llmResponse?: LLMResponseData,
) => void;
```

**Changes from current**:
- Added optional `llmResponse` parameter

### 4. AnalysisProgressProps (Extended)

`AnalysisProgress` 컴포넌트의 props 타입. LLM 응답 표시를 위한 props 추가.

```typescript
export type AnalysisProgressProps = {
  /** Theme for styling */
  readonly theme: ThemeConfig;

  /** Current analysis stage */
  readonly stage: AnalysisStage;

  /** Current page index (1-based) */
  readonly currentPage: number;

  /** Total number of pages */
  readonly totalPages: number;

  /** Optional page URL being analyzed */
  readonly pageUrl?: string;

  /** Optional error message */
  readonly error?: string;

  /**
   * NEW: Last LLM response to display
   */
  readonly lastLLMResponse?: LLMResponseData;

  /**
   * NEW: Waiting message during LLM call
   */
  readonly waitingMessage?: string;

  /**
   * NEW: Whether currently waiting for LLM response
   */
  readonly isWaitingForLLM?: boolean;

  /**
   * NEW: Current iteration number
   */
  readonly currentIteration?: number;
};
```

### 5. WaitingMessage (Unchanged)

대기 중 표시할 메시지를 나타내는 타입.

```typescript
/**
 * A humorous or informative message displayed while waiting for LLM response
 */
export type WaitingMessage = string;

/**
 * Waiting messages module interface
 */
export interface WaitingMessagesModule {
  readonly messages: readonly WaitingMessage[];
  getRandomMessage(): WaitingMessage;
}
```

## State Transitions

### Analysis Stage Flow with LLM Response Display

```
┌─────────────────────────────────────────────────────────────────┐
│                    tty.analyzeWithUI State                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐                                                   │
│  │   idle   │                                                   │
│  └────┬─────┘                                                   │
│       │ runAnalysis()                                           │
│       ▼                                                         │
│  ┌──────────────┐                                               │
│  │  navigating  │  "Navigating to page..."                      │
│  └──────┬───────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │  analyzing   │◄─────────────────────────────────────┐        │
│  │              │                                       │        │
│  │  ┌─────────────────────────────────────────────┐    │        │
│  │  │ BEFORE generateText():                      │    │        │
│  │  │ • isWaitingForLLM: true                     │    │        │
│  │  │ • waitingMessage: "🤔 AI is pondering..."   │    │        │
│  │  └─────────────────────────────────────────────┘    │        │
│  │              │                                       │        │
│  │              ▼ await generateText()                  │        │
│  │              │                                       │        │
│  │  ┌─────────────────────────────────────────────┐    │        │
│  │  │ AFTER generateText():                       │    │        │
│  │  │ • isWaitingForLLM: false                    │    │        │
│  │  │ • lastLLMResponse: {text, toolCalls, ...}   │────┘        │
│  │  │ • currentIteration: N                       │ (loop)      │
│  │  └─────────────────────────────────────────────┘             │
│  │                                                              │
│  └──────┬───────┘                                               │
│         │ analysis complete                                      │
│         ▼                                                        │
│  ┌───────────────────┐                                          │
│  │ generating-report │                                          │
│  └─────────┬─────────┘                                          │
│            │                                                     │
│            ▼                                                     │
│  ┌──────────────┐                                               │
│  │   complete   │                                               │
│  └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Message Update Flow (Detailed)

```
AIService.analyzePage()
    │
    │ while (iterations < MAX && !completed)
    │     │
    │     ├─ STEP 1: Before LLM Call
    │     │   onProgress?.('analyzing', randomMessage, undefined)
    │     │         │
    │     │         ▼
    │     │   useAnalysis.updateAnalysisState()
    │     │         │
    │     │         ├─ isWaitingForLLM: true
    │     │         ├─ waitingMessage: "🤔 AI is pondering..."
    │     │         └─ lastLLMResponse: (preserved from previous)
    │     │
    │     ├─ STEP 2: LLM Call (blocking)
    │     │   const result = await generateText({...})
    │     │
    │     ├─ STEP 3: After LLM Call
    │     │   onProgress?.('analyzing', undefined, {
    │     │     text: result.text,
    │     │     toolCalls: result.toolCalls,
    │     │     finishReason: result.finishReason,
    │     │     iteration: iterations,
    │     │     timestamp: Date.now()
    │     │   })
    │     │         │
    │     │         ▼
    │     │   useAnalysis.updateAnalysisState()
    │     │         │
    │     │         ├─ isWaitingForLLM: false
    │     │         ├─ lastLLMResponse: { text, toolCalls, ... }
    │     │         └─ currentIteration: N
    │     │                   │
    │     │                   ▼
    │     │           AnalysisProgress renders
    │     │                   │
    │     │                   └─ Shows: LLM response text + tool calls
    │     │
    │     └─ (continue loop or break)
    │
    └─ onProgress?.('complete')
```

## UI Component Layout

### AnalysisProgress Component Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ [Spinner] Analyzing with AI                                     │
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
│ [Spinner] 🤔 AI is pondering the mysteries of your UI...       │
│ (Shown only when isWaitingForLLM === true)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Validation Rules

### LLMResponseData Validation

| Field | Rule | Error Message |
|-------|------|---------------|
| text | Optional, max 10000 chars | "LLM response text too long" |
| toolCalls | Optional array | N/A |
| toolCalls[].toolName | Non-empty string | "Tool name required" |
| iteration | Positive integer | "Invalid iteration number" |
| timestamp | Valid timestamp | "Invalid timestamp" |

### Display Truncation Rules

| Field | Max Display Length | Truncation Indicator |
|-------|-------------------|---------------------|
| text | 200 characters | "..." |
| toolCalls | 5 items | "+N more..." |
| toolName | 30 characters | "..." |

## File Structure

```
source/
├── models/
│   ├── analysis.ts              # AnalysisState, LLMResponseData types (modified)
│   └── llm-response.ts          # NEW: LLM response type definitions
├── constants/
│   └── waiting-messages.ts      # NEW: Waiting messages collection
├── hooks/
│   └── use-analysis.ts          # useAnalysis hook (modified)
├── services/
│   └── ai-service.ts            # AIService, AnalysisProgressCallback (modified)
└── components/
    ├── analysis-progress.tsx    # AnalysisProgress (modified)
    ├── analysis-runner.tsx      # AnalysisRunner (modified)
    └── llm-response-display.tsx # NEW: LLM response display component
```

## Relationships

```
┌─────────────────────┐
│    AIService        │
│  (ai-service.ts)    │
└─────────┬───────────┘
          │ generates
          ▼
┌─────────────────────┐     ┌─────────────────────┐
│  LLMResponseData    │     │  waitingMessages    │
│ (llm-response.ts)   │     │ (waiting-messages)  │
└─────────┬───────────┘     └─────────┬───────────┘
          │                           │
          │ passed via onProgress     │
          ▼                           ▼
┌─────────────────────────────────────────────────┐
│                  useAnalysis                     │
│               (use-analysis.ts)                  │
└─────────────────────┬───────────────────────────┘
                      │ updates state with
                      ▼
┌─────────────────────────────────────────────────┐
│                 AnalysisState                    │
│               (analysis.ts)                      │
│  • lastLLMResponse: LLMResponseData             │
│  • waitingMessage: string                        │
│  • isWaitingForLLM: boolean                     │
└─────────────────────┬───────────────────────────┘
                      │ passed to
                      ▼
┌─────────────────────────────────────────────────┐
│              AnalysisProgress                    │
│          (analysis-progress.tsx)                 │
│                      │                           │
│                      ▼                           │
│         ┌─────────────────────┐                 │
│         │ LLMResponseDisplay  │                 │
│         │(llm-response-display)│                │
│         └─────────────────────┘                 │
└─────────────────────────────────────────────────┘
```
