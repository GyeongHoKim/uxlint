# Implementation Plan: env-config 리팩토링 - 타입 정의 분리

**Branch**: `cursor/env-config-refactor-and-tests-298b` | **Date**: 2025-01-27 | **Spec**: `specs/004-ux-env-uxlintrc/spec.md`
**Input**: 기존 .env 파일 읽기 로직 분석 및 타입 정의 분리 작업

## Summary

기존 `source/infrastructure/config/env-config.ts` 파일에서 dotenv를 사용한 환경 변수 로딩 로직을 제거하고, 타입 정의만 남기도록 리팩토링합니다. 이는 향후 .uxlintrc 파일에서 AI 설정을 읽도록 변경하기 위한 준비 작업입니다.

**주요 작업:**
1. `.env` 파일에서 사용하는 필드 분석
2. `env-config.ts`에서 dotenv 로딩 로직 제거 (타입 정의만 유지)
3. 파일명을 타입 정의에 맞게 변경 (예: `ai-config-types.ts`)
4. 영향받는 모든 파일의 import 경로 수정
5. 관련 테스트 코드 수정

## Technical Context

**Language/Version**: TypeScript (ES modules)  
**Primary Dependencies**: dotenv (제거 예정), @ai-sdk/*  
**Storage**: N/A (타입 정의만)  
**Testing**: Ava with tsimp  
**Target Platform**: Node.js >=18.18.0  
**Project Type**: CLI tool  
**Performance Goals**: N/A (타입 정의만)  
**Constraints**: MCP 프로토콜 사용으로 인해 stdout/stderr 사용 금지  
**Scale/Scope**: 단일 파일 리팩토링, 영향받는 파일 약 2-3개

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with uxlint Constitution v1.2.0:

**I. Code Quality Gates** (NON-NEGOTIABLE):
- [x] `npm run compile && npm run format && npm run lint` sequence will be run after all code changes
- [x] No linting bypasses (`// eslint-disable-next-line`) planned

**II. Test-First Development** (NON-NEGOTIABLE):
- [x] Tests will be written/updated AFTER implementation (리팩토링이므로 기존 테스트 수정)
- [x] Testing strategy: 기존 테스트 코드의 import 경로 수정 및 타입 사용 확인
- [x] Language model tests use MockLanguageModelV2 from `ai/test` (변경 없음)
- [x] 80% coverage target via c8 (유지)

**III. UX Consistency**:
- [x] N/A (타입 정의만 변경)

**IV. Performance Accountability**:
- [x] N/A (타입 정의만 변경)

**V. Simplicity & Minimalism**:
- [x] 타입 정의만 분리하는 가장 단순한 접근 방식 선택

## 분석 결과

### .env 파일에서 사용하는 필드

다음 환경 변수들이 `env-config.ts`에서 사용됩니다:

1. **UXLINT_AI_PROVIDER** - AI 제공자 선택 (anthropic, openai, ollama, xai, google)
2. **UXLINT_AI_MODEL** - AI 모델 이름 (선택적, provider별 기본값 존재)
3. **UXLINT_ANTHROPIC_API_KEY** - Anthropic API 키 (anthropic provider 사용 시 필수)
4. **UXLINT_OPENAI_API_KEY** - OpenAI API 키 (openai provider 사용 시 필수)
5. **UXLINT_OLLAMA_BASE_URL** - Ollama 서버 URL (ollama provider 사용 시 선택적, 기본값: http://localhost:11434/api)
6. **UXLINT_XAI_API_KEY** - xAI API 키 (xai provider 사용 시 필수)
7. **UXLINT_GOOGLE_API_KEY** - Google API 키 (google provider 사용 시 필수)

### dotenv 사용 위치

1. **`source/infrastructure/config/env-config.ts`** (line 9-12)
   - `import {config as dotenvConfig} from 'dotenv';`
   - `dotenvConfig({quiet: true});`
   - **제거 대상**: 이 파일에서 dotenv 로딩 로직 제거

2. **`source/app.tsx`** (line 2, 21)
   - `import {config as dotenvConfig} from 'dotenv';`
   - `dotenvConfig({quiet: true});`
   - **유지**: app.tsx에서 dotenv 로딩은 유지 (다른 목적으로 사용 가능)

### env-config.ts를 import하는 파일들

1. **`source/cli.tsx`** (line 8, 157)
   - `import {loadEnvConfig} from './infrastructure/config/env-config.js';`
   - `loadEnvConfig();` 호출
   - **수정 필요**: import 경로 변경 및 `loadEnvConfig` 함수 제거로 인한 영향 확인

2. **`source/services/llm-provider.ts`** (line 2, 13)
   - `import {loadEnvConfig} from '../infrastructure/config/env-config.js';`
   - `loadEnvConfig()` 호출
   - **수정 필요**: import 경로 변경 및 `loadEnvConfig` 함수 제거로 인한 영향 확인

### 테스트 파일

- **`tests/services/ai-service.spec.ts`**: `loadEnvConfig`를 직접 사용하지 않지만, `llm-provider.ts`를 통해 간접적으로 사용 가능
- **직접적인 env-config 테스트 파일 없음**: env-config에 대한 단위 테스트가 없으므로 추가 검증 필요

## Project Structure

### Source Code

```
source/
├── infrastructure/
│   └── config/
│       ├── env-config.ts          # [제거] → ai-config-types.ts로 변경
│       └── config-io.ts            # [변경 없음]
├── services/
│   ├── llm-provider.ts             # [수정] import 경로 변경
│   └── ai-service.ts               # [변경 없음]
├── cli.tsx                          # [수정] import 경로 변경, loadEnvConfig 호출 제거
└── app.tsx                          # [변경 없음] dotenv 로딩 유지
```

### Tests

```
tests/
├── services/
│   └── ai-service.spec.ts          # [검증 필요] 간접적으로 영향받을 수 있음
└── infrastructure/
    └── config/
        └── (env-config 테스트 없음) # [추가 검증 필요]
```

## Implementation Steps

### Phase 1: 타입 정의 분리 및 파일명 변경

1. **`env-config.ts` → `ai-config-types.ts`로 파일명 변경**
   - 타입 정의만 남기기:
     - `ProviderType`
     - `AnthropicConfig`
     - `OpenAiConfig`
     - `OllamaConfig`
     - `XaiConfig`
     - `GoogleConfig`
     - `EnvConfig` (union type)
   - 제거할 내용:
     - `dotenv` import 및 `dotenvConfig()` 호출
     - `defaultModels` 상수
     - `loadEnvConfig()` 함수

2. **파일 내용 정리**
   - 타입 정의와 JSDoc 주석만 유지
   - 구현 로직 제거

### Phase 2: Import 경로 수정

1. **`source/cli.tsx`**
   - `import {loadEnvConfig} from './infrastructure/config/env-config.js';` 제거
   - `loadEnvConfig();` 호출 제거 (향후 .uxlintrc에서 읽도록 변경 예정)

2. **`source/services/llm-provider.ts`**
   - `import {loadEnvConfig} from '../infrastructure/config/env-config.js';` 제거
   - `loadEnvConfig()` 호출 제거 (향후 .uxlintrc에서 읽도록 변경 예정)
   - 타입만 필요한 경우: `import type {EnvConfig} from '../infrastructure/config/ai-config-types.js';` 추가

### Phase 3: 테스트 검증

1. **기존 테스트 실행**
   - `npm test` 실행하여 모든 테스트 통과 확인
   - `llm-provider.ts`를 사용하는 테스트 확인

2. **컴파일 및 린트 검증**
   - `npm run compile` - 타입 오류 확인
   - `npm run format` - 포맷팅 적용
   - `npm run lint` - 린트 오류 확인

### Phase 4: 문서 업데이트

1. **CLAUDE.md** (필요시)
   - env-config.ts 참조 제거
   - ai-config-types.ts 참조 추가

## Complexity Tracking

*No violations - simple refactoring task*

## 수정 대상 파일 목록

### 직접 수정 필요

1. ✅ `source/infrastructure/config/env-config.ts` → `ai-config-types.ts`로 변경
2. ✅ `source/cli.tsx` - import 및 `loadEnvConfig()` 호출 제거
3. ✅ `source/services/llm-provider.ts` - import 및 `loadEnvConfig()` 호출 제거

### 검증 필요

1. ✅ `tests/services/ai-service.spec.ts` - 간접 영향 확인
2. ✅ `source/app.tsx` - dotenv 로딩 유지 확인 (변경 없음)

### 참고 파일

1. `.env.example` - 환경 변수 예시 (변경 없음, 향후 .uxlintrc 예시로 대체 예정)
2. `README.md` - 문서 (향후 업데이트 예정)
