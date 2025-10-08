<!--
Sync Impact Report:
Version: 1.0.0 → 1.1.0 (MINOR - Enhanced testing standards and UX library discovery guidance)

Modified principles:
  - II. Test-First Development → Enhanced with specific testing strategies (unit for models, visual regression for components)
  - III. UX Consistency via Persona-First Design → Enhanced with GitHub MCP tool requirement for Ink library discovery

Added sections: None

Removed sections: None

Templates requiring updates:
  ✅ .specify/templates/plan-template.md - Constitution Check section updated with v1.1.0 gates and testing strategies
  ✅ .specify/templates/spec-template.md - Testing strategies guidance added to User Scenarios section
  ✅ .specify/templates/tasks-template.md - Test requirements updated from OPTIONAL to MANDATORY with strategy details
  ✅ CLAUDE.md - Updated to reference v1.1.0, corrected quality gate sequence (compile→format→lint), added testing strategies

Follow-up TODOs: None - All templates synchronized
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
- Tests written and user-approved BEFORE implementation begins
- Tests MUST fail initially (red phase)
- Implementation proceeds to make tests pass (green phase)
- Refactoring follows with tests ensuring stability
- Coverage threshold: minimum 80% via c8

**Rationale**: TDD ensures requirements are testable, reduces defects, and creates living documentation. Pre-approved failing tests validate understanding before effort is invested in implementation. Separating unit and visual regression tests ensures appropriate testing approaches for business logic vs UI behavior.

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
- Ava for unit and visual regression tests with tsimp for TypeScript support
- c8 for coverage reporting (80% minimum)
- ink-testing-library for component testing

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
2. Write tests (unit for models, visual regression for components) and get approval
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

**Version**: 1.1.0 | **Ratified**: 2025-10-08 | **Last Amended**: 2025-10-08
