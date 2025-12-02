# Feature Specification: CLI State Machine Refactor

**Feature Branch**: `001-readme-md-uxlint`  
**Created**: 2025-12-02  
**Status**: Draft  
**Input**: User description: "@README.md 에 업데이트한 uxlint CLI State Machine을 따르도록 기존 플로우를 바꿔야 한다."

## Overview

README.md에 정의된 CLI State Machine을 구현하여 기존의 모드 결정 로직을 개선한다. 현재 구현은 `--interactive` 플래그와 설정 파일 존재 여부를 복합적으로 판단하지만, 새로운 상태 머신은 `--interactive` 플래그를 TTY/CI 분기의 명시적인 결정 기준으로 사용한다.

### Current vs Target Flow Comparison

**현재 플로우:**
- config 존재 + interactive 미요청 → analysis 모드
- interactive 요청 OR config 없음 → interactive 모드
- 나머지 → normal 모드

**타겟 플로우 (State Machine):**
```
IDLE → (--interactive 플래그 확인)
├── TTY (--interactive 있음)
│   ├── Wizard (uxlintrc 없음) → AnalyzeWithUI
│   └── AnalyzeWithUI (uxlintrc 있음)
└── CI (--interactive 없음)
    ├── AnalyzeWithoutUI (uxlintrc 있음)
    └── Error (uxlintrc 없음)
```

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Interactive Mode with Wizard (Priority: P1)

사용자가 `--interactive` 플래그와 함께 uxlint를 실행하고, 설정 파일이 없는 경우 Wizard를 통해 설정을 생성한 후 분석을 수행한다.

**Why this priority**: Interactive Wizard는 신규 사용자의 첫 진입점으로, 설정 없이도 UX 분석을 시작할 수 있게 해주는 핵심 기능이다.

**Independent Test**: Wizard 완료 후 AnalyzeWithUI가 자동으로 시작되어 리포트가 생성되는지 확인

**Acceptance Scenarios**:

1. **Given** 사용자가 uxlintrc 파일이 없는 디렉토리에 있고, **When** `uxlint --interactive`를 실행하면, **Then** ConfigWizard가 표시된다
2. **Given** ConfigWizard가 완료되고, **When** 설정이 생성되면, **Then** AnalyzeWithUI가 자동으로 시작된다
3. **Given** AnalyzeWithUI가 실행 중이고, **When** 분석이 완료되면, **Then** UX 리포트가 지정된 경로에 생성된다

---

### User Story 2 - Interactive Mode with Existing Config (Priority: P2)

사용자가 `--interactive` 플래그와 함께 uxlint를 실행하고, 설정 파일이 이미 있는 경우 Wizard를 건너뛰고 바로 분석을 수행한다.

**Why this priority**: 기존 설정을 가진 사용자가 interactive 모드에서 분석을 수행하는 일반적인 시나리오이다.

**Independent Test**: 설정 파일이 있는 상태에서 `--interactive` 플래그로 실행 시 Wizard 없이 AnalyzeWithUI가 시작되는지 확인

**Acceptance Scenarios**:

1. **Given** 사용자가 유효한 uxlintrc 파일이 있는 디렉토리에 있고, **When** `uxlint --interactive`를 실행하면, **Then** Wizard를 건너뛰고 AnalyzeWithUI가 바로 시작된다
2. **Given** AnalyzeWithUI가 실행 중이고, **When** 분석 중 진행 상태가 업데이트되면, **Then** UI에 진행률이 표시된다

---

### User Story 3 - CI Mode with Existing Config (Priority: P2)

사용자가 `--interactive` 플래그 없이 uxlint를 실행하고, 설정 파일이 있는 경우 UI 없이 분석을 수행한다.

**Why this priority**: CI/CD 파이프라인 등 headless 환경에서의 자동화된 분석을 지원하는 핵심 기능이다.

**Independent Test**: 설정 파일이 있는 상태에서 `--interactive` 없이 실행 시 UI 없이 분석이 수행되는지 확인

**Acceptance Scenarios**:

1. **Given** 사용자가 유효한 uxlintrc 파일이 있는 디렉토리에 있고, **When** `uxlint`를 실행하면 (--interactive 없이), **Then** AnalyzeWithoutUI가 시작된다
2. **Given** AnalyzeWithoutUI가 실행 중이고, **When** 분석이 완료되면, **Then** UX 리포트가 생성되고 프로세스가 종료된다
3. **Given** CI 환경에서 실행 중이고, **When** 분석이 성공하면, **Then** exit code 0으로 종료된다

---

### User Story 4 - CI Mode Error on Missing Config (Priority: P3)

사용자가 `--interactive` 플래그 없이 uxlint를 실행하고, 설정 파일이 없는 경우 에러를 표시한다.

