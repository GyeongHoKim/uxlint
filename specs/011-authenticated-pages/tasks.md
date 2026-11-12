---
description: 'Task list for 011-authenticated-pages'
---

# Tasks: Analyse Pages Behind a Login

**Input**: Design documents from `/specs/011-authenticated-pages/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included and **not optional**. Constitution principle II makes
Test-First Development non-negotiable in this project: tests are written first,
must fail (red), and only then is the implementation written. Every phase below
therefore opens with its red tests.

**Organization**: Grouped by user story so each can be implemented, tested and
delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task serves (US1, US2, US3, US4)
- Every task names the file it touches

## Path Conventions

Single project. Source under `source/`, tests under `tests/`, both at the
repository root, per [plan.md](./plan.md). Ava runs against the compiled `dist/`
output, so `npm run build` precedes any test run. After every code change:
`npm run compile` → `npm run format` → `npm run lint`, in that order.

---

## Phase 1: Setup

**Purpose**: The two test doubles every later phase is written against.

- [X] T001 [P] Create the fixture login site in `tests/fixtures/login-site.ts`: an exported `startLoginSite({password})` returning `{baseUrl, close, expireSessions, signInCount}` over `node:http` on `127.0.0.1` port 0, serving a form at `/login` (labelled fields `Email` and `Password`, a `Sign in` button, an `alert` reading `Invalid email or password` on rejection), an `HttpOnly` session cookie, `/dashboard`, `/settings` and `/billing` that redirect signed-out visitors to `/login` and show a `Sign out` button when signed in, `/no-sign` reachable signed in with no `Sign out` button, `/secret` printing the account password, `/login-2step` asking for email and password on separate screens with a `Next` button, and `/__expire` invalidating every session; when run as a script it prints its base URL and reads the password from `LOGIN_SITE_PASSWORD`
- [X] T002 [P] Create the scripted browser client in `tests/fixtures/sign-in-browser.ts`: an exported `scriptedBrowser(script)` returning an `MCPClient`-shaped object whose `callTool` and `tools()` replay page structures in the format research R1 recorded (`## Latest page snapshot`, `uid=1_0 RootWebArea "Title" url="…"`, `uid=1_4 textbox "Email "`), answer `fill` with `Successfully filled out the element` and `click` with `Successfully clicked on the element`, and record every call with its arguments in an exported `calls` array

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The models, the configuration key and the session object. Every
story calls these; none can start before they exist.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests (write first, must fail)

