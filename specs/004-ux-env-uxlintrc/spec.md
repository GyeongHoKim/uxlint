# Feature Specification: 환경 변수를 .uxlintrc로 통합

**Feature Branch**: `004-ux-env-uxlintrc`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "UX 개선 작업: 사용자가 .env와 .uxlintrc.{json|yml|yaml} 파일을 동시에 관리하는 것이 사용자의 관리 피로도를 높인다. 이 문제를 해결하기 위해 기존 .env에서 관리하던 모든 필드들을 .uxlintrc.{json|yml|yaml}에서 관리할 수 있도록 옮겨야 한다."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 새로운 사용자가 .uxlintrc 파일 하나로 모든 설정 관리 (Priority: P1)

새로운 사용자가 uxlint를 처음 사용할 때, .uxlintrc 파일 하나만 생성하고 관리하여 AI 서비스 설정을 포함한 모든 설정을 한 곳에서 관리할 수 있습니다.

**Why this priority**: 이 기능의 핵심 가치입니다. 사용자 관리 피로도를 줄이는 것이 이 기능의 주요 목표이며, 새로운 사용자 경험이 가장 중요합니다.

**Independent Test**: 사용자가 .uxlintrc 파일만 생성하고 .env 파일 없이 uxlint를 실행하여 정상적으로 AI 서비스를 사용할 수 있는지 테스트할 수 있습니다. 이는 완전히 독립적으로 테스트 가능하며, 사용자가 단일 파일로 모든 설정을 관리할 수 있다는 핵심 가치를 제공합니다.

**Acceptance Scenarios**:

1. **Given** 사용자가 .uxlintrc.json 파일을 생성하고 AI 설정(provider, apiKey 등)을 포함한 모든 설정을 작성했을 때, **When** uxlint를 실행하면, **Then** .env 파일 없이도 정상적으로 AI 서비스를 사용하여 분석이 수행됩니다.
2. **Given** 사용자가 .uxlintrc.yml 파일에 AI 설정을 포함한 모든 설정을 작성했을 때, **When** uxlint를 실행하면, **Then** .env 파일 없이도 정상적으로 동작합니다.
3. **Given** 사용자가 .uxlintrc 파일에 필수 AI 설정(provider, 해당 provider의 apiKey)을 누락했을 때, **When** uxlint를 실행하면, **Then** 명확한 오류 메시지가 표시되어 누락된 설정을 알 수 있습니다.

---

### User Story 2 - 기존 .env 사용자의 마이그레이션 경로 제공 (Priority: P2)

기존에 .env 파일을 사용하던 사용자가 .uxlintrc 파일로 설정을 마이그레이션할 수 있는 명확한 경로를 제공합니다.

**Why this priority**: 기존 사용자 경험을 보호하고 점진적 마이그레이션을 가능하게 합니다. 하지만 새로운 사용자 경험(P1)보다는 낮은 우선순위입니다.

**Independent Test**: 기존 .env 파일이 있는 환경에서 .uxlintrc 파일에 AI 설정을 추가하고 .env 파일을 제거한 후, uxlint가 정상적으로 동작하는지 테스트할 수 있습니다. 이는 독립적으로 테스트 가능하며, 기존 사용자가 마이그레이션할 수 있다는 가치를 제공합니다.

**Acceptance Scenarios**:

1. **Given** 사용자가 기존 .env 파일을 사용 중이고 .uxlintrc 파일에 AI 설정이 없을 때, **When** .uxlintrc 파일에 AI 설정을 추가하고 .env 파일을 제거한 후 uxlint를 실행하면, **Then** .uxlintrc의 설정을 사용하여 정상적으로 동작합니다.
2. **Given** 사용자가 .env와 .uxlintrc 모두에 AI 설정이 있을 때, **When** uxlint를 실행하면, **Then** .uxlintrc의 설정이 우선적으로 사용되고, .env의 설정은 무시됩니다 (또는 명확한 우선순위 메시지가 표시됩니다).

---

### User Story 3 - 설정 검증 및 명확한 오류 메시지 (Priority: P3)

사용자가 .uxlintrc 파일에 AI 설정을 잘못 작성했을 때, 명확하고 도움이 되는 오류 메시지를 제공합니다.

**Why this priority**: 사용자 경험을 개선하지만, 핵심 기능(P1, P2)이 완료된 후에 처리해도 됩니다.

