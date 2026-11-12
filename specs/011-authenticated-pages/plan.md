# Implementation Plan: Analyse Pages Behind a Login

**Branch**: `011-authenticated-pages` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-authenticated-pages/spec.md`

## Summary

Let a run sign in to the product before it reviews anything, with no person
present, and make a page that was not reached as a signed-in visitor say so.

The developer adds one optional `signIn` block to the configuration: where
sign-in starts, an ordered list of `fill` and `click` steps that name their
targets by accessible name, and a required signed-in sign. Secrets are named in
the file and read from the environment.

uxlint carries the steps out itself, through the browser server it already
drives, in the throwaway profile it already uses. A live run (research R1)
established that this needs nothing new: the server's `fill` and `click` tools
resolve targets from the same page structure the analysis reads, the session
holds across pages, and the whole sign-in costs well under a second of tool
time on a responsive site.

Three things carry the feature's guarantees, and each is placed where it
cannot be forgotten:

- **Admission.** One function decides whether a captured page shows the
  signed-in sign. The delegate routes call it after their capture; the provider
  route wraps the capture tool the model is handed, so no signed-out capture
  can reach the model.
- **Redaction.** Every reply from the browser server, and the audit report
  read from disk, passes through a redactor built from the run's secrets
  before any other code sees it. The logger applies the same redactor.
- **Failure as a failed run.** A sign-in that fails records every page as
  `failed`, writes the report and exits 1 without consulting the gate.

No new status, no new dependency, no change to a run without a `signIn` block.

## Technical Context

**Language/Version**: TypeScript (ES modules), Node.js >=22.22.2; development and CI pinned to Node 24

**Primary Dependencies**: Existing only — `chrome-devtools-mcp` 1.7.0 (its
`fill` and `click` tools become required when a `signIn` block is present),
`@ai-sdk/mcp` for the client, `dotenv` for the environment, Winston for file
logging, `meow` for the CLI surface. No new runtime dependency.

**Storage**: None added. The session lives in the browser's throwaway profile
and ends with it. Secrets are held in memory for the life of the process.

**Testing**: Ava against the precompiled `dist/` output. Unit tests for the
models (validation, element matching, redaction, reason texts); service tests
with a scripted fake browser client; mock-model tests for the provider route;
the existing fake host agents for the delegate routes; one real-browser
integration suite against a fixture login site.

**Target Platform**: Developer workstations and CI runners (macOS, Linux,
Windows; containers included) — every place uxlint already runs.

**Project Type**: Single-project CLI

**Performance Goals**: One sign-in per run regardless of page count (SC-006).
Sign-in bounded at 30 s by default; measured at roughly 0.6 s of tool time on
a local form (two fills at 207 ms, a click at 185 ms, captures at 3–6 ms).
Zero additional browser calls per page when the sign is present: the check
reads the capture the page already takes.

**Constraints**: stdout and stderr stay reserved for the MCP transport — the
new command prints through `console-output.ts` only, after the browser has
closed. A secret value may appear in exactly one outbound message: the `fill`
argument sent to uxlint's own browser-server child. A configuration without a
`signIn` block must construct none of this feature's objects.

**Scale/Scope**: Four new source modules, one new command, edits to the four
run entry points and to the report. Sign-in descriptions of a handful of
steps; configurations of the size the project already targets (2–8 pages).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Code Quality Gates (NON-NEGOTIABLE)

**Pass.** Every change runs `npm run compile` → `npm run format` → `npm run lint`
in that order. No lint rule is changed and no `eslint-disable-next-line` is
introduced. Two existing rules shape the design rather than being worked
around: the ban on `console` and `process.stdout` outside `console-output.ts`
(the new command prints through that module), and `max-lines`, which
`tests/services/ai-service.spec.ts` already exceeds as a warning — the
provider-route tests for this feature go in a new spec file instead of making
that one longer.

### II. Test-First Development (NON-NEGOTIABLE)

**Pass, with the strategy stated per surface.** Tests are written and must fail
before implementation:

- **Models** (`sign-in.ts`, `secret-redaction.ts`): Ava unit tests — every row
  of the validation table, element matching including whitespace and
  ambiguity, the reached address, redaction of literal and URL-encoded values,
  every reason text.
- **`SignedInSession`**: service tests against a scripted fake browser client
  that replays captured structures — success, each failure kind, the wait
  window, recovery and its three outcomes, the time bound.
- **Provider route** (language model integration): `MockLanguageModelV4` from
  `ai/test`, asserting that a signed-out capture never appears in a request to
  the model and that the page closes as `failed`.
- **Delegate routes**: the existing fake host agents, asserting evidence
  contents and page status.
- **Components**: if the interactive display gains a signing-in state, a
  visual regression test with ink-testing-library; the wizard is untouched.
- **End to end**: one real-browser suite against the fixture login site, which
  also performs the secret sweep across every sink (SC-005).

### III. UX Consistency via Persona-First Design

**Pass.** The spec names its personas: the frontend engineer of a login-gated
product and the pipeline owner. The persona-facing surfaces are the
configuration block, the messages of a failed sign-in, and `uxlint sign-in`,
and each is specified in `contracts/` in the persona's terms (which step, what
the product showed). The Ink library-discovery requirement does not apply: no
new Ink component is introduced, and the only interactive change is one
progress message.

### IV. Performance Accountability

**Pass.** Goals are stated above with their measured basis (research R1) and
map to SC-006. The baseline is the same run without a `signIn` block; the
added cost is one bounded sign-in and a string scan per capture. Recovery is
bounded by the same limit and happens at most once per page.

### V. Simplicity & Minimalism

**Pass.** Each new piece is the smallest that carries its requirement:

- Two step kinds, not an action language (research R2).
- One signed-in test, read from a capture the run already takes (R3).
- No new page status: `failed` with a reason already means "not analysed" to
  the report and to the gate (R7).
- Redaction at the two places page content enters a run rather than at each
  place it leaves (R6).

One abstraction is new, `SignedInSession`, and it is justified by having four
callers (the provider route, both delegate routes, and `uxlint sign-in`) that
must agree exactly on what "signed in" means.

**Post-design re-check**: unchanged. The design added no dependency, no
status, no persisted state and no configuration key beyond the `signIn` block.

## Project Structure

### Documentation (this feature)

```text
specs/011-authenticated-pages/
├── plan.md              # This file
├── research.md          # Phase 0: R1 live run, R2–R10 decisions
├── data-model.md        # Phase 1: types, lifecycle, reason texts
├── quickstart.md        # Phase 1: eight validation scenarios
├── contracts/
│   ├── config-surface.md   # the signIn block and its validation
│   ├── cli-surface.md      # `uxlint sign-in`; changes to existing commands
│   └── report-surface.md   # report additions; what never appears
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
source/
├── models/
│   ├── sign-in.ts              # NEW  description types, validateSignIn, element
│   │                           #      matching, reached address, reason texts
│   ├── secret-redaction.ts     # NEW  resolveSecrets, createRedactor
│   ├── config.ts               # EDIT UxLintConfig.signIn
│   └── analysis.ts             # EDIT PageAnalysis.reachedUrl, RunProvenance.signedIn
├── services/
│   ├── sign-in.ts              # NEW  SignedInSession: establish, admit
│   ├── mcp-client.ts           # EDIT redacting client wrapper; sign-in tool check
│   ├── ai-service.ts           # EDIT wrapped capture tool, PageNotReached,
│   │                           #      session on the run, reached address
│   ├── measurement.ts          # EDIT redact the audit report read from disk
│   └── report-builder.ts       # EDIT setReachedUrl; record every page as failed
├── delegate/
│   ├── capture-pass.ts         # EDIT admission after capture; failed, not partial
│   ├── runner.ts               # EDIT establish before capture; failure path
│   └── driven/capture.ts       # EDIT same; writes the report itself on failure
├── infrastructure/
│   ├── config/config-io.ts     # EDIT call validateSignIn
│   ├── logger.ts               # EDIT redaction format
│   └── reports/report-generator.ts  # EDIT signed-in line, reviewed-page line
├── hooks/use-analysis.ts       # EDIT establish before the first page
├── ci-runner.ts                # EDIT establish before the first page
├── sign-in-check.ts            # NEW  the `uxlint sign-in` command
└── cli.tsx                     # EDIT route `sign-in`; help text

