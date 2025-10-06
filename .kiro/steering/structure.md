# Project Structure

## Root Directory Layout

```
├── source/          # Main application source code
├── tests/           # Test files (.spec.tsx/.spec.ts)
├── dist/            # Compiled output (generated)
├── .kiro/           # Kiro AI assistant configuration
├── .specify/        # Specification and planning tools
└── coverage/        # Test coverage reports (generated)
```

## Source Code Organization

### `/source`

- **`cli.tsx`** - CLI entry point with meow argument parsing
- **`app.tsx`** - Main React component for terminal UI
- Uses `.tsx` extension for React components
- ES module imports with `.js` extensions (TypeScript compilation target)

### `/tests`

- Test files follow `*.spec.tsx` or `*.spec.ts` naming convention
- Uses AVA test runner with TypeScript support via tsimp
- Tests are configured to run from `tests/` directory only

## Configuration Files

### Build & Development

- `tsconfig.json` - Extends @sindresorhus/tsconfig, outputs to `dist/`
- `package.json` - ESM-only project, bin points to `dist/cli.js`
- `.prettierrc` - Uses @vdemedes/prettier-config
- `ava.config.js` - Test configuration with tsimp loader

### Quality & Git

- `.husky/` - Git hooks for commit-msg and pre-commit
- `commitlint.config.js` - Conventional commit enforcement

## File Naming Conventions

- Source files: `kebab-case.tsx` or `kebab-case.ts`
- Test files: `kebab-case.spec.tsx` or `kebab-case.spec.ts`
- Config files: Standard names (lowercase with dots)
- React components: PascalCase default exports

## Import/Export Patterns

- Use ES modules exclusively
- Import React components without explicit React import
- Use `.js` extensions in imports (TypeScript compilation requirement)
- Default exports for main components, named exports for utilities
