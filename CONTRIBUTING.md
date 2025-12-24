# Contributing to uxlint

Thank you for your interest in contributing to uxlint! This document will help you get started with contributing to this AI-powered UX review CLI tool.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Getting Started](#getting-started)
- [Using AI Agents (Optional)](#using-ai-agents-optional)
- [Development Workflow](#development-workflow)
- [Code Quality Standards](#code-quality-standards)
- [Testing Requirements](#testing-requirements)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)
- [Feature Requests](#feature-requests)
- [Questions and Support](#questions-and-support)

## Code of Conduct

This project and everyone participating in it is governed by the [uxlint Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior by [creating a security advisory](https://github.com/GyeongHoKim/uxlint/security/advisories/new).

## Ways to Contribute

There are many ways to contribute to uxlint:

- **Report bugs** - Help us identify and fix issues
- **Suggest features** - Share ideas for new capabilities
- **Improve documentation** - Fix typos, clarify instructions, add examples
- **Write code** - Fix bugs, implement features, improve performance
- **Review pull requests** - Provide feedback on proposed changes
- **Share your experience** - Write blog posts, create tutorials, speak at meetups

## Getting Started

### Prerequisites

- Node.js >= 18.18.0
- npm (comes with Node.js)
- Git
- A code editor (VS Code recommended)

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork**:

   ```bash
   git clone https://github.com/YOUR_USERNAME/uxlint.git
   cd uxlint
   ```

3. **Add the upstream remote**:

   ```bash
   git remote add upstream https://github.com/GyeongHoKim/uxlint.git
   ```

4. **Install dependencies**:

   ```bash
   npm install
   ```

5. **Set up environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env and add your AI provider API key
   ```

6. **Verify your setup**:

   ```bash
   npm run compile    # Type-check the code
   npm run format     # Format code with Prettier
   npm run lint       # Check linting rules
   npm test           # Run the test suite
   ```

   All commands should complete successfully with zero errors.

## Using AI Agents (Optional)

This project supports AI-powered development workflows through two complementary tools: **Speckit** and **Serena**. While using AI agents is entirely optional, contributors who choose to use AI assistance for development can benefit from these integrations.

### Speckit - Specification-Driven Development

**Speckit** is GitHub's open source toolkit for spec-driven development. It provides a structured process to center work around specifications first, then technical plans, then small testable tasks.

**Installation:**

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
```

**Core workflow commands:**

- `/speckit.specify` - Generate feature specifications
- `/speckit.plan` - Create technical implementation plans
- `/speckit.tasks` - Generate actionable task lists
- `/speckit.implement` - Execute the implementation

**Why use Speckit:**

- Start with clear requirements before coding
- Break complex features into manageable tasks
- Maintain alignment with project goals
- Generate specifications that AI agents can implement

**Learn more:**

- Official website: https://speckit.org/
- GitHub repository: https://github.com/github/spec-kit
- Agent integration guide: https://github.com/github/spec-kit/blob/main/AGENTS.md

### Serena - MCP Development Workflows

**Serena** is an MCP (Model Context Protocol) tool that provides AI-powered coding workflow capabilities.

**Why use Serena:**

- Structured development workflows
- Code generation and refactoring
- Test-first development support
- Adherence to project constitutional principles

### Setting Up Serena

If you want to use AI agents (such as Claude Code, Claude Desktop, or other MCP-compatible clients) with this project:

1. **Configure Serena** following the official documentation:

   - [Serena LLM Integration Guide](https://oraios.github.io/serena/01-about/010_llm-integration.html)

2. **Supported AI clients** include:

   - Claude Code (CLI)
   - Claude Desktop
   - Terminal-based clients like Codex and OpenHands CLI
   - IDEs such as VSCode and Cursor
   - Extensions like Cline or Roo Code

3. **Alternative integration options**:
   - Use MCP to connect with ChatGPT or clients lacking native MCP support
   - Integrate Serena's tools into custom agent frameworks

### Important Guidelines for AI-Assisted Contributions

When using AI agents for contributions:

- **Quality gates still apply**: All AI-generated code must pass the same quality standards:

  - `npm run compile` (zero errors)
  - `npm run format` (proper formatting)
  - `npm run lint` (zero violations)

- **Test-first development**: AI agents should write tests before implementation, following our Test-First Development principle

- **Review AI output**: Always review and verify AI-generated code before committing. You are responsible for all code you submit, regardless of how it was created.

- **Constitutional principles**: Ensure AI-generated code adheres to the project's constitutional principles (simplicity, no over-engineering, no re-exports, etc.)

- **Human judgment required**: Use AI as a tool to enhance your productivity, but apply human judgment for architectural decisions and code reviews

### Note for Non-AI Users

Using AI agents is **completely optional**. Traditional development workflows are equally welcome and valued. All contributors, whether using AI assistance or not, follow the same contribution standards and review process.

## Development Workflow

### Creating a Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-number-description
```

**Branch naming conventions**:

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test improvements
- `chore/` - Build process, dependencies, etc.

### Making Changes

1. **Make your changes** in your feature branch

2. **Follow the code quality gates** (NON-NEGOTIABLE):

   ```bash
   npm run compile    # Type-check (zero errors required)
   npm run format     # Format code (applied consistently)
   npm run lint       # Check linting (zero violations required)
   ```

   These commands MUST be run in this exact order: `compile → format → lint`

3. **Test your changes**:

   ```bash
   npm test           # Run full test suite
   ```

4. **Test locally**:
   ```bash
   npm run build
   node dist/source/cli.js --interactive
   ```

### Keeping Your Branch Updated

Regularly sync your branch with the upstream repository:

```bash
git fetch upstream
git rebase upstream/main
```

## Code Quality Standards

uxlint enforces strict code quality standards through automated tooling.

### TypeScript

- All code must be valid TypeScript with zero type errors
- Use strict type checking (no `any` types unless absolutely necessary)
- Extend `@sindresorhus/tsconfig` for consistent configuration
- Use ES modules (`import`/`export`, not `require`)

### Formatting

- Prettier is used for code formatting
- Run `npm run format` to auto-format your code
- **DO NOT** modify `.prettierrc` or `.prettierignore` configuration files

### Linting

- XO is used for linting with React support
- Run `npm run lint` to check for violations
- Fix all linting errors before submitting
- **DO NOT** use `// eslint-disable-next-line` to bypass rules
- **DO NOT** modify `xo.config.js` configuration file

### Code Patterns

**Prohibited patterns**:

- ❌ Re-exports and wrapper functions for "backward compatibility"
- ❌ Unused variables with underscore prefix (e.g., `_unused`)
- ❌ Comments for removed code (e.g., `// removed`)
- ❌ Using `stdout` or `stderr` for logging (use Winston file logger only)

**Good practices**:

- ✅ Use singleton instances directly
- ✅ Delete unused code completely
- ✅ Use the Winston logger configured in `source/infrastructure/logger.ts`
- ✅ Keep solutions simple and focused (avoid over-engineering)

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Test improvements
- `chore`: Build process, dependencies
- `ci`: CI/CD changes
- `perf`: Performance improvements

**Examples**:

```
feat(wizard): add support for YAML configuration output

fix(cli): resolve crash when config file is missing

docs(readme): update installation instructions for Windows
```

Commit messages are enforced by Husky hooks and commitlint.

## Testing Requirements

uxlint follows **Test-First Development** (Constitution II).

### Testing Strategy

- **Models** (pure TypeScript classes/functions): Unit tests using Ava
- **Components** (React/Ink UI): Visual regression tests using ink-testing-library
- **LLM integrations**: Mock-based tests using AI SDK test helpers

### Writing Tests

1. **Tests MUST be written BEFORE implementation**
2. **Tests MUST fail initially** (red phase) before implementation begins
3. **All tests must pass** before submitting a pull request
4. **Coverage threshold**: 80% (lines, functions, branches, statements)

### Running Tests

```bash
npm test                    # Run full test suite with coverage
npm run test:coverage       # Generate HTML coverage report
npm test tests/test.spec.tsx    # Run a single test file
npm run test --watch        # Watch mode (if configured)
```

### Test File Naming

- Test files use `.spec.tsx` or `.spec.ts` extension
- Place tests in the `tests/` directory
- Name test files to match the source file: `source/cli.tsx` → `tests/cli.spec.tsx`

## Submitting Changes

### Before Submitting

Ensure your changes meet all requirements:

- [ ] Code compiles without errors (`npm run compile`)
- [ ] Code is formatted (`npm run format`)
- [ ] Code passes linting (`npm run lint`)
- [ ] All tests pass (`npm test`)
- [ ] Test coverage is at least 80%
- [ ] Changes are well-documented
- [ ] Commit messages follow Conventional Commits format
- [ ] Branch is up-to-date with `upstream/main`

### Creating a Pull Request

1. **Push your branch** to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a pull request** on GitHub:

   - Go to https://github.com/GyeongHoKim/uxlint
   - Click "New Pull Request"
   - Select your fork and branch
   - Fill in the PR template with:
     - **Title**: Clear, descriptive summary (follows commit message format)
     - **Description**: What changes were made and why
     - **Issue reference**: Fixes #123 (if applicable)
     - **Testing**: How you tested the changes
     - **Screenshots**: If UI changes were made

3. **Respond to feedback**:
   - Address review comments promptly
   - Push additional commits to the same branch
   - Request re-review when ready

### Pull Request Guidelines

- Keep pull requests focused and small when possible
- One pull request per feature/fix
- Link related issues in the PR description
- Update documentation if behavior changes
- Add tests for new functionality
- Ensure CI checks pass

## Reporting Issues

### Before Creating an Issue

1. **Search existing issues** to avoid duplicates:

   - https://github.com/GyeongHoKim/uxlint/issues

2. **Check if it's already fixed**:

   - Try the latest version from `main` branch

3. **Verify it's a uxlint issue**:
   - Test with minimal reproduction
   - Check if it occurs with other AI providers

### Security Vulnerabilities

**DO NOT** open public issues for security vulnerabilities.

Instead, please report them privately:

- Email: [Create a security advisory](https://github.com/GyeongHoKim/uxlint/security/advisories/new)
- Include steps to reproduce and impact assessment

### Creating a Bug Report

When creating a bug report, include:

**Title**: Clear, specific description of the problem

**Description**:

- What you expected to happen
- What actually happened
- Steps to reproduce the issue

**Environment**:

- uxlint version (`uxlint --version`)
- Node.js version (`node --version`)
- Operating system and version
- AI provider and model being used

**Configuration**:

- Relevant `.uxlintrc.yml` or `.uxlintrc.json` content (sanitized)
- Relevant `.env` configuration (without API keys)

**Error messages**:

- Complete error output
- Relevant log files (redact sensitive information)

**Code sample**:

- Minimal reproduction case if possible

## Feature Requests

We welcome feature suggestions! However, please note:

1. **Search existing issues** first to avoid duplicates

2. **Open a discussion** before opening an issue:

   - Go to [GitHub Discussions](https://github.com/GyeongHoKim/uxlint/discussions)
   - Start a new discussion in the "Ideas" category
   - Gather community feedback

3. **Create a detailed feature request**:

   - **Use case**: Describe the problem you're trying to solve
   - **Proposed solution**: How you envision the feature working
   - **Alternatives considered**: Other approaches you've thought about
   - **Additional context**: Screenshots, mockups, examples from other tools

4. **Be patient**: Feature requests are evaluated based on:
   - Alignment with project goals
   - Benefit to the broader community
   - Implementation complexity
   - Maintenance burden

## Questions and Support

For questions about using uxlint:

1. **Check the documentation**:

   - [README.md](README.md) - Installation, configuration, usage
   - [CLAUDE.md](CLAUDE.md) - Development guide, architecture

2. **Search closed issues**:

   - Your question may have already been answered

3. **Ask in GitHub Discussions**:

   - Go to https://github.com/GyeongHoKim/uxlint/discussions
   - Start a new discussion in the "Q&A" category

4. **Open an issue** only if:
   - Documentation is unclear and needs improvement
   - You've found a potential bug

**Please do not**:

- Open issues for general questions (use Discussions instead)
- Email maintainers directly (use public channels for transparency)

## Project Governance

### Constitutional Principles

uxlint is governed by constitutional principles documented in `.specify/memory/constitution.md` v1.2.0:

1. **Code Quality Gates** (compile → format → lint sequence) — NON-NEGOTIABLE
2. **Test-First Development** — NON-NEGOTIABLE
3. **UX Consistency via Persona-First Design**
4. **Performance Accountability**
5. **Simplicity & Minimalism**

All contributions must adhere to these principles.

### Review Process

- All changes require at least one approving review
- Maintainers may request changes or provide feedback
- CI checks must pass before merging
- Maintainers will merge approved PRs

### Release Process

- uxlint uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated releases
- Releases are triggered by commits to the `main` branch
- Version numbers follow [Semantic Versioning](https://semver.org/)
- Changelog is automatically generated from commit messages

## Recognition

Contributors are recognized in several ways:

- Your name in the git commit history
- Mentioned in release notes for significant contributions
- Added to a CONTRIBUTORS file (if created)
- Public acknowledgment in social media announcements

## License

By contributing to uxlint, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to uxlint! Your efforts help make UX review accessible to frontend engineers everywhere.