- [X] T003 [P] Write `tests/models/sign-in.spec.ts` covering `validateSignIn`: one test per row of the validation table in `contracts/config-surface.md` asserting the dotted key reported (`signIn`, `signIn.url`, `signIn.steps`, `signIn.steps[2]`, `signIn.signedIn`, `signIn.signedIn.name`, `signIn.timeoutMs`, and an unknown key such as `signIn.steps[0].selector`), plus an absent block returning no issue
- [X] T004 [P] Add to `tests/models/sign-in.spec.ts` the element-matching tests: a name matches after trimming and collapsing whitespace (`"Email "` matches `Email`), comparison is case-sensitive, a `fill` without `role` matches only `textbox`, `searchbox` or `combobox`, a `click` without `role` matches only `button` or `link`, an explicit `role` narrows, zero matches reports `not-found` and two report `ambiguous`; the signed-in sign matches on name and optional role and is not satisfied by a substring of a longer name
- [X] T005 [P] Add to `tests/models/sign-in.spec.ts` the reached-address tests (read from `RootWebArea … url="…"`, undefined when the root carries none, equal after ignoring fragment and trailing slash) and one test per row of the reason-text table in `data-model.md`, asserting the exact text and that `describeShown` yields the reached address, the page title and the names of any `alert` elements
- [X] T006 [P] Write `tests/models/secret-redaction.spec.ts`: `resolveSecrets` returns `resolved` with a value per `secret` name, `missing` listing every unset name, and `unusable` for an empty value or one under 4 characters; `createRedactor` replaces a value with `[redacted]` in its literal and URL-encoded forms, replaces the longest value first when one contains another, leaves `value:` literals alone, and is the identity function when there are no secrets
- [X] T007 [P] Add to `tests/infrastructure/config/config-io.spec.ts` tests asserting that `configIO.validateConfig` accepts a configuration with a well-formed `signIn` block, accepts one with none, throws a `ConfigurationError` carrying the dotted key for a malformed one (FR-024), and throws one keyed `pages[1].signIn` when an entry of `pages` carries a `signIn` key, saying that sign-in is set once for the whole run (FR-016)
- [X] T008 [P] Add to `tests/services/mcp-client.spec.ts`: `requireSignInTools` throws an error naming the missing tool when the browser server offers no `fill` or no `click`, in the wording `narrowBrowserTools` uses, and returns without error when both are present
- [X] T009 Write `tests/services/sign-in.spec.ts` against `tests/fixtures/sign-in-browser.ts` covering `SignedInSession.establish`: opens `signIn.url` first, re-captures the structure before every step, sends the secret only as the `value` argument of a `fill` call, returns `signed-in` once the sign appears, and returns each `SignInFailure` kind (`step-failed` with `not-found`, `ambiguous` and `tool-error`; `sign-absent`; `timed-out` at `timeoutMs`, default `30_000`; `not-opened`) with a `shown` that has passed through the redactor; a step whose target is not yet in the structure is retried on fresh captures for up to 5 s before it fails as `not-found`
- [X] T010 Add to `tests/services/sign-in.spec.ts` the `admit` tests: a capture showing the sign is `admitted` with a redacted snapshot and no further browser call; an absent sign is re-checked on fresh captures for up to 5 s before recovery; recovery signs in again exactly once, re-opens the page and re-captures; the three rows of the recovery table in research R5 yield `refused` with `session-lost`, `admitted`, and `refused` with `sign-missing`; `reachedUrl` is set only when it differs from the configured address
- [X] T011 Show the user the red tests written in T003–T010 and wait for their approval before starting any implementation task of Phase 2, as constitution principle II requires; record the date and what was approved under `## Approvals` in `specs/011-authenticated-pages/tasks.md`

### Implementation

- [X] T012 [P] Implement `source/models/sign-in.ts`: the `SignInDescription`, `SignInStep`, `ElementMatcher`, `SignInOutcome`, `SignInFailure`, `PageAdmission` and `NotReachedReason` types exactly as in `data-model.md`; `validateSignIn` returning the first issue with a dotted key in the shape `validateBrowserSettings` uses; `findElements`, `hasSignedInSign`, `reachedUrlOf`, `sameAddress`, `describeShown`; the reason-text functions; and `requiredSignInTools = ['fill', 'click'] as const` (makes T003–T005 pass)
- [X] T013 [P] Implement `source/models/secret-redaction.ts`: `resolveSecrets(description, environment)` returning `ResolvedSecrets`, and `createRedactor(values)` returning a `Redactor` (makes T006 pass)
- [X] T014 Add `signIn?: SignInDescription` to `UxLintConfig` in `source/models/config.ts` and call `validateSignIn` from `validateConfig` in `source/infrastructure/config/config-io.ts`, throwing `ConfigurationError` with the issue's message and key as the `thresholds`, `browser` and `analysis` blocks do; in `validatePage` reject a `signIn` key on a page with the key `pages[{index}].signIn` (makes T007 pass)
- [X] T015 [P] Add `reachedUrl?: string` to `PageAnalysis` and `signedIn?: boolean` to `RunProvenance` in `source/models/analysis.ts`, each documented with when it is present
- [X] T016 [P] In `source/services/mcp-client.ts`, add `requireSignInTools(tools)` that throws the same kind of startup error `narrowBrowserTools` does when `fill` or `click` is missing (makes T008 pass)
- [X] T017 Implement `SignedInSession` in `source/services/sign-in.ts` with `establish()`, `admit(pageUrl, snapshot)` and `redact`, calling the browser client's `navigate_page`, `take_snapshot`, `fill` and `click` directly, bounding each sign-in with `withDeadline` from `source/services/deadline.ts`, never passing a tool argument to the logger, and exporting `checkSignInSecrets(config)` that returns the missing-secret or unusable-secret message or undefined (makes T009 and T010 pass)