**Why this priority**: CI 환경에서 설정 없이 실행되는 것을 방지하여 예측 가능한 동작을 보장한다.

**Independent Test**: 설정 파일이 없는 상태에서 `--interactive` 없이 실행 시 에러 메시지와 함께 종료되는지 확인

**Acceptance Scenarios**:

1. **Given** 사용자가 uxlintrc 파일이 없는 디렉토리에 있고, **When** `uxlint`를 실행하면 (--interactive 없이), **Then** 에러 메시지가 표시되고 프로세스가 종료된다
2. **Given** CI 모드에서 설정 파일이 없고, **When** 에러가 발생하면, **Then** exit code 1로 종료된다
3. **Given** 에러 메시지가 표시되고, **When** 사용자가 메시지를 읽으면, **Then** `--interactive` 플래그 사용을 안내받는다

---

### Edge Cases

- 설정 파일이 잘못된 형식일 때: 에러 메시지와 함께 파싱 오류를 표시하고 종료
- 환경 변수(API 키 등)가 설정되지 않았을 때: 분석 시작 전 에러 메시지 표시
- Wizard 진행 중 사용자가 취소할 때: 분석 없이 정상 종료 (exit code 0)
- 분석 도중 네트워크 오류 발생 시: 적절한 에러 메시지와 함께 종료

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 시스템은 `--interactive` 플래그 존재 여부를 기준으로 TTY/CI 분기를 결정해야 한다 (MUST)
- **FR-002**: TTY 분기에서 uxlintrc 파일이 없으면 ConfigWizard를 표시해야 한다 (MUST)
- **FR-003**: TTY 분기에서 ConfigWizard 완료 후 AnalyzeWithUI를 자동으로 시작해야 한다 (MUST)
- **FR-004**: TTY 분기에서 uxlintrc 파일이 있으면 Wizard를 건너뛰고 AnalyzeWithUI를 시작해야 한다 (MUST)
- **FR-005**: CI 분기에서 uxlintrc 파일이 있으면 AnalyzeWithoutUI를 실행해야 한다 (MUST)
- **FR-006**: CI 분기에서 uxlintrc 파일이 없으면 에러를 표시하고 종료해야 한다 (MUST)
- **FR-007**: AnalyzeWithUI는 진행률과 상태 정보를 UI로 표시해야 한다 (MUST)
- **FR-008**: AnalyzeWithoutUI는 UI 출력 없이 분석을 수행해야 한다 (MUST)
- **FR-009**: 에러 상황에서는 적절한 에러 메시지와 함께 비정상 종료 코드를 반환해야 한다 (MUST)
- **FR-010**: 기존 `normal` 모드는 새 상태 머신에서 제거되어야 한다 (MUST)

### Key Entities

- **CliState**: CLI의 현재 상태를 나타내는 엔티티 (IDLE, TTY, CI, Wizard, AnalyzeWithUI, AnalyzeWithoutUI, Error, ReportBuilder)
- **UxLintConfig**: 분석에 필요한 설정 정보 (mainPageUrl, subPageUrls, pages, persona, report)
- **UxReport**: 분석 결과 리포트 엔티티

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `--interactive` 플래그가 있으면 100% TTY 분기로 진입한다
- **SC-002**: `--interactive` 플래그가 없으면 100% CI 분기로 진입한다
- **SC-003**: CI 분기에서 설정 파일 없이 실행 시 100% 에러로 종료한다
- **SC-004**: TTY 분기에서 설정 파일 없이 실행 시 100% Wizard가 시작된다
- **SC-005**: 모든 분석 완료 후 리포트가 지정된 경로에 생성된다
- **SC-006**: 에러 상황에서는 사용자가 이해할 수 있는 메시지가 제공된다
- **SC-007**: 기존 테스트 케이스 중 새 상태 머신과 관련 없는 테스트는 그대로 통과한다

## Assumptions

- TTY/CI 분기의 구분은 `--interactive` 플래그 유무로만 결정되며, `process.stdout.isTTY` 값은 사용하지 않는다
- AnalyzeWithUI와 AnalyzeWithoutUI의 핵심 분석 로직은 동일하며, UI 출력 여부만 다르다
- 기존 `normal` 모드의 기능은 새 상태 머신에서 더 이상 필요하지 않다
- ConfigWizard 완료 후 생성된 설정은 즉시 분석에 사용된다

## Out of Scope

- `process.stdout.isTTY`를 사용한 자동 TTY 감지 기능
- Wizard 완료 후 분석을 건너뛰는 옵션
- CI 모드에서의 진행률 로깅 (stdout으로 출력하는 간단한 로그 제외)
