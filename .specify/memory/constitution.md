<!--
Sync Impact Report:
Version: 0.0.0 → 1.0.0 (MAJOR - Initial constitution ratification)

Modified principles: Initial constitution creation with 5 core principles

Added sections:
  - Core Principles (I-V: Quality Gates, TDD, Persona-First UX, Performance, Simplicity)
  - Code Quality Standards (TypeScript strict mode, linting, testing, commits)
  - Development Workflow (pre-commit reqs, feature cycle, PR standards, dependency mgmt)
  - Governance (constitutional authority, amendments, compliance, dev guidance)

Templates requiring updates:
  ✅ .specify/templates/plan-template.md - Constitution Check section updated with v1.0.0 gates
  ✅ .specify/templates/spec-template.md - Added Target Personas and Performance Goals sections
  ✅ .specify/templates/tasks-template.md - Phase 3.5 renamed to "Quality Gates & Polish" with explicit gates
  ✅ CLAUDE.md - Added constitutional principles overview and strengthened quality gate language

Follow-up TODOs: None - All templates synchronized
-->

# uxlint Project Constitution

## Core Principles

### I. Code Quality Gates (NON-NEGOTIABLE)

Every code change MUST pass all three quality checks before commit:
- `npm run compile` — TypeScript type-checking with zero errors
- `npm run lint` — XO linting with zero violations
- `npm run format` — Prettier formatting applied consistently

**Rationale**: These gates prevent technical debt accumulation and ensure codebase consistency. The compile-lint-format sequence catches errors progressively from type safety to style, making issues easier to isolate and fix.

### II. Test-First Development (NON-NEGOTIABLE)

Test-Driven Development is mandatory for all features:
- Tests written and user-approved BEFORE implementation begins
- Tests MUST fail initially (red phase)
- Implementation proceeds to make tests pass (green phase)
- Refactoring follows with tests ensuring stability
- Coverage threshold: minimum 80% via c8

**Rationale**: TDD ensures requirements are testable, reduces defects, and creates living documentation. Pre-approved failing tests validate understanding before effort is invested in implementation.

### III. UX Consistency via Persona-First Design

All user-facing features MUST be evaluated against defined personas:
- Every feature spec MUST reference at least one target persona
- UX changes MUST consider persona goals, constraints, and devices
- Feature descriptions MUST focus on user outcomes, not implementation
- Accessibility needs from persona descriptions MUST be addressed

**Rationale**: uxlint's core value is persona-aware UX analysis. Internal tooling must practice what it preaches—design decisions grounded in real user contexts prevent feature bloat and ensure usability.

### IV. Performance Accountability

Performance requirements MUST be explicit and validated:
- Every feature spec MUST define measurable performance goals (e.g., "CLI runs in <5s for 10 pages")
- Build outputs MUST be optimized (tree-shaking, minification via TypeScript)
- Dependency additions MUST be justified (document bundle impact in plan.md)
- Integration tests MUST include performance assertions for critical paths

**Rationale**: Performance is a feature, not an afterthought. Explicit goals prevent regressions and ensure uxlint remains fast enough for real-world workflows.

### V. Simplicity & Minimalism

Complexity must be earned through justification:
- Prefer standard library solutions over external dependencies
- New abstractions require documented rationale in plan.md
- Remove code before adding—refactor for clarity first
- Configuration remains minimal (single config file, zero boilerplate)

**Rationale**: uxlint targets frontend engineers who value simplicity. Every layer of indirection slows debugging and increases cognitive load. Justified complexity only.

## Code Quality Standards

### TypeScript Strict Mode
- `@sindresorhus/tsconfig` enforced (strict: true, noImplicitAny, etc.)
- No `any` types without explicit justification in code comments
- All public APIs MUST have type declarations in dist/

### Linting & Formatting
- XO with `xo-react` config (Prettier-integrated)
- React-specific rules: prop-types off (TypeScript covers this), react-in-jsx-scope off (new JSX transform)
- No ESLint disable comments without documented justification

### Testing Standards
- **Unit tests**: Ava with tsimp for TS/TSX support
- **Component tests**: ink-testing-library for terminal UI assertions
- **Contract tests**: For any external integrations (future: API contracts)
- **Coverage**: c8 with 80% minimum threshold
- Test file naming: `*.spec.tsx` for component tests, `*.test.ts` for utilities

### Commit Discipline
- Conventional commits enforced via commitlint
- Husky pre-commit hook runs quality gates
- No force-push to main/master
- Semantic versioning automated via semantic-release

## Development Workflow

### Pre-Commit Requirements
1. Run `npm run compile` — Fix type errors
2. Run `npm run lint` — Fix linting violations
3. Run `npm run format` — Apply formatting
4. Run `npm test` — Ensure all tests pass with coverage

### Feature Development Cycle
1. **Spec phase** (`/specify`): Define user value, personas affected, acceptance criteria
2. **Plan phase** (`/plan`): Technical design, constitution check, task breakdown
3. **Implementation**: TDD cycle (red → green → refactor) per task
4. **Validation**: Quickstart test, performance benchmarks, UX review

### Pull Request Standards
- PR description MUST reference personas impacted
- PR MUST include test coverage for new code
- CI checks MUST pass (compile, lint, format, test)
- Manual testing checklist completed if UI changes

### Dependency Management
- Prefer dev dependencies over runtime (smaller bundle)
- Document why each new dependency is added (in plan.md or commit message)
- Audit deps quarterly for security/performance

## Governance

### Constitutional Authority
This constitution supersedes all other development practices. When conflicts arise, constitution principles take precedence.

### Amendment Process
1. Proposed changes MUST document:
   - Which principle(s) affected
   - Rationale for change
   - Impact on existing features/workflows
2. Amendments require:
   - Documented consensus (issues/discussions)
   - Migration plan for breaking changes
   - Version bump per semantic versioning
3. Template updates:
   - All `.specify/templates/*.md` MUST reflect constitutional changes
   - Agent guidance files (CLAUDE.md, etc.) synced within 1 sprint

### Compliance Review
- Every PR review MUST verify constitutional compliance
- Constitution Check section in plan-template.md gates design approval
- Complexity deviations MUST be documented in plan.md Complexity Tracking table

### Development Guidance
Runtime development guidance for AI coding assistants is maintained in `CLAUDE.md` (for Claude Code) and similar agent-specific files. These files MUST remain consistent with constitutional principles but may include tool-specific implementation details.

**Version**: 1.0.0 | **Ratified**: 2025-10-04 | **Last Amended**: 2025-10-04