**Checkpoint**: A `signIn` block validates, and a session can sign in to and
admit pages from a scripted browser. No route uses it yet.

---

## Phase 3: User Story 1 - A headless run reviews pages behind a login (Priority: P1) 🎯 MVP

**Goal**: With a valid account, every route signs in once and reviews each
configured page as the signed-in visitor.

**Independent Test**: Against the fixture site, a headless run with a valid
account reviews every configured page with its own content and no finding
describes the login screen.

### Tests for User Story 1 (write first, must fail)

- [X] T018 [P] [US1] Write `tests/services/signed-in-analysis.spec.ts` with `MockLanguageModelV4` from `ai/test`: when the run has a session and the capture shows the sign, the model receives the capture and the page closes as today; when the capture does not show the sign, no request to the model contains that capture, the stage does not advance, no snapshot is recorded, and the page closes as `failed` with the admission's reason; and with a session present the tools offered to the model at every stage are exactly the ones offered without one, never `fill` or `click` (FR-007)
- [X] T019 [P] [US1] Write `tests/delegate/signed-in-capture.spec.ts`: `capturePage` with a session returns the redacted snapshot and `reachedUrl` for an admitted page, and an empty snapshot with a `failureReason` and a `notReached` reason for a refused one; `assembleReport` closes a `notReached` page with `failCurrentPage` (status `failed`) and an ordinary capture failure as `partial` as before
- [X] T020 [P] [US1] Add to `tests/ci-runner.spec.ts`: with a `signIn` block the run calls `establish` exactly once before the first page and once in total across several pages (SC-006), and sets `signedIn: true` in provenance; with no `signIn` block no session is constructed and the report equals the one produced before this feature (FR-023, SC-007)
- [X] T021 [P] [US1] Add the same two assertions to `tests/hooks/use-analysis.spec.tsx` for the interactive route, plus that a signing-in progress message is published before the first page's
- [X] T022 [P] [US1] Add to `tests/delegate/runner.spec.ts` and `tests/delegate/driven/capture.spec.ts` that each route establishes the session once after connecting and before capturing any page, and that the browser server lacking `fill` or `click` is a startup failure only when a `signIn` block is present
- [X] T023 [P] [US1] Add to `tests/services/measurement-parsing.spec.ts` a test pinning the audit call's arguments to `mode: 'snapshot'`, with a comment citing research R10: `navigation` mode would reset storage and sign every run out
- [X] T024 [P] [US1] Add to `tests/components/analysis-progress.spec.tsx` a visual regression test with ink-testing-library rendering the progress display while the run is signing in, asserting the frame shows `Signing in…` and no page counter for a page that has not started
- [X] T025 [US1] Write `tests/integration/signed-in-run.spec.ts` against `tests/fixtures/login-site.ts` and a real headless Chrome, following the skip convention `tests/integration/browser-preflight.spec.ts` uses when no browser is available: `establish` signs in through the real form and the two-screen form, the session persists across `/dashboard`, `/settings` and `/billing`, each is admitted, and the fixture's `signInCount` is 1; one sign-in against the fixture completes in under 5 s, with the measured time written to the test log so it can be recorded as the feature's baseline (SC-006)
- [X] T026 [US1] Show the user the red tests written in T018–T025 and wait for their approval before starting any implementation task of User Story 1, as constitution principle II requires; record the date and what was approved under `## Approvals` in `specs/011-authenticated-pages/tasks.md`

### Implementation for User Story 1

