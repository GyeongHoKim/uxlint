# uxlint Project Overview

## Purpose
uxlint is an AI-powered UX review CLI tool built with TypeScript and React (Ink). It analyzes web applications based on user-provided configuration files (personas, features, pages) and generates actionable UX reports.

## Tech Stack
- **TypeScript** with ES modules
- **React** via Ink (terminal UI framework)
- **Ava** for testing with tsimp for TS support
- **XO** for linting (with React config)
- **Prettier** for formatting
- **Husky** for git hooks
- **Semantic release** for versioning
- **Winston** for file-only logging (MCP-safe)
- **XState** for state management
- **AI SDK** for LLM integrations

## Key Features
- Persona-aware analysis using provided persona descriptions
- Page-by-page evaluation guided by freeform feature descriptions
- Actionable recommendations prioritized for frontend teams
- Single command execution with zero boilerplate beyond one config file

## Architecture

### CLI State Machine
The CLI uses XState to manage execution flow:
- **IDLE** → Determines mode based on `--interactive` flag
- **TTY (Interactive mode)**: Uses Ink UI components
  - Wizard: Interactive configuration wizard (when no config file exists)
  - AnalyzeWithUI: Analysis with visual progress indicators
- **CI (Headless mode)**: No UI, uses `console.log` output
  - AnalyzeWithoutUI: Headless analysis execution
  - Error: Missing configuration error state
- **ReportBuilder**: Generates final markdown report

### Source Structure
- `source/cli.tsx` - CLI entry point using meow for argument parsing; renders the Ink App component
- `source/app.tsx` - Main React component rendered by Ink for terminal UI
- `source/components/` - React/Ink UI components
- `source/hooks/` - React hooks
- `source/contexts/` - React contexts
- `source/models/` - Data models
- `source/services/` - Business logic
- `source/infrastructure/` - Infrastructure code (logger, etc.)
- `tests/*.spec.tsx` - Ava tests using ink-testing-library for component testing

### Build Output
- Compiled files go to `dist/` (TypeScript compiled to JS with type declarations)
- Entry point: `dist/cli.js` (specified in package.json `bin` field)

## Configuration
The CLI reads `.uxlintrc.yml` or `.uxlintrc.json` from CWD with:
- `mainPageUrl` and `subPageUrls` - URLs to analyze
- `pages[]` - Feature descriptions per URL
- `personas[]` - User persona descriptions
- `report.output` - Output path for generated report

## Constitutional Principles
1. Code Quality Gates (compile → format → lint sequence) — NON-NEGOTIABLE
2. Test-First Development — NON-NEGOTIABLE
3. UX Consistency via Persona-First Design
4. Performance Accountability (measurable goals)
5. Simplicity & Minimalism (justify complexity)
