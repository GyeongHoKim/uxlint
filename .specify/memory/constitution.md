<!--
Sync Impact Report:
Version: 1.2.0 → 1.2.1 (PATCH - Corrected AI SDK mock provider version from V3 to V2 to match AI SDK 5.x)

Modified principles:
  - II. Test-First Development → Corrected language model testing guidance to use MockLanguageModelV2 (AI SDK 5.x standard)

Added sections: None

Removed sections: None

Templates requiring updates:
  ✅ .specify/memory/constitution.md - Updated examples to use MockLanguageModelV2
  ✅ .specify/templates/plan-template.md - Updated to reference MockLanguageModelV2
  ✅ .specify/templates/spec-template.md - Updated to reference MockLanguageModelV2
  ✅ .specify/templates/tasks-template.md - Updated to reference MockLanguageModelV2
  ✅ specs/002-uxlint-tty-analyze/tasks.md - Updated to reference MockLanguageModelV2
  ✅ specs/002-uxlint-tty-analyze/plan.md - Updated to reference MockLanguageModelV2
  ✅ specs/001-readme-md-uxlint/tasks.md - Updated to reference MockLanguageModelV2
  ✅ specs/001-readme-md-uxlint/plan.md - Updated to reference MockLanguageModelV2

Follow-up TODOs: None
-->

# uxlint Project Constitution

## Core Principles

### I. Code Quality Gates (NON-NEGOTIABLE)

Every code change MUST pass all three quality checks in sequence after modification or creation:
1. `npm run compile` — TypeScript type-checking with zero errors
2. `npm run format` — Prettier formatting applied consistently
3. `npm run lint` — XO linting with zero violations

**Execution Order**: MUST run compile → format → lint in that exact sequence.

**Rationale**: These gates prevent technical debt accumulation and ensure codebase consistency. The compile-format-lint sequence catches errors progressively from type safety to formatting to style rules, making issues easier to isolate and fix. Running format before lint prevents formatting-related linting violations.

### II. Test-First Development (NON-NEGOTIABLE)

Test-Driven Development is mandatory for all features with specific strategies:

**Testing Strategies**:
- **Models** (pure TypeScript classes/functions): Unit tests using Ava
- **Components** (React/Ink UI): Visual regression tests using ink-testing-library
- **Language Model Integrations**: Mock-based tests using AI SDK test helpers (see Testing Language Models section)
- Tests written and user-approved BEFORE implementation begins
- Tests MUST fail initially (red phase)
- Implementation proceeds to make tests pass (green phase)
- Refactoring follows with tests ensuring stability
- Coverage threshold: minimum 80% via c8

**Rationale**: TDD ensures requirements are testable, reduces defects, and creates living documentation. Pre-approved failing tests validate understanding before effort is invested in implementation. Separating unit, visual regression, and language model mock tests ensures appropriate testing approaches for business logic, UI behavior, and AI integrations.

### III. UX Consistency via Persona-First Design

All user-facing features MUST be evaluated against defined personas and leverage appropriate Ink ecosystem libraries:

**Persona Requirements**:
- Every feature spec MUST reference at least one target persona
- UX changes MUST consider persona goals, constraints, and devices
- Terminal UI patterns MUST align with persona workflows (e.g., mobile-first users prefer concise output)

**Library Discovery** (for Ink-based features):
- When adding features or refactoring, AI agents MUST search for relevant Ink ecosystem libraries using GitHub MCP tools
- Prefer established Ink community libraries over custom implementations
- Document library choices in feature specs with rationale

**Rationale**: Persona-first design ensures features solve real user problems. For CLI tools built with Ink, leveraging the ecosystem prevents reinventing terminal UI patterns and maintains consistency with community standards. GitHub MCP tool usage ensures agents discover maintained, well-tested libraries.

### IV. Performance Accountability

All features MUST define measurable performance goals:
- Goals MUST be specific to the domain (e.g., CLI response time, report generation speed)
- Baseline metrics captured before optimization
- Performance regressions blocked in code review

**Rationale**: Explicit performance goals prevent gradual degradation and enable objective optimization decisions. Domain-specific metrics reflect actual user impact rather than generic benchmarks.

### V. Simplicity & Minimalism