- [X] T027 [US1] In `source/services/ai-service.ts`, have `createAIService` and `createDelegatedRun` build the session when `config.signIn` is present (resolve secrets, construct `SignedInSession` over the browser client) and expose it as `session?` on `AnalysisRun` and `DelegatedRun`; construct nothing when the block is absent; call `requireSignInTools` on the browser server's tools when the block is present and never otherwise; accept an injected session in the overrides for tests (makes T022's startup assertion pass)
- [X] T028 [US1] In `AIService.analyzePage` in `source/services/ai-service.ts`, when the run has a session wrap the `take_snapshot` tool's `execute` so its reply passes through `session.admit(page.url, text)`: an admitted reply is returned with the admission's snapshot and its `reachedUrl` recorded on the page; a refused one returns an empty failed capture and sets a `PageNotReached` reason that `prepareStep` throws, mirroring `PageBoundExceeded`, so the page closes through `failCurrentPage(reason, page)` (makes T018 pass)
- [X] T029 [US1] In `source/delegate/capture-pass.ts`, give `capturePage` and `captureAllPages` an optional session: after a successful capture call `session.admit`, return the admitted snapshot and `reachedUrl`, or an empty snapshot with `failureReason` and `notReached`; skip measurement for a refused page; add `reachedUrl?` and `notReached?` to `CapturedPage`; have `assembleReport` close a `notReached` page with `failCurrentPage` (makes T019 pass)
- [X] T030 [US1] Add `setReachedUrl(url)` to `ReportBuilder` in `source/services/report-builder.ts`, carried into the completed and failed `PageAnalysis`, with a unit test in `tests/services/report-builder.spec.ts`
- [X] T031 [US1] In `source/ci-runner.ts`, after the run is created and provenance is set, call `run.session?.establish()` before the page loop, record `signedIn: true` in provenance on success, and throw the failure's reason text on failure so the existing failed-run path reports it (makes T020 pass)
- [X] T032 [P] [US1] In `source/hooks/use-analysis.ts`, do the same before the first page and publish a `Signing in…` progress message through the existing progress callback, changing `source/components/analysis-progress.tsx` only if T024 shows the existing display cannot render it (makes T021 and T024 pass)
- [X] T033 [P] [US1] In `source/delegate/runner.ts`, establish the session after `narrowBrowserTools` and before `captureAllPages`, pass it to `captureAllPages`, and set `signedIn` in provenance (makes T022's runner assertions pass)
- [X] T034 [P] [US1] In `source/delegate/driven/capture.ts`, establish the session after `narrowBrowserTools` and before `captureAllPages`, pass it through, and include `signedIn` in the session's provenance (makes T022's capture assertions pass)

**Checkpoint**: A run with a valid account reviews signed-in pages in all four
routes (T025 green). A failed sign-in still ends the run through the generic
failure path, without a report — User Story 2 replaces that.

---

## Phase 4: User Story 2 - A page that was not reached says so (Priority: P1)

**Goal**: A sign-in that fails, a secret that is missing and a page that lost
its session are each reported as what they are, and no login screen is
reviewed in a configured page's place.

**Independent Test**: With an account the fixture rejects, no page is judged,
the report names every page as failed with the sign-in reason, and the run
exits 1 with no `thresholds` block.

### Tests for User Story 2 (write first, must fail)

