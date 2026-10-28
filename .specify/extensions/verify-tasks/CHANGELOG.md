# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [1.2.0] - 2026-09-15

spec-kit 0.11.2 added `/speckit.converge`, which assesses the tree against the spec, plan, and constitution and appends unbuilt work as new tasks. Converge finds what is *not built*; verify-tasks finds what is *falsely marked built*. This release wires the two together.

### Added

- **`after_converge` hook.** Tasks that converge appends get implemented and marked `[X]` too, and those marks need verifying. The extension now registers an optional hook after converge alongside the existing one after implement, so verify-tasks is the final gate once converge reports Converged.
- **`PARTIAL (code)` / `PARTIAL (record)` qualifier.** Every `🔍 PARTIAL` row now says which loop to enter. A code gap (symbol defined nowhere, dead, stubbed, behavior absent, file missing with no rename) means the task is not done. A record gap (file renamed, symbol defined and wired elsewhere, only Layer 2 negative, or a false or stale claim in the task text) means the code is done and the task's own line is wrong. Unclear cases are tagged `code`. The scorecard shows the two counts separately and the verdict line carries the tag.
- **Walkthrough action D (demote).** For a `NOT_FOUND` or `PARTIAL (code)` item, flip the task's checkbox from `[X]` to `[ ]` after explicit confirmation, so `/speckit.converge` and `/speckit.implement` pick it up. One character changes: no renumbering, reordering, deleting, task-text edits, or Convergence header changes. The report immutability rule is unchanged.
- **Source-ref rule in Layer 5.** Convergence tasks carry `per <source-ref> (<gap-type>)`. Task parsing now captures it, and Layer 5 reads that exact FR, SC, acceptance scenario, plan decision, or constitution principle instead of searching `spec.md` for the concept.
- **Scope statement and converge handoff.** The advisory now says what verify-tasks does not do (`[ ]` tasks, spec coverage, unrequested code, constitution compliance) and points at converge; the command frontmatter offers a converge handoff next to the implement one.
- **Convergence-phase fixture tasks.** `tests/fixtures/phantom-tasks/` gains a `## Phase 2: Convergence` section with one planted code gap (T012) and one planted record gap (T011); `tests/expected-verdicts.md` covers both.

### Fixed

- **Installs no longer copy the whole repository.** The repo shipped a `.specifyignore`, a file spec-kit never reads, so every archive install copied this repo's own `.specify/` project (constitution, templates, scripts), `specs/`, `tests/`, `.github/` prompts and `.vscode/` into the user's `.specify/extensions/verify-tasks/`. Nothing consumed them, but the "prevent recursive installation" intent never worked. It is now `.extensionignore`, the name spec-kit honours, and an archive install copies only `extension.yml`, `commands/`, `README.md`, `CHANGELOG.md`, and `LICENSE`. Verified against spec-kit 1.0.6.

### Changed

- **Hook blocks adopt the spec-kit 1.0.6 boilerplate.** An unparseable `.specify/extensions.yml` is reported rather than skipped silently; a hook without an `enabled` field is enabled; dots in hook command names become hyphens in the invocation; a mandatory hook must actually be invoked, not just printed.
- **Constitution 1.1.0.** Article VII now permits a user-confirmed walkthrough disposition to edit the flagged task's own line in `tasks.md` (fix a record gap, or demote) and nothing else. Rationale is recorded in the constitution's amendment history.
- README: converge pairing section with a comparison table, both hooks documented with the real `extensions.yml` shape, fresh-session advice extended to converge, walkthrough table gains **D**.

## [1.1.0] - 2026-09-13

### Fixed