Complexity MUST be justified before introduction:
- Default to the simplest solution that meets requirements
- Additional abstractions require explicit rationale
- YAGNI (You Aren't Gonna Need It) principles enforced
- Complexity violations tracked in plan.md Complexity Tracking table

**Rationale**: Premature abstraction creates maintenance burden. By requiring justification for complexity, we ensure every abstraction earns its place with clear benefits that outweigh its costs.

## Code Quality Standards

**TypeScript Configuration**:
- Extends `@sindresorhus/tsconfig` with strict mode enabled
- ES modules only (`"type": "module"`)
- React JSX transform for Ink components

**Linting & Formatting**:
- XO with React config and Prettier integration
- No bypassing via `// eslint-disable-next-line` or config modifications
- EditorConfig enforces consistent editor settings

**Testing Requirements**:
- Ava for unit and snapshot tests
- @testing-library/react-hooks for custom hooks testing
- c8 for coverage reporting (80% minimum)
- ink-testing-library for component snapshot testing
- AI SDK test helpers for language model testing

### Testing Language Models

Language model integrations MUST use mock-based testing to ensure deterministic, fast, and cost-effective tests:

**Required Approach**:
- Import test helpers from `ai/test`: `MockLanguageModelV2`, `simulateReadableStream`, `mockId`, `mockValues`
- Use `MockLanguageModelV2` to mock language model responses in unit tests (AI SDK 5.x standard)
- Control output with `doGenerate` for synchronous calls or `doStream` for streaming responses
- Test both success and failure scenarios without calling actual LLM providers

**Rationale**: Language models are non-deterministic, slow, and expensive to call. Mock providers enable repeatable, deterministic testing of AI-powered features without API costs or network dependencies. This ensures tests run quickly in CI/CD and remain stable across environments. AI SDK 5.x uses the V2 specification for mock providers as documented at https://ai-sdk.dev/docs/ai-sdk-core/testing#testing.

**Examples**:

Testing `generateText`:
```typescript
import { generateText } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';

const result = await generateText({
  model: new MockLanguageModelV2({
    doGenerate: async () => ({
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      content: [{ type: 'text', text: 'Hello, world!' }],
      warnings: [],
    }),
  }),
  prompt: 'Hello, test!',
});
```

Testing `streamText`:
```typescript
import { streamText, simulateReadableStream } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';

const result = streamText({
  model: new MockLanguageModelV2({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Hello' },
          { type: 'text-delta', id: 'text-1', delta: ', ' },
          { type: 'text-delta', id: 'text-1', delta: 'world!' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: 'stop',
            logprobs: undefined,
            usage: { inputTokens: 3, outputTokens: 10, totalTokens: 13 },
          },
        ],
      }),
    }),
  }),
  prompt: 'Hello, test!',
});
```

Testing `generateObject`:
```typescript
import { generateObject } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import { z } from 'zod';

const result = await generateObject({
  model: new MockLanguageModelV2({
    doGenerate: async () => ({
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      content: [{ type: 'text', text: '{"content":"Hello, world!"}' }],
      warnings: [],
    }),
  }),
  schema: z.object({ content: z.string() }),
  prompt: 'Hello, test!',
});
```

**Commit Standards**:
- Conventional Commits enforced via commitlint
- Husky pre-commit hooks run quality gates
- Semantic versioning via semantic-release

## Development Workflow

**Pre-Commit Requirements** (enforced by Husky):
1. All code changes trigger automated quality gates
2. Compile errors block commits
3. Linting violations block commits
4. Format inconsistencies auto-corrected then re-checked

**Feature Development Cycle**:
1. Write specification with persona mapping and performance goals
2. Write tests (unit for models, visual regression for components, mocks for LLM integrations) and get approval
3. Verify tests fail (red phase)
4. Implement to pass tests (green phase)
5. Refactor with test safety net
6. Run quality gates: `npm run compile && npm run format && npm run lint`
7. Verify coverage threshold met
8. Commit with conventional commit message

**Pull Request Standards**:
- All constitutional principles verified in review
- Complexity justifications validated
- Performance goals met or explicitly deferred with rationale
- Test coverage meets threshold
- Language model integrations tested with mocks

**Dependency Management**:
- Node >=18.18.0 required
- Prefer Ink ecosystem libraries (discovered via GitHub MCP)
- New dependencies require rationale in PR description

## Governance

**Constitutional Authority**:
- This constitution supersedes all other development practices
- In case of conflict, constitutional principles take precedence
- All PRs and code reviews MUST verify compliance

**Amendments**:
- Constitution changes require documentation in Sync Impact Report
- Version follows semantic versioning (MAJOR.MINOR.PATCH)
- Template synchronization mandatory before amendment finalization

**Compliance & Review**:
- Constitutional violations require explicit justification in Complexity Tracking table
- Unjustified violations block merge
- Regular constitution reviews scheduled quarterly

**Development Guidance**:
- Runtime development guidance for AI agents documented in `CLAUDE.md`
- `CLAUDE.md` MUST reference constitutional principles
- Constitutional updates propagate to `CLAUDE.md` within 24 hours

**Version**: 1.2.1 | **Ratified**: 2025-10-08 | **Last Amended**: 2025-12-03