- [X] T035 [P] [US2] Add to `tests/ci-runner.spec.ts`: when `establish` fails, `analyzePage` is never called, the report is saved with every configured page `failed` carrying the sign-in reason and `signedIn: false` in provenance, the verdict printed is `uxlint: sign-in failed — {reason}`, and the exit code is 1 both with and without a `thresholds` block (FR-009)
- [X] T036 [P] [US2] Add to `tests/ci-runner.spec.ts`: with a named secret unset, the run prints `uxlint: sign-in needs {NAME}, which is not set in the environment`, exits 1, and neither the preflight nor the run factory is called (FR-010)
- [X] T037 [P] [US2] Add the equivalents of T035 and T036 to `tests/hooks/use-analysis.spec.tsx` (the hook ends in its error state with the reason), `tests/delegate/runner.spec.ts` (no host agent is launched) and `tests/delegate/driven/capture.spec.ts` (`capture` writes the report itself, creates no run directory, exits 1)
- [X] T038 [P] [US2] Add to `tests/models/gate-result.spec.ts`: pages failed with `session-lost` and `sign-missing` reasons are counted by `failOnFailedPage`, are named with their reason in the rendered verdict, and a gated run in which every page was refused is `analyzedNothing` (FR-013)
- [X] T039 [P] [US2] Add to `tests/infrastructure/reports/report-generator.spec.ts` tests for `generateMarkdownReport`: the header carries `**Signed in**: yes — reviewed as a signed-in visitor` or `**Signed in**: no — sign-in failed; no page was reviewed` only when provenance has `signedIn`; a page with `reachedUrl` carries `**Reviewed page**: {url} (the configured address forwarded here)`; a refused page appears under `### Failed Pages` with its reason; a report with neither field is byte-identical to the one generated before this feature
- [X] T040 [P] [US2] Add to `tests/services/signed-in-analysis.spec.ts` and `tests/delegate/signed-in-capture.spec.ts`: with no `signIn` block a capture whose root address differs from the configured one records `reachedUrl` and leaves status, findings and gate verdict unchanged (FR-014)
- [X] T041 [US2] Extend `tests/integration/signed-in-run.spec.ts`: a wrong password yields `sign-absent` or `step-failed` with the fixture's `Invalid email or password` in `shown`; calling `expireSessions()` between two pages triggers exactly one further sign-in and the second page is admitted; expiring sessions and changing the accepted password yields `session-lost` for that page and the next page is still attempted; `/no-sign` yields `sign-missing`
- [X] T042 [US2] Show the user the red tests written in T035–T041 and wait for their approval before starting any implementation task of User Story 2, as constitution principle II requires; record the date and what was approved under `## Approvals` in `specs/011-authenticated-pages/tasks.md`

### Implementation for User Story 2

- [X] T043 [US2] Add `failEveryPage(pages, reason)` to `ReportBuilder` in `source/services/report-builder.ts`, recording each configured page as `failed` with `noMeasurement('page-not-loaded')`, with a unit test in `tests/services/report-builder.spec.ts`
- [X] T044 [US2] In `source/ci-runner.ts`, call `checkSignInSecrets(config)` before the preflight and return 1 with its message; replace T031's throw with the failed-sign-in path: `failEveryPage`, `signedIn: false`, save the report, close the service, print `uxlint: sign-in failed — {reason}`, return 1 without evaluating the gate (makes T035 and T036 pass)
- [X] T045 [P] [US2] Apply the same two changes in `source/hooks/use-analysis.ts`, ending in the existing error state so the application exits 1
- [X] T046 [P] [US2] Apply the same two changes in `source/delegate/runner.ts`, returning before any host agent is launched
- [X] T047 [P] [US2] Apply the same two changes in `source/delegate/driven/capture.ts`: on a failed sign-in write the report from the run's builder, create no `DelegationSession`, print the reason through `emitMessage`, return 1 (T045–T047 make T037 pass)
- [X] T048 [US2] In `source/infrastructure/reports/report-generator.ts`, render the signed-in header line and the reviewed-page line exactly as `contracts/report-surface.md` states, emitting neither when its field is absent (makes T039 pass)
- [X] T049 [US2] Record `reachedUrl` for runs without a session: in `AIService.recordCapture` in `source/services/ai-service.ts` and in `capturePage` in `source/delegate/capture-pass.ts`, read the root address from every successful capture and set it when it differs from the configured address (makes T040 pass)
- [X] T050 [US2] Confirm T038 passes with no change to `source/models/gate-result.ts`; if the rendered verdict omits a failed page's reason, fix the rendering there and nowhere else

**Checkpoint**: User Stories 1 and 2 together are the usable feature: signed-in
review when sign-in works, an honest failed run when it does not.

---

## Phase 5: User Story 3 - Secrets stay where the developer put them (Priority: P2)

**Goal**: A value read through a `secret` reference appears in none of the
run's outputs, even when the product displays it.

**Independent Test**: A run against the fixture's `/secret` page with a
recognisable password leaves that password in no model request, evidence
payload, run directory, report, log file or terminal message.

### Tests for User Story 3 (write first, must fail)

