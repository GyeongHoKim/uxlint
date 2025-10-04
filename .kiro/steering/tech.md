# Technology Stack

## Core Technologies

- **TypeScript** - Primary language with strict typing
- **React** - UI framework (used with Ink for CLI rendering)
- **Ink** - React-based CLI framework for terminal UIs
- **Node.js** - Runtime (minimum version 18.18.0)
- **ESM** - ES Modules only (type: "module" in package.json)

## Build System & Tools

- **TypeScript Compiler (tsc)** - Build and compilation
- **XO** - ESLint configuration with React support
- **Prettier** - Code formatting (@vdemedes/prettier-config)
- **AVA** - Test runner with TypeScript support
- **c8** - Code coverage
- **tsimp** - TypeScript import/execution for tests
- **Husky** - Git hooks for pre-commit and commit-msg

## Key Dependencies

- **ink** - TUI library integrated with React
- **meow** - CLI argument parsing
- **chalk** - Terminal colors (dev dependency)

## Common Commands

### Development

```bash
npm run dev          # Watch mode compilation
npm run build        # Production build
npm run compile      # Type checking only (no emit)
```

### Quality Assurance

```bash
npm test            # Full test suite (prettier + xo + c8 + ava)
npm run lint        # ESLint only
npm run format      # Prettier formatting
```

### Usage

```bash
npx uxlint          # Run the CLI tool
```

## Code Style Rules

- XO ESLint config with React extensions
- Prettier formatting enforced
- React prop-types disabled (TypeScript handles typing)
- No React imports required in JSX scope
- Unicorn expiring TODO comments disabled
