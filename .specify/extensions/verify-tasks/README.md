<!-- markdownlint-disable MD013 MD033 MD041 -->
<p align="center"><img src="assets/datastone_logo.png" width="300" alt="dataStone logo" /></p>
<!-- markdownlint-enable MD033 MD041 -->

# spec-kit-verify-tasks

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![spec-kit](https://img.shields.io/badge/spec--kit-extension-blueviolet.svg)](https://github.com/github/spec-kit)
[![Changelog](https://img.shields.io/badge/changelog-CHANGELOG.md-blue.svg)](CHANGELOG.md)

A [spec-kit](https://github.com/github/spec-kit) extension that detects **phantom completions** in `tasks.md`.

A **phantom completion** is a task marked `[X]` as done that was never actually implemented. The checkbox was checked but the code was never written. This happens when an AI agent marks work complete without completing it, when implementation is partial but the task list was not updated, or when a task was copy-marked during a refactor without verifying the underlying work.

Phantom completions arise because autoregressive token prediction has no grounding in execution state. When the model has marked T001 through T024 as `[X]`, the highest-probability continuation after the next task description is another `[X]` — regardless of what happened in the filesystem. Planning an action and reporting it done are not distinct operations in the same forward pass, and RLHF training biases the model toward success reporting. The result is a false positive in the agent's own task-tracking output at a rate too low to catch by hand (~0.36%, or roughly [one per 277 tasks](https://datastone.ca/blog/task-phantom-completions-ai-assisted-development/)).

This matters because a wall of checked boxes creates a false sense of completion. When a developer trusts that list and moves on — to code review, QA, or the next feature — they are operating on a mental model that doesn't match reality. That dissonance between *reported* progress and *actual* progress is costly: bugs surface later, integration work is built on missing foundations, and confidence in AI-assisted workflows erodes. `verify-tasks` eliminates that gap by treating every `[X]` as a claim that must be mechanically proven.

`/speckit.verify-tasks` closes this gap by independently verifying every `[X]` task through a five-layer verification cascade, producing a structured markdown report with per-task verdicts, then walking you through each flagged item interactively.

## What it does

When a feature is marked "done" in `tasks.md`, there is no automatic check that the code was actually written. The `/speckit.verify-tasks` command closes that gap by independently verifying every `[X]` task using the following layers:

| Layer | Check | Method |
|-------|-------|--------|
| 1 | File existence | `test -f` / `find` |
| 2 | Git diff presence | `git diff`, `git log` |
| 3 | Content pattern matching | `grep -n` for declared symbols |
| 4 | Dead-code detection | `grep -rn` for usage references beyond definition site |
| 5 | Semantic assessment | Agent reads code for stubs, placeholders, and genuine behavior |

Each task receives one of five verdicts: `✅ VERIFIED`, `🔍 PARTIAL`, `⚠️ WEAK`, `❌ NOT_FOUND`, or `⏭️ SKIPPED`.

A `🔍 PARTIAL` verdict also says which loop to enter. `PARTIAL (code)` means the work is missing, stubbed, or unwired and the task should be demoted back to `[ ]`. `PARTIAL (record)` means the code is there and only the task's own text or note is wrong: a renamed file, a symbol that lives somewhere other than where the task says, or a claim the tree does not support. When the cascade cannot tell, it tags `code`.

The four mechanical layers can only grep. A task whose claim is "the suite is green" has nothing to grep, so a **test gate** runs alongside them: when the completed task list names a canonical test command (`make check`, `pytest`, `cargo test`, `npm test`, or a runner named in the repository's agent guidance) and the environment can run it, the command runs it once in the background and records the exit status and summary lines in the report header. A task whose only claim is that run is then `✅ VERIFIED (by execution)` rather than `⚠️ WEAK`. The gate never fabricates a run and never improvises a missing lab; when the check cannot run, the report says so and the layers stand as written.

## Installation

`verify-tasks` is listed in the spec-kit [community catalog](https://github.com/github/spec-kit/blob/main/extensions/catalog.community.json). Discover it with `specify extension search verify-tasks`, then install using the download URL:

```sh
specify extension add verify-tasks --from https://github.com/datastone-inc/spec-kit-verify-tasks/archive/refs/tags/v1.2.0.zip
```

> The community catalog is discovery-only (`install_allowed: false`). The bare command `specify extension add verify-tasks` works only when the extension is in a catalog with `install_allowed: true` — for example, your organization's curated `catalog.json` or a custom catalog added via `specify extension catalog add`.

For local development:

```sh
specify extension add --dev /path/to/spec-kit-verify-tasks
```

## Usage

```sh
/speckit.verify-tasks
/speckit.verify-tasks T003 T007
/speckit.verify-tasks --scope branch
/speckit.verify-tasks T003 --scope uncommitted
```

`/speckit.verify-tasks` is an alias. The canonical three-part name is `speckit.verify-tasks.run`, and both are installed, so `/speckit.verify-tasks.run` works too. Agents that use a hyphen separator see `/speckit-verify-tasks` and `/speckit-verify-tasks-run`. spec-kit 0.4.3 briefly rejected two-part aliases at install time; 0.5.1 (2026-04-08) restored them, and the extension requires a later version than that.

> 💡 **Recommended: run in a fresh agent session.** The agent that ran `/speckit.implement` carries context that biases it toward confirming its own work. Running `/speckit.verify-tasks` in a separate session produces more reliable results. The same applies to `/speckit.converge`: the agent that implemented is a poor judge of its own coverage, so run converge in a fresh session too.

### Automatic hooks

The extension registers two optional hooks:

| Hook | Fires after | Prompt |
|------|-------------|--------|
| `after_implement` | `/speckit.implement` | Run verify-tasks in a fresh session to check for phantom completions |
| `after_converge` | `/speckit.converge` | Converged? Run verify-tasks in a fresh session as the final gate before opening a PR |

Both are optional: the core command prints the prompt and nothing runs until you open a new session and run `/speckit.verify-tasks` there. The `after_converge` hook is the one that matters in the implement → converge → implement loop. Tasks that converge appends get implemented and marked `[X]` too, and those marks need verifying. When converge reports Converged, verify-tasks is the final gate before a PR.

To disable a hook, set `enabled: false` on the extension's entry under that hook in `.specify/extensions.yml`:

```yaml
hooks:
  after_implement:
    - extension: verify-tasks
      command: speckit.verify-tasks.run
      enabled: false   # set to true to re-enable
  after_converge:
    - extension: verify-tasks
      command: speckit.verify-tasks.run
      enabled: false
```

To re-enable, set `enabled: true` (or remove the line — a hook without an `enabled` field is enabled).

### Options

| Option | Format | Default | Description |
|--------|--------|---------|-------------|
| Task filter | Space/comma-separated task IDs | all `[X]` tasks | Restrict to specific task IDs |
| Diff scope | `--scope branch\|uncommitted\|plan-anchored\|all` | `all` | Which changes count as evidence |

### Diff scopes

- **`branch`**: files modified vs `origin/main` (or `master`/`develop`)
- **`uncommitted`**: staged and unstaged changes only
- **`plan-anchored`**: all commits since the `**Date**:` field in `plan.md`
- **`all`** (default): branch diff plus uncommitted changes

## Output

The command writes `verify-tasks-report.md` into the feature directory (`$FEATURE_DIR/`) and prints a confirmation. The report contains:

1. **Summary scorecard**: counts per verdict level, with `PARTIAL` split into `code` and `record`
2. **Flagged items**: `NOT_FOUND`, `PARTIAL (code)`, `PARTIAL (record)`, `WEAK` tasks with per-layer detail
3. **Verified items**: `VERIFIED` and `SKIPPED` tasks

### Interactive walkthrough

After the report is written, the command enters a sequential walkthrough for each flagged item in severity order (`NOT_FOUND` first, then `PARTIAL (code)`, then `PARTIAL (record)`, then `WEAK`). For each item it shows the evidence gap and offers four options:

| Option | What it does |
|--------|--------------|
| **I** (Investigate) | Reads referenced files, runs additional searches, and outputs a detailed analysis of the gap |
| **F** (Fix) | Proposes a specific minimal fix; does not apply it until you confirm with `y`. For a `PARTIAL (record)` item the fix is to the task's own line or note, not to code |
| **D** (Demote) | Proposes flipping the task's checkbox from `[X]` to `[ ]`; applies it only after you confirm with `y`. One character changes: no renumbering, reordering, deleting, or text edits, and never a `## Phase N: Convergence` header. The task re-enters the `/speckit.converge` → `/speckit.implement` loop. The right disposition for `NOT_FOUND` and `PARTIAL (code)` |
| **S** (Skip) | Moves to the next flagged item |

Reply `done` at any point to end the walkthrough early. The agent presents exactly one item per turn and never reveals future items in advance.

After the walkthrough completes, a `## Walkthrough Log` section is appended to the report with the disposition of each flagged item (investigated, fix proposed, demoted, skipped). The original scorecard, Flagged Items and Verified Items sections are never modified — they are the audit record, and a row that was `PARTIAL` before the walkthrough stays `PARTIAL` there even if a fix was applied; the disposition goes in the log. If fixes were applied, re-run `/speckit.verify-tasks` for a clean re-evaluation. If tasks were demoted, run `/speckit.converge` and `/speckit.implement`, then `/speckit.verify-tasks` again in a fresh session.

## Repository structure

```text
commands/
  speckit.verify-tasks.md      # The slash command (main deliverable)
specs/
  001-verify-tasks-phantom/    # Feature spec for this extension
    spec.md
    plan.md
    tasks.md
    data-model.md
    research.md
    quickstart.md
    checklists/
    contracts/
tests/
  fixtures/
    phantom-tasks/             # 12 tasks, 4 genuine + 6 planted phantoms + 2 convergence-phase tasks
    genuine-tasks/             # 10 tasks, all genuinely implemented
    edge-cases/                # Behavioral-only, malformed, and glob tasks
    scalability/               # 50-task synthetic fixture (session overflow test)
  expected-verdicts.md         # Expected evidence level for every fixture task
.specify/
  memory/constitution.md       # Design principles governing the extension
  templates/                   # spec-kit templates
  scripts/bash/                # Prerequisite and setup scripts
.github/
  agents/                      # Agent mode files (*.agent.md)
  prompts/                     # Prompt mode files (*.prompt.md)
```

## Testing with fixtures

See `tests/expected-verdicts.md` for step-by-step instructions on running fixtures, expected verdicts for every task, and pass/fail criteria.

## Design principles

The extension is governed by eight constitutional principles. The most critical:

- **Asymmetric Error Model**: a missed phantom is catastrophic; a false alarm is acceptable. Ambiguous evidence always yields `PARTIAL`/`WEAK`, never `VERIFIED`.
- **Agent Independence**: verification produces more reliable results in a session separate from the implementing agent, avoiding confirmation bias.
- **Pure Prompt Architecture**: 100% prompt-driven. No Python scripts or external binaries; only shell tools (`grep`, `find`, `git`). Works across Claude Code, GitHub Copilot, Gemini CLI, Cursor, Windsurf, and other spec-kit agents.
- **Verification Cascade**: mechanical layers (1-4) establish baseline evidence. Semantic assessment (layer 5) runs when no mechanical layer returned `negative`, and can downgrade `VERIFIED` to `PARTIAL` when it detects stubs or placeholders.

See [`.specify/memory/constitution.md`](.specify/memory/constitution.md) for the full set of principles.

## Complementary to `verify-tasks`

### The `/speckit.converge` core command

spec-kit's `/speckit.converge` (0.11.2 and later) asks: "What does the code still lack?" It reads every requirement, success criterion, acceptance scenario, plan decision, and constitution principle, assesses the present tree, and appends the unmet work as new tasks under a `## Phase N: Convergence` heading so `/speckit.implement` can finish it. It never reads git and never reports on whether a `[X]` was honest.

`verify-tasks` asks the opposite question: "Is each `[X]` true?" It never reads `[ ]` tasks and never finds work that has no task.

| | `/speckit.converge` | `verify-tasks` |
|---|---|---|
| **Direction** | Intent → code: what is not built | Record → code: what is falsely marked built |
| **Input** | Spec, plan, constitution, and all tasks regardless of mark | `[X]` tasks only |
| **Evidence** | Present tree, no git | Tree, git diff, callers, and a test run |
| **Catches** | Requirements with no task, unfinished `[ ]` work, unrequested code | Stubs, dead code, stale or false task text, claims the tree does not support |
| **Writes** | Appends tasks to `tasks.md` | A report; on confirmation, one checkbox or one task line |

They are complementary, and the cascade between them is a loop: implement, converge, implement the convergence tasks, converge again until it reports Converged, then run `verify-tasks` in a fresh session as the final gate. Convergence tasks carry a `per FR-003 (missing)` source-ref, and `verify-tasks` reads that exact requirement in Layer 5 instead of searching the spec for the concept. A `PARTIAL (code)` finding goes back into the loop by demoting the task (walkthrough action **D**). A `PARTIAL (record)` finding is fixed in place.

### The `spec-kit-verify` community extension

[spec-kit-verify](https://github.com/ismaelJimenez/spec-kit-verify) asks: "Does the implementation satisfy the spec?" It's a broad quality gate that checks requirement coverage, test coverage, spec intent alignment, and constitution compliance.

**verify-tasks** asks: "Did the agent actually do what it claimed to do?" It takes each individual `[X]`-marked task, traces it to specific files and symbols, and verifies mechanical evidence of implementation through a 5-layer cascade before falling back to semantic assessment.

| | spec-kit-verify | verify-tasks |
|---|---|---|
| **Unit of analysis** | Spec requirements, scenarios, constitution | Individual `[X]` tasks in tasks.md |
| **Verification method** | Agent semantic assessment across 7 categories | Mechanical cascade (grep, find, git diff) plus semantic stub detection |
| **Error model** | Balanced severity reporting | Asymmetric: missed phantoms are catastrophic, false flags are acceptable |
| **What it catches** | Spec-implementation misalignment | Tasks marked done that were never implemented |
| **Fresh-session recommendation** | No | Yes, for best results |

The two extensions are complementary. Run `verify` to check if the implementation is *correct*. Run `verify-tasks` to check if it's *complete*. A phantom completion will likely pass `verify` (the code that exists is fine) but will be caught by `verify-tasks` (the specific task's file was never created or modified).

### Code review and testing

The `verify-tasks` command confirms that code *exists and is wired up*, not that it's correct, efficient, secure, or well-tested. A function that exists, is imported, and appears in the diff will pass mechanical layers even if it has bugs. Layer 5 catches stubs and placeholders, but not logic errors. Always pair verification with code review and a thorough test suite.

## Requirements

- A spec-kit project with a `tasks.md` inside a feature directory
- spec-kit at or above the version named in `extension.yml` (`requires.speckit_version`)
- An AI agent that supports spec-kit slash commands (Claude Code, GitHub Copilot, Gemini CLI, Cursor, Windsurf, etc.)
- `git` (optional; layers 2 and 4 are skipped gracefully if unavailable)
- The spec-kit prerequisites script at `.specify/scripts/bash/check-prerequisites.sh`
- The following spec-kit core commands must have been run first: `speckit.specify`, `speckit.plan`, `speckit.tasks`, `speckit.implement`. These produce the artifacts (`tasks.md`, `plan.md`, `spec.md`) that `/speckit.verify-tasks` reads.
- `speckit.converge` is optional. The `after_converge` hook and the Layer 5 source-ref rule only matter when you use it.

## Troubleshooting

| Message | Meaning | Action |
|---------|---------|--------|
| `ERROR: Missing prerequisite: {file} not found in feature directory: {path}` | One of `spec.md`, `plan.md`, or `tasks.md` is missing from the feature directory | Run `/speckit.specify`, `/speckit.plan`, and `/speckit.tasks` first to create the required artifacts |
| `No completed tasks found to verify.` | No `[X]` tasks exist in `tasks.md` | Mark at least one task complete before running verification |
| `WARNING: Malformed task on line {n}: "{line}" -- skipping` | A line has a broken checkbox syntax or no task ID | Fix the malformed line in `tasks.md`; remaining tasks are still verified |
| `WARNING: Git unavailable -- Layer 2 (Git Diff) skipped for all tasks.` | No `.git` directory found, or `git` is not on PATH | Layers 1, 3, 4, and 5 still run; initialize a git repo for full coverage |
| `WARNING: Shallow clone detected -- Layer 2 diff coverage may be incomplete.` | The repo was cloned with `--depth` | Run `git fetch --unshallow` for complete history |
| `WARNING: No date found in plan.md -- falling back to scope=all` | `--scope plan-anchored` was requested but `plan.md` has no `**Date**: YYYY-MM-DD` field | Add a date field to `plan.md`, or use a different scope |
| `WARNING: Task ID not found: {id} -- skipping.` | A task ID passed as an argument does not exist in `tasks.md` | Check the ID spelling; use `/speckit.verify-tasks` without arguments to verify all tasks |
| `ERROR: Cannot write report to {path}: {reason}` | File system permission or path problem | The report is printed to stdout instead; check directory permissions |

## Verification accuracy by artifact type

The five-layer cascade is strongest on application source code (Python, JavaScript, TypeScript, Java, Go, etc.), where function names, class definitions, and import graphs give the mechanical layers clear signals.

For other artifact types, the cascade adapts its search strategies but with decreasing precision:

| Artifact type | Layers 1–2 (file + diff) | Layer 3 (content match) | Layer 4 (dead-code) | Overall confidence |
|---------------|--------------------------|------------------------|---------------------|-------------------|
| Application code | Strong | Strong | Strong | High |
| SQL schema objects (tables, views, types, indexes) | Strong | Moderate — searches for `CREATE`, `ALTER`, object names | Skipped (a `CREATE TABLE` needs no caller) | Moderate |
| SQL functions, procedures, triggers | Strong | Moderate — searches for `CREATE FUNCTION` etc. + name | Strong — checked for callers like application code, including callers in other components | High |
| Config files (YAML, TOML, JSON, .env) | Strong | Moderate — plain text key matching | Skipped (consumed by runtime) | Moderate |
| Shell scripts | Strong | Moderate — searches for function defs, variable assignments | Skipped (consumed by shell) | Moderate |
| Markdown, prompt files | Strong | Weak — searches for section headings, key phrases | Skipped (consumed by agent) | Low–Moderate |
| Binary/generated assets (images, PDFs, compiled output) | Strong (file exists) | Not applicable | Not applicable | Low — file existence only |

**This is by design.** The asymmetric error model means the cascade will flag uncertain results as `PARTIAL` or `WEAK` rather than silently pass them. A `WEAK` verdict on a SQL migration task doesn't mean the migration is wrong — it means the tool couldn't mechanically confirm it and wants a human to glance at it. When you see `WEAK` or `PARTIAL` on non-code artifacts, check them briefly during the interactive walkthrough and skip if they look fine.

## Authors

**Dave Sharpe** ([dave.sharpe@datastone.ca](mailto:dave.sharpe@datastone.ca)) at **[dataStone Inc.](https://github.com/datastone-inc)**: concept, design, and development

**[Claude (Anthropic)](https://www.anthropic.com)**: co-developed the implementation and test fixtures via GitHub Copilot

## License

[MIT](LICENSE)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