tests/
├── fixtures/login-site.ts      # NEW  form login, gated pages, /no-sign, /secret,
│                               #      /login-2step, /__expire
├── models/
│   ├── sign-in.spec.ts         # NEW
│   └── secret-redaction.spec.ts  # NEW
├── services/
│   ├── sign-in.spec.ts         # NEW  scripted fake browser client
│   └── signed-in-analysis.spec.ts  # NEW  provider route, mock model
├── delegate/
│   └── signed-in-capture.spec.ts   # NEW  both delegate routes
├── infrastructure/             # EDIT config validation, logger, report generator
├── integration/
│   └── signed-in-run.spec.ts   # NEW  real browser; secret sweep
├── cli/                        # EDIT `sign-in` routing and exits
└── ci-runner.spec.ts           # EDIT sign-in failure exits 1 without a gate

README.md                       # EDIT "Pages behind a login" section
```

**Structure Decision**: Single project, existing layout. Pure logic goes in
`models/` and is unit-tested there; everything that talks to the browser goes
in `services/`; the new command sits beside `ci-runner.ts` because, like it,
it is a headless entry point that returns an exit code.

## Design notes for the tasks phase

These are the points where the order of work or the placement of a change
matters. Detail is in the linked artifacts.

1. **Order.** Models first (validation, matching, redaction), then
   `SignedInSession` against a fake client, then the delegate capture path
   (the simplest caller), then the provider route's wrapped tool, then the
   four entry points, then the command, the report and the README. Story 2's
   refusal paths are built together with Story 1's admission, not after it:
   admission without refusal is the regression the spec's P1 pairing exists to
   prevent.
2. **The run assembles the session.** `createAIService` and
   `createDelegatedRun` already assemble the browser client; they resolve
   secrets, wrap the client with the redactor and construct the session there,
   so the four entry points receive it rather than each building their own.
3. **Secrets are resolved before the browser starts**, alongside configuration
   validation, so a missing one costs nothing (research R7).
4. **The provider route ends a refused page the way it ends an expired one.**
   `PageBoundExceeded` is the precedent: a typed reason, checked in
   `prepareStep`, closed with `failCurrentPage` (research R4).
5. **The audit's mode is pinned by a test** (research R10).
6. **`tests/fixtures/login-site.ts` is written before any integration test**
   and is the same site the quickstart uses.

## Complexity Tracking

No constitution violations to justify.