- [ ] T051 [P] [US3] Add to `tests/services/mcp-client.spec.ts`: a client wrapped with a redactor returns `[redacted]` in place of a secret in the result of `callTool` and in the result of every tool obtained from `tools()`, and passes arguments through unchanged
- [ ] T052 [P] [US3] Add to `tests/services/measurement-parsing.spec.ts`: an audit report file containing a secret value yields measured findings and a measurement description in which the value is `[redacted]`
- [ ] T053 [P] [US3] Add to `tests/infrastructure/logger.spec.ts`: after a redactor is installed, a log entry whose message, metadata or nested error contains a secret value is written with `[redacted]`, and with none installed entries are written as before
- [ ] T054 [P] [US3] Add to `tests/services/sign-in.spec.ts`: across a successful sign-in, a failed one and a recovery, the secret appears in the recorded calls only as the `value` of `fill`, and in no logger call (asserted with a spy logger)
- [ ] T055 [P] [US3] Add to `tests/ci-runner.spec.ts`, `tests/hooks/use-analysis.spec.tsx`, `tests/delegate/runner.spec.ts` and `tests/delegate/driven/capture.spec.ts`: the browser client is closed exactly once on each of four endings — a completed run, a failed sign-in, a page refused mid-run, and an error thrown after sign-in — so the throwaway profile holding the session is discarded however the run ends (FR-022)
- [ ] T056 [US3] Add the secret sweep to `tests/integration/signed-in-run.spec.ts`: review `/secret` through the provider route with a recording mock model and through both delegate routes with the fake host agents, then assert the password string is absent from every model request body, every evidence payload, every file under the run's temporary directory, the report, the log file written during the test and every terminal message, and that the report shows `[redacted]` where the page printed it (SC-005, FR-021); additionally assert that the fixture's session cookie value appears in no evidence payload and in no file the run created, and that after each route returns no run directory or other file written by uxlint remains that contains it (FR-019, FR-022)
- [ ] T057 [US3] Show the user the red tests written in T051–T056 and wait for their approval before starting any implementation task of User Story 3, as constitution principle II requires; record the date and what was approved under `## Approvals` in `specs/011-authenticated-pages/tasks.md`

### Implementation for User Story 3

- [ ] T058 [US3] Add `redactingClient(client, redact)` to `source/services/mcp-client.ts`, wrapping `callTool` results and the `execute` of every tool from `tools()`, and use it in the run assembly in `source/services/ai-service.ts` whenever a session exists so that the session, the model-facing tools and the measurement service all receive the wrapped client (makes T051 pass)
- [ ] T059 [US3] In `source/services/measurement.ts`, accept an optional `Redactor` in `MeasurementService` and apply it to the audit report text in `readAndDiscardReport` before it is parsed; pass the run's redactor where the service is constructed in `source/services/ai-service.ts`, `source/delegate/runner.ts` and `source/delegate/driven/capture.ts` (makes T052 pass)
- [ ] T060 [US3] In `source/infrastructure/logger.ts`, add a Winston format that applies an installed redactor to the serialised entry and a `setRedactor(redact)` method on the logger; install the run's redactor from the run assembly in `source/services/ai-service.ts` before the first browser call (makes T053 pass)
- [ ] T061 [US3] Audit `source/services/sign-in.ts` and `source/services/mcp-client.ts` for any log call that receives tool arguments or a resolved secret and remove the argument from it (makes T054 pass), then run T056 and fix whatever sink it names
- [ ] T062 [US3] Make T055 pass: in `source/ci-runner.ts`, `source/hooks/use-analysis.ts`, `source/delegate/runner.ts` and `source/delegate/driven/capture.ts`, move any browser-client close that is not already in a `finally` into one, covering the failed-sign-in return added in User Story 2, and change nothing where the test already passes

**Checkpoint**: The feature may be released. Before this phase a product that
prints a secret on a page would have it forwarded.

---

## Phase 6: User Story 4 - A sign-in problem can be diagnosed without a full run (Priority: P3)

**Goal**: `uxlint sign-in` tells a developer whether sign-in works and which
pages show the sign, with no model call and no report.

**Independent Test**: With one wrong step, `uxlint sign-in` names the step and
what the page showed in under a minute and exits 1, with no provider
credential set.

