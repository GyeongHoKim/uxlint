---
description: Verify tasks marked [X] in tasks.md are implemented, not phantom completions (marked done but backed by missing or dead code).
handoffs:
  - label: Re-implement Flagged Tasks
    agent: speckit.implement
    prompt: Re-implement the flagged tasks from the verify-tasks-report
    send: true
  - label: Find Unbuilt Work
    agent: speckit.converge
    prompt: Assess the codebase against spec, plan, and tasks and append any remaining unbuilt work as new tasks
    send: true
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

**Supported arguments**: Optional space/comma-separated task IDs to verify only specific tasks. Optional `--scope branch|uncommitted|plan-anchored|all` (default: `all`) to control which changes count as evidence.

Display the following advisory **immediately** before any other work:

> ⚠️ **FRESH SESSION ADVISORY**: For maximum reliability, run `__SPECKIT_COMMAND_VERIFY-TASKS_RUN__`
> in a **separate** agent session from the one that performed `__SPECKIT_COMMAND_IMPLEMENT__`.
> The implementing agent's context biases it toward confirming its own work.

**Scope**: this command grades the **record**. Every `[X]` is a claim that the work exists in the tree, and each claim is checked against the tree. It does not assess `[ ]` tasks, spec coverage, unrequested code, or constitution compliance — that is `__SPECKIT_COMMAND_CONVERGE__`, which finds what is *not built*; this command finds what is *falsely marked built*. The two pair: run `__SPECKIT_COMMAND_CONVERGE__` until it reports Converged, then run this command in a fresh session as the final gate.

## Pre-Execution Checks

**Check for extension hooks (before verification)**:

- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_verify-tasks` key
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- When constructing command invocations from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `/speckit-git-commit`.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):

    ```text
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

  - **Mandatory hook** (`optional: false`):

    ```text
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```

    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.

- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Outline

**Asymmetric error model** — applies to all layers below: a false flag (flagging genuine work) is cheap — the developer dismisses it in seconds during the walkthrough. A missed phantom (returning `VERIFIED` for a task that was never implemented) is a **catastrophic failure of this tool** — it means `__SPECKIT_COMMAND_VERIFY-TASKS_RUN__` did the one thing it exists to prevent. When in doubt, flag.

1. **Setup**: Run `.specify/scripts/bash/check-prerequisites.sh --json` from repo root and parse FEATURE_DIR. All paths must be absolute. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot"). Verify `$FEATURE_DIR/spec.md`, `$FEATURE_DIR/plan.md`, and `$FEATURE_DIR/tasks.md` all exist — if any are missing, `ERROR: Missing prerequisite: {file} not found in feature directory: $FEATURE_DIR` and stop.

2. **Task parsing**: From `$FEATURE_DIR/tasks.md`, extract all `[X]` (completed) tasks into a **completed task list** used by all subsequent layers. For each:
   - Extract task ID (first token after checkbox: `T001`, `T-003`, `1.1`, `FEAT-05`, etc.). If no ID found, synthesize `LINE-{n}` and emit `WARNING: No task ID found on line {n}: "{line}"`.
   - Extract optional markers: `[P]` (parallel), `[US1]`/`[US2]` (user story labels).
   - Extract file paths: exact paths, backtick-wrapped paths, glob patterns, directory references.
   - Extract code references: backtick-wrapped symbol names (function/class/type names).
   - Extract acceptance criteria: indented lines beginning with `Given`, `When`, `Then`, or `-`.
   - Extract the convergence source-ref when present: a trailing `per <source-ref> (<gap-type>)` as written by `__SPECKIT_COMMAND_CONVERGE__` — e.g. `per FR-003 (missing)`, `per US1/AC2 (partial)`, `per plan: storage decision (partial)`, `per Constitution II (contradicts)`. Record `source_ref` and `gap_type` on the task; Layer 5 uses them. Tasks under a `## Phase N: Convergence` heading are ordinary tasks in every other respect.
   - Record line number and nesting depth.
   - If `$ARGUMENTS` contains task IDs, restrict to those IDs only. Emit `WARNING: Task ID not found: {id} — skipping` for any filter ID not in `tasks.md`.
   - If no `[X]` tasks found: output `No completed tasks found to verify.` and stop cleanly.

