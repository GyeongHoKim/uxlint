# Suggested Commands for uxlint Development

## Build Commands
- `npm run build` - Compile TypeScript to dist/
- `npm run dev` - Watch mode compilation
- `npm run compile` - Type-check without emitting files

## Code Quality Commands (Required After Code Changes)
**NON-NEGOTIABLE sequence**: compile → format → lint
- `npm run compile` - Type-check the code (zero errors required)
- `npm run format` - Format code with Prettier
- `npm run lint` - Check linting rules with XO (zero violations required)

## Testing Commands
- `npm test` - Run full test suite (prettier, xo, ava with coverage)
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run XO linter only
- `npm run format` - Format code with Prettier
- `npm test tests/test.spec.tsx` - Run a single test file
- `npm run test --watch` - Run tests in watch mode

## Local Testing
- `npm run build` - Build the project
- `node dist/cli.js` - Run the CLI directly

## Utility Commands (Linux)
- `git` - Version control
- `ls`, `cd`, `grep`, `find` - Standard Linux file operations
- `npm` - Package management

## Entry Points
- CLI entry: `dist/cli.js` (specified in package.json `bin` field)
- Source entry: `source/cli.tsx`