### Tests for User Story 4 (write first, must fail)

- [ ] T063 [P] [US4] Write `tests/sign-in-check.spec.ts` for `runSignInCheck` with injected collaborators: a successful check prints `uxlint: signed in — found button "Sign out" after 3 steps` followed by one `✓`, `✗` or `→` line per configured page in the format of `contracts/cli-surface.md` and returns 0; any refused page returns 1; a failed sign-in prints only `uxlint: sign-in failed at step 2 (fill "Password"): not-found. The page showed: …` and returns 1; a configuration with no `signIn` block prints `uxlint: this configuration has no signIn block` and returns 1; no run factory, model provider or report builder is touched; nothing is printed before the browser client is closed
- [ ] T064 [P] [US4] Write `tests/cli/sign-in.spec.ts` running the built `dist/cli.js sign-in` in a temporary directory with the provider environment variables unset: it exits 1 with the missing-secret message when the secret is unset, and the usage text lists `sign-in`
- [ ] T065 [US4] Extend `tests/integration/signed-in-run.spec.ts`: `runSignInCheck` against the fixture exits 0 for the working configuration, marks `/no-sign` with `✗`, and for a step renamed to `Passphrase` reports step 2 as `not-found` in under 60 s (SC-008)
- [ ] T066 [US4] Show the user the red tests written in T063–T065 and wait for their approval before starting any implementation task of User Story 4, as constitution principle II requires; record the date and what was approved under `## Approvals` in `specs/011-authenticated-pages/tasks.md`

### Implementation for User Story 4

- [ ] T067 [US4] Implement `runSignInCheck(config, dependencies)` in `source/sign-in-check.ts`: secrets check, browser preflight, a browser client with `requireSignInTools`, `establish`, then for each configured page `navigate_page`, `take_snapshot` and `admit`; close the client in a `finally`; print through `source/infrastructure/console-output.ts` only after it has closed; return the exit code (makes T063 pass)
- [ ] T068 [US4] Route `sign-in` in `source/cli.tsx` alongside `mcp-serve`, `delegate` and `auth`: load and validate the configuration, set `process.exitCode` from `runSignInCheck`, and add the command to the usage text (makes T064 pass)

