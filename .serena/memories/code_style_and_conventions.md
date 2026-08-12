# Code Style and Conventions

## Language and Module System
- **TypeScript** with ES modules only (`"type": "module"`)
- **React** via Ink (terminal UI framework)
- Node version: >=22.22.2

## TypeScript Configuration
- Self-contained tsconfig.json (no `extends`)
- Strict mode enabled with comprehensive type checking
- Output directory: `dist/`
- React JSX transform (no need for React import)

## Code Formatting
- **Prettier** with `@vdemedes/prettier-config`
- **EditorConfig** enforces:
  - Tab indentation (except YAML files use 2 spaces)
  - LF line endings
  - UTF-8 encoding
  - Trim trailing whitespace
  - Insert final newline

## Linting
- **XO** with Prettier integration
- React configuration enabled
- Semicolons required
- Custom rules:
  - `react/prop-types`: off
  - `react/react-in-jsx-scope`: off
  - `unicorn/expiring-todo-comments`: off
  - `unicorn/no-process-exit`: off
  - `@typescript-eslint/parameter-properties`: off
  - `@typescript-eslint/naming-convention`: off

## Testing
- **Ava** for testing, running against precompiled `dist/` via `@ava/typescript`
- **ink-testing-library** for component testing
- **c8** for coverage reporting (80% threshold)
- Test files: `tests/**/*.spec.{ts,tsx}`

## Project Structure
- `source/` - Source code
  - `cli.tsx` - CLI entry point
  - `app.tsx` - Main React component
  - `components/` - React/Ink components
  - `hooks/` - React hooks
  - `contexts/` - React contexts
  - `models/` - Data models
  - `services/` - Business logic
  - `infrastructure/` - Infrastructure code (logger, etc.)
- `tests/` - Test files
- `dist/` - Compiled output

## Important Constraints
- **MCP Protocol**: NEVER use stdout/stderr for logging (reserved for MCP messages)
- All logging must go to files only (Winston logger in `source/infrastructure/logger.ts`)
- ES modules only
- Git hooks: Husky enforces commitlint (conventional commits)