3. **Diff scope determination**: Parse `--scope` from `$ARGUMENTS` (default: `all`). Detect git availability. If git unavailable, skip all git-dependent layers and note in report. Otherwise determine base ref by trying `origin/main`, `origin/master`, `origin/develop`, `main`, `master` in order. Collect the list of changed files for the scope:
   - `branch`: diff base ref to HEAD
   - `uncommitted`: diff HEAD to working tree
   - `plan-anchored`: extract date from `$FEATURE_DIR/plan.md`, list commits since that date. If no date found in plan.md, warn and fall back to `all`.
   - `all` (default): diff base ref to HEAD plus uncommitted/untracked changes
   - If shallow clone detected, warn that diff coverage may be incomplete.

   **Test gate (execution evidence)**: Layers 1–4 can only grep. A task whose claim is "the suite is green" or "full `make check` green" has nothing to grep, and marking it `WEAK` or `SKIPPED` tells the developer nothing. So: if the completed task list names a canonical test command (a `make check`, `pytest`, `cargo test`, `npm test`, or a project runner named in the repository's agent guidance), **run it once, in the background, at the start of step 4**, against the current tree, with output to a scratch log — and continue the mechanical layers while it runs. When it finishes, record the exit status and the pass/fail summary lines in the report header under "Execution evidence gathered this run". Rules:
     - Run it only if the environment can (a reachable database, an installed toolchain); if it cannot, say so in the report header and fall back to the layers as written. Never fabricate a run.
     - A verify task whose named check passed in this run is `✅ VERIFIED (by execution)`, not `WEAK`; one whose named check failed or was not run stays at whatever the layers give it. A green run is evidence for the task's *claim*; it says nothing about whether the task's *record* (a commit message, a note) exists — that stays a Layer 5 question.
     - Do not run anything destructive or state-changing beyond what the project's own check target does. If the check requires a private lab, stopped services, or a manual step, do not improvise it — report it as not run.

4. **Verification cascade**: Process each completed task individually through all five layers before moving to the next task.

   **Checkpoint rule**: this step is long and otherwise silent. After every phase of `tasks.md` (or every ~10 tasks when the file has no phase headings), print **one line** to the user before continuing: `checkpoint: T0nn–T0mm done — {n} verified, {n} flagged so far; next: {phase or range}`. Print it even when nothing is flagged. Do not print per-task detail here — that is the report's job — and do not stop for input; the only hard stop is the walkthrough in step 6.

   For each completed task:

   **Layer 1 — File existence**: Check whether all referenced file paths exist. Expand glob patterns. If a file is missing and git is available, check for renames. Result: `positive` (all present), `negative` (any missing), or `not_applicable` (no file paths in task).

   **Layer 2 — Git diff cross-reference**: Check whether any referenced file appears in the changed files list from step 3. Result: `positive` (at least one changed), `negative` (none changed), `not_applicable` (no file paths), or `skipped` (git unavailable).

   **Layer 3 — Content pattern matching**: Search referenced files for the expected symbols. Adapt search strategy to artifact type:

   | Artifact Type | Symbol examples | Strategy |
   |---------------|----------------|----------|
   | Application code (`.py`, `.js`, `.ts`, `.java`, `.go`, `.rs`, etc.) | Function/class/method definitions | Search for definition-prefix patterns (`def`, `class`, `function`, `export`, `const`) |
   | SQL (`.sql`, `.ddl`) | Table/column/constraint names | Search for DDL keywords + symbol name |
   | Config (`.yml`, `.yaml`, `.toml`, `.json`, `.env`) | Key names, section headers | Plain text match |
   | Shell (`.sh`, `.bash`) | Function/variable names | Search for declaration patterns |
   | Markdown/prompt (`.md`) | Section headings, key phrases | Heading pattern match |
   | CI/CD (`Dockerfile`, `Makefile`, `.github/` YAML) | Job/stage/target names | Plain text match |

   For unlisted artifact types, fall back to plain text match. Only search files confirmed present by Layer 1. Result: `positive` (all symbols found), `negative` (some missing), or `not_applicable` (no code references in task).

   > **Note**: Content matching is most precise on application source code. For non-code artifacts, matches may produce false positives — acceptable per the asymmetric error model.

   **Layer 4 — Dead-code detection**: Assess whether usage references are expected for the artifact type. Skip this layer (`not_applicable`) only for artifacts consumed purely *by being present*: config files, CI/CD, prompts, static assets, test files, and SQL **schema objects** (tables, columns, types, views, indexes — a `CREATE TABLE` needs no caller). **Do NOT blanket-skip SQL.** A SQL **function / procedure / trigger** is callable code: it is dead if nothing `PERFORM`/`SELECT`/`CALL`s it or wires it to an event trigger, exactly like an uncalled application function — being in a `.sql` file does not exempt it. Crucially, a backend function whose *intended caller is another component* — e.g. a stored function that a spec or contract says a **separate component** (a code generator, a client, a job runner) calls as `SELECT schema.fn(...)` — is "wired" only if that emitter actually exists; treat the contract claim "component Y calls X" as a **checkable assertion**, not evidence. (This is the exact gap that lets a fully-implemented-but-never-invoked backend function pass: body present, signature found, but zero callers across the seam.) Proceed for application code symbols and for SQL callable objects.

   For each symbol found in Layer 3:
   - **Determine search scope**: Walk up from the definition file's directory to find the nearest project root (directory containing `__init__.py`, `setup.py`, `pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, `Makefile`, or the parent of a `src/` directory). Fall back to repository root if none found. **Exception — cross-component callables**: when the symbol's legitimate caller may live in a *sibling* component or a different language (e.g. a SQL function whose only legitimate caller is a C++ or Python component that builds the call string, or any symbol whose spec/contract names a caller in another component), search the **whole repository** instead — a per-project-root scope would never see the cross-component emitter and would falsely report the symbol dead, or (if the definition's own root contains the only grant/comment) falsely pass it. Include the caller's language extensions in the grep — the `schema.fn(...)` string may be assembled in `.cpp`, `.py`, `.rs` or `.java` source.
   - **Search for references** in source code files under that scope, excluding the definition site (the line or block where the symbol is declared). Search **only source code files** (by extension: `.py`, `.js`, `.ts`, `.java`, `.go`, `.rs`, `.rb`, `.c`, `.cpp`, `.h`, `.cs`, `.php`, `.sh`, etc.) to automatically exclude task files, markdown specs, reports, and docs that mention symbols by name. Same-file references outside the definition site count as wired.
   - Discard matches inside comments or string literals (unless the string is a dynamic import or reflective call).
   - If references remain → symbol is wired (`positive`). If none remain → dead code (`negative`); record `"{symbol}" declared in {file} but never imported/called/referenced`.

   > **Critical**: Use `grep -rn` (not `git grep`) for dead-code scanning. `git grep` only searches tracked files — implementation files that are untracked, newly added, or in untracked directories will be invisible, causing false dead-code reports.

   Aggregate: all symbols wired → `positive`; any dead → `negative`; none to check → `not_applicable`. When in doubt about whether an artifact type needs wiring, default to applicable (asymmetric error model).

   **Layer 5 — Semantic assessment**: Run when no mechanical layer (1–4) returned `negative` — i.e., the task would otherwise be VERIFIED or SKIPPED. Read the referenced files and `$FEATURE_DIR/spec.md`. Evaluate whether the described behavior appears genuinely implemented — not just structurally present (stub functions, empty bodies, placeholder returns, TODO comments). Always label as interpretive: `⚠️ Interpretive: {explanation}`.

   **Source-ref rule**: when the task carries a convergence `source_ref` (step 2), do not search `spec.md` for the concept. Read that exact item — the FR or SC by number, the user story's acceptance scenario, the named plan decision, or the constitution principle — and assess the code against its text. The original converge finding named what was lacking; for a `partial` or `contradicts` gap type the question is whether *that specific lack* is now closed, not whether the area looks implemented in general. If the source-ref cannot be found in the artifact, say so in the row and fall back to the concept search.

   Result: `positive` (behavior visibly implemented and connected), `negative` (stub, placeholder, or no relevant logic found), or `not_applicable` (no files readable or no behavior to evaluate).

   > **Downgrade rule**: A high-confidence semantic `negative` can downgrade a mechanically-verified task to `PARTIAL`. This catches the critical case where a stub function passes all mechanical layers (file exists, file changed, symbol defined, symbol imported) but implements nothing. The downgrade must cite specific evidence (e.g., empty function body, `pass`/`TODO`/`NotImplementedError`, hardcoded return values).

   **Verdict assignment**: After all five layers complete for this task, combine results into a final verdict:

   | Verdict | Criteria |
   |---------|----------|
   | `✅ VERIFIED` | ALL applicable mechanical layers (1–4) return `positive` AND Layer 5 is `positive` or `not_applicable` |
   | `🔍 PARTIAL` | At least one mechanical layer `positive` AND at least one `negative` from any layer (including semantic downgrade) |
   | `⚠️ WEAK` | Only semantic layer `positive`, all mechanical layers `not_applicable` or `skipped` |
   | `❌ NOT_FOUND` | No layer returns `positive` |
   | `⏭️ SKIPPED` | ALL layers `not_applicable` — no verifiable indicators |

   Key rules:
   - A task whose only claim is a test run that the step 3 test gate executed green this session is `✅ VERIFIED (by execution)`; the report says so in the row so the reader knows the credit came from a run, not a grep
   - A semantic `negative` with cited evidence downgrades `VERIFIED` → `PARTIAL`
   - `not_applicable` and `skipped` layers do not count against `VERIFIED` — only `negative` layers prevent it
   - `SKIPPED` tasks are not failures — they are behavioral-only tasks

   **PARTIAL qualifier**: every `🔍 PARTIAL` row carries one of two tags, so the reader knows which loop to enter:

   | Tag | Meaning | Disposition |
   |-----|---------|-------------|
   | `🔍 PARTIAL (code)` | The work is missing, incomplete, or unwired: a symbol defined nowhere, dead code, a stub or placeholder body, a described behavior absent, a named file missing with no rename found | The task is not done. Demote it (walkthrough action **D**) so `__SPECKIT_COMMAND_CONVERGE__` and `__SPECKIT_COMMAND_IMPLEMENT__` pick it up |
   | `🔍 PARTIAL (record)` | The work exists and satisfies the task's intent, but the task's own text or note misdescribes it: the file was renamed or moved (Layer 1 rename check), the symbol is defined *and wired* in a different file than the task names, the only `negative` is Layer 2 (present and wired but untouched in this scope), or Layer 5 finds the behavior implemented while a claim in the task text or its note is false or stale | The code is done. Fix the record (walkthrough action **F**); no code change |

   To tell them apart when Layer 1 or Layer 3 is `negative` and the task names symbols, search the repository for the symbol's *definition* (same file-type rules as Layer 4). Defined elsewhere, wired, and a targeted read of that definition (interpretive, labelled as in Layer 5) shows it implements the described behavior → `record`. Otherwise → `code`. This search is part of verdict assignment, not Layer 5, which does not run once a mechanical layer is `negative`. When the classification is unclear, tag `code`: a record gap misfiled as code costs one dismissal in the walkthrough; a code gap misfiled as record hides missing work (asymmetric error model).

5. **Report generation**: Write `$FEATURE_DIR/verify-tasks-report.md` (overwrite if exists). Include:
    - Header with date, scope, task count, the fresh session advisory, and the step 3 test-gate execution evidence (command, exit status, summary lines) or the reason it was not run
    - Summary scorecard (verdict counts; `PARTIAL` shown as separate `code` and `record` rows)
    - Flagged items section (NOT_FOUND → PARTIAL (code) → PARTIAL (record) → WEAK), each with a per-layer detail table
    - Verified items table
    - Unassessable items table (SKIPPED)
    - Machine-parseable verdict line per task: `| {TASK_ID} | {EMOJI} {VERDICT} | {summary} |`, where `{VERDICT}` carries its qualifier when it has one: `PARTIAL (code)`, `PARTIAL (record)`, `VERIFIED (by execution)`

    Output: `✅ Report written to: {FEATURE_DIR}/verify-tasks-report.md`
    If report cannot be written, output to stdout instead.

6. **Interactive walkthrough** *(multi-turn — one item per message)*: Present flagged items one at a time in severity order (NOT_FOUND first, then PARTIAL (code), then PARTIAL (record), then WEAK). If no flagged items, output `✅ No flagged items — verification complete.` and skip to step 7.

    **For each flagged item, output exactly one item and then STOP.** Do not display the next item until the user has replied. Each message must follow this template:

    ```text
    ### Flagged Item {i} of {total}: {TASK_ID} — {VERDICT_EMOJI} {VERDICT}

    **Task**: {task description}
    **Evidence gap**: {what was missing or failed}

    **Actions**: **I** — investigate further | **F** — propose fix | **D** — demote to `[ ]` | **S** — skip | **done** — end walkthrough

    Awaiting your choice:
    ```

    **CRITICAL**: After printing the block above, **end your response immediately**. Do NOT print the next flagged item, do NOT continue to step 7, and do NOT add any further output. You must yield control and wait for the user to reply with one of the action choices before proceeding. This is a hard stop — treat it as a turn boundary.

    When the user replies:
    - **I**: Investigate the evidence gap in detail (read files, check imports, etc.), then re-display the same action prompt for this item and STOP again.
    - **F**: Propose a fix (do not apply without explicit confirmation), then re-display the action prompt and STOP again. For a `PARTIAL (record)` item the fix is to the record — the flagged task's own line in `tasks.md` or the note it names — not to code.
    - **D**: Propose demoting the task: show the exact `tasks.md` line and the one-character change from `[X]` to `[ ]`. Apply only after explicit confirmation (`y`). The edit flips that single checkbox and nothing else — no renumbering, reordering, or deleting, no change to the task text, and never a `## Phase N: Convergence` header — so `__SPECKIT_COMMAND_CONVERGE__` and `__SPECKIT_COMMAND_IMPLEMENT__` pick the task up unchanged. Log as demoted, then display the **next** flagged item and STOP again. This is the right disposition for `NOT_FOUND` and `PARTIAL (code)`.
    - **S**: Log as skipped, then display the **next** flagged item using the template above and STOP again.
    - **done** / **stop** / **exit**: End the walkthrough early.

    > Each disposition is collected for the `## Walkthrough Log` appended after the walkthrough. The original report — scorecard, Flagged Items, and Verified Items — is never modified during this process.

    After the last flagged item is resolved (or the user ends early): `✅ Walkthrough complete. {n} of {total} flagged items addressed.`

    Append a `## Walkthrough Log` section to the report with the disposition of each flagged item (investigated, fix proposed, demoted, skipped).

    **CRITICAL — report immutability**: The **only** permitted change to the report file is appending the `## Walkthrough Log` section. Do **NOT** edit, promote, or re-score any row in the original Flagged Items section or Verified Items table — those sections are the immutable audit record. A task that was `🔍 PARTIAL` before the walkthrough must remain `🔍 PARTIAL` in the original table even if a fix was applied during the walkthrough. The Walkthrough Log is the correct place to record the disposition (e.g., `🔍 PARTIAL → ✅ VERIFIED`). If fixes were applied, suggest re-running `__SPECKIT_COMMAND_VERIFY-TASKS_RUN__` for a clean re-evaluation. If tasks were demoted, suggest the `__SPECKIT_COMMAND_CONVERGE__` / `__SPECKIT_COMMAND_IMPLEMENT__` loop, then this command again in a fresh session.

7. **Check for extension hooks**: After walkthrough, check if `.specify/extensions.yml` exists in the project root.
    - If it exists, read it and look for entries under the `hooks.after_verify-tasks` key
    - If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue normally
    - Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
    - For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
      - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
      - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
    - Report the verification outcome (scorecard and walkthrough summary) in-session before listing any hooks, so users can decide whether to run optional follow-up commands.
    - When constructing command invocations from hook command names, replace dots (`.`) with hyphens (`-`). For example, `speckit.git.commit` → `/speckit-git-commit`.
    - For each executable hook, output the following based on its `optional` flag:
      - **Optional hook** (`optional: true`):

        ```text
        ## Extension Hooks

        **Optional Hook**: {extension}
        Command: `/{command}`
        Description: {description}

        Prompt: {prompt}
        To execute: `/{command}`
        ```

      - **Mandatory hook** (`optional: false`):

        ```text
        ## Extension Hooks

        **Automatic Hook**: {extension}
        Executing: `/{command}`
        EXECUTE_COMMAND: {command}
        ```

        After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.

    - If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Historical Branch Notes

When using `--scope branch` against a previously-completed feature branch: files deleted in subsequent commits will cause Layer 1 to return `negative`. Note in the flagged detail that the file may have been deleted and suggest checking with `git show` for original presence.