**Checkpoint**: All four stories are functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T069 [P] Add a "Pages behind a login" section to `README.md` agreeing with `contracts/config-surface.md` key for key: the `signIn` block, how a target is found, how secrets are supplied, the signed-in sign, `uxlint sign-in`, what a failed sign-in does to the run and its exit code, and the "what the block cannot express" list including that a password under `value:` is not redacted
- [ ] T070 [P] Add `sign-in` and the `signIn` block to the quick-reference table and configuration summary in `README.md`, and add one line on signed-in review to the Delegate Mode notes in `AGENTS.md` stating that sign-in is carried out by uxlint and never by the host agent
- [ ] T071 Run `npm run test:coverage` and add unit tests for any branch of `source/models/sign-in.ts`, `source/models/secret-redaction.ts`, `source/services/sign-in.ts` and `source/sign-in-check.ts` that keeps the 80% threshold from holding
- [ ] T072 Walk through scenarios 1–4, 6 and 7 of `quickstart.md` by hand against the built CLI and the fixture site, and record the observed output under a `## Results` heading at the top of `quickstart.md`, as the 010 quickstart does, including the sign-in time measured by T025 as the performance baseline constitution principle IV asks for
- [ ] T073 Run `npm run compile`, `npm run format`, `npm run lint` and `npm test` on the finished branch and resolve every error; confirm no `eslint-disable-next-line` was added and no lint rule was changed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: needs T002 for T009–T010. Blocks every story.
- **US1 (Phase 3)**: needs Phase 2, and T001 for T025.
- **US2 (Phase 4)**: needs US1 — it replaces the failure path US1 leaves generic (T044 replaces T031's throw) and extends the same integration suite.
- **US3 (Phase 5)**: needs US1 for the run assembly it wraps. Independent of US2.
- **US4 (Phase 6)**: needs Phase 2 only (`requireSignInTools` is foundational, T016). Independent of US1–US3 except for T065, which extends the integration suite.
- **Polish (Phase 7)**: needs every story it documents.

### Within a Phase

- Tests before the implementation they name, and red before green.
- Each phase's approval task (T011, T026, T042, T057, T066) sits between its tests and its implementation: no implementation task of a phase starts before it is checked.
- `source/services/ai-service.ts` is edited by T027, T028, T049, T058, T059 and T060: these run in that order and are never parallel with each other.
- `tests/integration/signed-in-run.spec.ts` is written by T025 and extended by T041, T056 and T065, in that order.
- `tests/ci-runner.spec.ts` is extended by T020, T035, T036 and T055; `tests/services/sign-in.spec.ts` by T009, T010 and T054.

### Parallel Opportunities

- T001 and T002.
- T003–T008 (four spec files; T003–T005 share one file and are written in sequence by one person), then T012, T013, T015 and T016.
- In US1: T018–T024 together; after T027–T030, the three entry points T032, T033 and T034 alongside T031.
- In US2: T035–T040 together; T045, T046 and T047 after T044.
- In US3: T051–T055 together.
- US3 and US4 can proceed in parallel once US1 is complete.

## Parallel Example: User Story 1

```text
Task: "T018 Write tests/services/signed-in-analysis.spec.ts"
Task: "T019 Write tests/delegate/signed-in-capture.spec.ts"
Task: "T020 Add sign-in assertions to tests/ci-runner.spec.ts"
Task: "T021 Add sign-in assertions to tests/hooks/use-analysis.spec.tsx"
Task: "T022 Add establish-order assertions to the two delegate specs"
Task: "T023 Pin the audit mode in tests/services/measurement-parsing.spec.ts"
Task: "T024 Render the signing-in state in tests/components/analysis-progress.spec.tsx"
```

## Implementation Strategy

### MVP

Phases 1–4. User Story 1 alone is not shippable: it reviews signed-in pages
but ends a failed sign-in through the generic failure path. Stories 1 and 2
are both P1 for that reason and form the smallest increment worth showing.

### Release

Phases 1–5. User Story 3 is P2 by the spec's ordering but is a release
condition: until it lands, a product that prints a secret onto a page has it
forwarded to the model provider.

### Incremental Delivery

1. Phases 1–2 → models and session, verified against a scripted browser.
2. Phase 3 → signed-in review in all four routes (T025 against a real browser).
3. Phase 4 → honest failure. **MVP**.
4. Phase 5 → secrets contained. **Releasable**.
5. Phase 6 → `uxlint sign-in`.
6. Phase 7 → README, coverage, quickstart results, final gates.

## Notes

- Requirement coverage: FR-001–FR-007 in Phases 2–3; FR-008–FR-016 in Phases 2–4; FR-017–FR-022 in Phases 2 and 5 (FR-022 by T055, T062 and T056); FR-023 in T020; FR-024 in T003, T007 and T014; FR-025 in Phase 6; FR-026 by the `timed-out` and `sign-absent` outcomes in T009.
- The wizard is deliberately untouched (clarified 2026-11-11).
- Commit after each task or logical group; each commit passes compile, format and lint.

## Approvals

Constitution principle II: tests are written and approved by the user before
implementation begins. One row per phase, filled in by that phase's approval
task.

| Phase | Tests | Approved on | Notes |
| --- | --- | --- | --- |
| 2 Foundational | T003–T010 | 2026-11-12 | Approved together with the type-only skeletons and the `Sign-in cannot use {NAME}: {reason}` wording for an unusable secret |
| 3 User Story 1 | T018–T025 | 2026-11-12 | Approved with the `signing-in` stage, the type-only skeletons, and one addition: a sign already shown at the sign-in address counts as signed in |
| 4 User Story 2 | T035–T041 | 2026-11-13 | Approved as written; a failed sign-in prints its own message and the gate is not evaluated |
| 5 User Story 3 | T051–T056 | | |
| 6 User Story 4 | T063–T065 | | |
