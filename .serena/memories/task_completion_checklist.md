# Task Completion Checklist

## Required After Code Changes (Constitution I: Code Quality Gates)

**NON-NEGOTIABLE:** After modifying or creating any code, you MUST run these commands in this exact sequence:

1. `npm run compile` - Type-check the code (zero errors required)
2. `npm run format` - Format code with Prettier (applied consistently)
3. `npm run lint` - Check linting rules (zero violations required)

**Execution Order**: compile → format → lint

These quality gates are enforced by the project constitution (v1.2.0) and prevent commits with type errors, linting violations, or formatting inconsistencies.

## Testing Requirements (Constitution II: Test-First Development)

- **Models** (pure TypeScript classes/functions): Unit tests using Ava
- **Components** (React/Ink UI): Visual regression tests using ink-testing-library
- **Language Model Integrations**: Mock-based tests using AI SDK test helpers
- Tests MUST be written and approved BEFORE implementation
- Tests MUST fail initially (red phase) before implementation begins
- Coverage threshold: 80% via c8

## Code Quality Rules

- Do NOT bypass linting by using `// eslint-disable-next-line` or modifying linting rules
- Do NOT modify these configuration files:
  - `xo.config.js` - XO linting configuration
  - `.prettierrc` - Prettier formatting configuration
  - `.prettierignore` - Prettier ignore patterns

If you encounter linting or formatting issues, fix the source code to comply with the existing rules.