**Independent Test**: 잘못된 설정(예: provider와 apiKey 불일치, 필수 필드 누락)이 포함된 .uxlintrc 파일로 uxlint를 실행하여 적절한 오류 메시지가 표시되는지 테스트할 수 있습니다.

**Acceptance Scenarios**:

1. **Given** 사용자가 .uxlintrc 파일에 provider를 설정했지만 해당 provider에 필요한 인증 정보를 제공하지 않았을 때, **When** uxlint를 실행하면, **Then** 선택한 provider에 필요한 설정이 누락되었다는 명확한 오류 메시지가 표시됩니다.
2. **Given** 사용자가 .uxlintrc 파일에 잘못된 provider 값을 설정했을 때, **When** uxlint를 실행하면, **Then** 지원되는 provider 목록과 함께 명확한 오류 메시지가 표시됩니다.

---

### Edge Cases

- .env 파일이 존재하지만 .uxlintrc 파일에 AI 설정이 있는 경우, 어떤 설정이 우선되는가?
- .uxlintrc 파일에 AI 설정이 부분적으로만 있는 경우(예: provider는 있지만 apiKey가 없음) 어떻게 처리되는가?
- .uxlintrc 파일에 AI 설정이 없고 .env 파일도 없는 경우, 어떤 오류 메시지가 표시되는가?
- .uxlintrc 파일 형식이 잘못된 경우(JSON/YAML 파싱 오류) 어떻게 처리되는가?
- .uxlintrc 파일에 AI 설정이 있지만 값이 빈 문자열이거나 null인 경우 어떻게 처리되는가?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to configure all AI service settings (provider selection, authentication credentials, model selection, and connection settings) in .uxlintrc.{json|yml|yaml} files
- **FR-002**: System MUST read AI service settings from .uxlintrc file when present, without requiring .env file
- **FR-003**: System MUST validate AI service configuration in .uxlintrc file and provide clear error messages when configuration is missing or invalid
- **FR-004**: System MUST support all existing AI providers (anthropic, openai, ollama, xai, google) through .uxlintrc configuration
- **FR-005**: System MUST maintain backward compatibility by supporting .env file as fallback when AI settings are not present in .uxlintrc file
- **FR-006**: System MUST prioritize .uxlintrc configuration over .env configuration when both are present
- **FR-007**: System MUST provide sensible default values for optional AI settings when not specified by the user
- **FR-008**: System MUST validate that required authentication credentials are present for the selected provider before attempting to use AI services

### Key Entities

- **UxLintConfig**: Configuration structure that includes both existing fields (mainPageUrl, subPageUrls, pages, persona, report) and new AI service configuration fields (provider selection, model selection, and provider-specific authentication credentials or connection settings)
- **AI Service Configuration**: Represents the AI provider settings including provider type, model name, API keys, and base URLs that were previously stored in .env file

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can configure and use uxlint with only .uxlintrc file (no .env file required) - 100% of new users should be able to complete setup using only .uxlintrc file
- **SC-002**: Configuration management complexity is reduced - users manage settings in a single file (.uxlintrc) instead of two files (.env and .uxlintrc)
- **SC-003**: Error messages clearly guide users to fix configuration issues - when AI settings are missing or invalid, users receive actionable error messages within 2 seconds of running uxlint
- **SC-004**: Backward compatibility is maintained - existing users with .env files can continue using uxlint without immediate changes, with clear migration path available
- **SC-005**: All AI providers remain fully functional - 100% of supported AI providers (anthropic, openai, ollama, xai, google) work correctly when configured via .uxlintrc file

## Assumptions

- Users are familiar with JSON or YAML file formats (since they already use .uxlintrc files)
- Users prefer managing all configuration in one file rather than splitting between .env and .uxlintrc
- Backward compatibility with .env files is important for existing users but not required for new users
- API keys and sensitive information in .uxlintrc files will be handled with the same security considerations as .env files (users should add .uxlintrc to .gitignore if it contains secrets)
- The .uxlintrc file format (JSON/YAML) can accommodate the new AI configuration fields without breaking existing configuration structure

## Dependencies

- Existing configuration loading infrastructure
- Existing environment configuration loading mechanism
- AI service initialization components
- Configuration validation logic

## Out of Scope

- Automatic migration tool to convert .env settings to .uxlintrc format (users will manually migrate)
- Support for environment variable expansion or templating in .uxlintrc files
- Encryption or obfuscation of API keys in .uxlintrc files
- Multiple .uxlintrc files or configuration inheritance
- Runtime switching between different AI providers without configuration file changes