- Command body references to sibling commands use the agent-neutral `__SPECKIT_COMMAND_*__` token instead of a hard-coded `/speckit.…` spelling, so the rendered advisory is correct for every agent (dot, hyphen, or prefixed separators).
- Repository links in this changelog and the README pointed at the wrong GitHub organisation.
- [#4](https://github.com/datastone-inc/spec-kit-verify-tasks/issues/4) reported that spec-kit 0.4.3 rejected the two-part alias `speckit.verify-tasks` at install time. spec-kit 0.5.1 (2026-04-08) restored alias compatibility for community extensions, and the alias is kept: `/speckit.verify-tasks` and the canonical `/speckit.verify-tasks.run` are both installed. Installation of this release was verified against spec-kit 1.0.6, and `requires.speckit_version` now excludes the affected versions.

### Added

- **Step 3a test gate.** When the completed task list names a canonical test command (`make check`, `pytest`, `cargo test`, `npm test`, or a runner named in the repository's agent guidance) and the environment can run it, the command runs it once in the background and records the exit status and summary lines in the report header. A task whose only claim is "the suite is green" is then `✅ VERIFIED (by execution)` instead of `WEAK`. A run is never fabricated or improvised; when the check cannot run, the report says so.
- **Checkpoint line.** One progress line per `tasks.md` phase (or per ~10 tasks) during the verification cascade, so a long run is not silent.
- **Report immutability rule.** The walkthrough may only append the `## Walkthrough Log` section; it must never re-score a row in the original Flagged or Verified tables.

### Changed

- **Layer 4 no longer blanket-skips SQL.** Schema objects (tables, columns, types, views, indexes) still need no caller, but SQL functions, procedures and triggers are callable code and are checked for callers like any application symbol. When a symbol's legitimate caller lives in a sibling component or another language, Layer 4 searches the whole repository rather than the nearest project root, and includes the caller's language extensions in the grep. A spec or contract saying "component Y calls X" is a checkable assertion, not evidence.
- Minimum spec-kit version raised to 0.12.17, the release that resolves `__SPECKIT_COMMAND_*__` tokens in extension skills.

## [1.0.0] - 2026-03-12

### Added

- `/speckit.verify-tasks` slash command (`commands/speckit.verify-tasks.md`) — five-layer phantom completion detector
- **Layer 1**: File existence verification via `test -f` / `find`
- **Layer 2**: Git diff cross-reference supporting four scopes (`branch`, `uncommitted`, `plan-anchored`, `all`)
- **Layer 3**: Content pattern matching via `grep` for declared symbols
- **Layer 4**: Dead-code / wiring detection via `git grep` across the repository
- **Layer 5**: Semantic assessment with invariant — semantic evidence alone never yields `VERIFIED`
- Five verdict levels: `✅ VERIFIED`, `🔍 PARTIAL`, `⚠️ WEAK`, `❌ NOT_FOUND`, `⏭️ SKIPPED`
- Structured `verify-tasks-report.md` output: summary scorecard, flagged items with per-layer detail, verified items table, machine-parseable verdict lines
- Interactive walkthrough (Step 11) for flagged items with Investigate / Fix / Skip options
- Fresh-session advisory banner in both the command prompt and the generated report
- Historical branch verification notes for deleted-file and plan-anchored edge cases
- Graceful degradation when `git` is unavailable (layers 2 and 4 skipped)
- Shallow-clone warning
- Full error condition table (missing `tasks.md`, no `[X]` tasks, malformed entries, unwritable report path, etc.)
- Project constitution (`.specify/memory/constitution.md`) with eight governing principles
- Test fixtures:
  - `tests/fixtures/phantom-tasks/` — 10 tasks, 5 genuine + 5 planted phantoms (missing file, empty class, dead code, wrong function, behavioral gap)
  - `tests/fixtures/genuine-tasks/` — 10 tasks, all genuinely implemented with verified cross-references
  - `tests/fixtures/edge-cases/` — behavioral-only tasks, malformed entries, glob patterns, zero `[X]` tasks scenario
  - `tests/fixtures/scalability/` — 50-task synthetic fixture for session overflow testing (42 source files)
- `tests/expected-verdicts.md` — expected evidence level with rationale for every task in every fixture
- `.markdownlint.json` configuration

[Unreleased]: https://github.com/datastone-inc/spec-kit-verify-tasks/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/datastone-inc/spec-kit-verify-tasks/releases/tag/v1.2.0
[1.1.0]: https://github.com/datastone-inc/spec-kit-verify-tasks/releases/tag/v1.1.0
[1.0.0]: https://github.com/datastone-inc/spec-kit-verify-tasks/releases/tag/v1.0.0
