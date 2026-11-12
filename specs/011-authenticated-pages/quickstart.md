# Quickstart: Analyse Pages Behind a Login

**Feature**: 011-authenticated-pages | **Date**: 2026-11-11

How to see the feature work end to end. Scenarios 1–7 run against the fixture
site this feature adds; scenario 8 is the one that needs a real product.

Shapes and messages referred to here are defined in
[contracts/](./contracts/) and [data-model.md](./data-model.md).

## Results

Walked through on 2026-11-13 against the built CLI (`dist/source/cli.js`) and
the fixture site, with Chrome 157.0.8103.52, chrome-devtools-mcp 1.7.0 and
every model provider variable unset.

| Scenario | Status | Evidence |
| --- | --- | --- |
| 1 — sign-in checked on its own | **Passed, run for real** | `uxlint: signed in — found button "Sign out" after 3 steps (1.1 s)`, a `✓` line per page, exit 0, no report file. With `fill: Passphrase`: `uxlint: sign-in failed at step 2 (fill "Passphrase"): not-found. The page showed: "Sign in" at …/login`, exit 1, 7.0 s wall clock |
| 2 — a headless run reviews the pages | **Passed through the agent-driven route; provider route covered automatically** | `delegate capture` → `evidence` → `submit` by hand: `/dashboard` and `/settings` captured, the evidence holds no sign-in form, the report header says `**Signed in**: yes — reviewed as a signed-in visitor`, and the log shows one `Sign-in finished` for the capture. No model was called here; the provider route is exercised with a mock model by `tests/integration/signed-in-run.spec.ts` |
| 3 — a rejected account reviews nothing | **Passed, run for real** | `delegate capture` with a wrong password: `uxlint: sign-in failed — Sign-in steps completed but the signed-in sign "Sign out" did not appear. The page showed: "Sign in" at …/login?error=1 — alert: "Invalid email or password"`, exit 1, no run left behind, and a report with every page under _Failed Pages_ and `**Signed in**: no — sign-in failed; no page was reviewed`. With the secret unset, `uxlint` printed `uxlint: Sign-in needs LOGIN_SITE_PASSWORD, which is not set in the environment`, exit 1, no report |
| 4 — a page that does not show the sign | **Passed, run for real** | `capture` reported `/no-sign` as `captured: false` with the sign-missing reason; the report lists it under _Failed Pages_ and the other pages are reviewed. `uxlint sign-in` marks it `✗` and exits 1 |
| 5 — a session lost partway | **Covered automatically** | `tests/integration/signed-in-run.spec.ts`, in a real browser: one further sign-in after an expiry, `session-lost` when signing in again fails, and the next page still attempted |
| 6 — the secret goes nowhere | **Passed, run for real** | With `/secret` configured, the evidence shows `Your key: [redacted]`, and a recursive search for the password over the report, the evidence, the capture payload, the temporary directory's `uxlint-*` entries and the log directory found nothing. The provider and launcher routes are swept the same way, automatically, by the integration suite |
| 7 — nothing changes without `signIn` | **Passed, run for real** | With no `signIn` block and `/dashboard` configured, the run completes, the header has no `**Signed in**` line, and the page's section gains `**Reviewed page**: …/login (the configured address forwarded here)` with the page still complete |
| 8 — a real product | **Not run** | Needs a staging product and a test account |

**Performance baseline** (constitution principle IV): signing in to the fixture
site takes 1.1 s through the CLI and 1.2–2.1 s in the integration suite, once
per run. A sign-in that cannot find a field gives up after the 5 s window and
the whole check returns in 7 s.

**Corrected while walking through**: the commands here said `node dist/cli.js`;
the build writes `dist/source/cli.js`.

## Prerequisites

- Chrome stable installed (the existing browser requirement).
- `npm run build`.
- The fixture site: `tests/fixtures/login-site.ts` exports a small HTTP server
  with a form login at `/login`, pages at `/dashboard`, `/settings` and
  `/billing` that redirect signed-out visitors to `/login`, a `/no-sign` page
  that is reachable signed in but shows no account control, and a `/secret`
  page that prints the account's password. It accepts one account, whose
  password is whatever `LOGIN_SITE_PASSWORD` is set to. A second form at
  `/login-2step` asks for the email and the password on separate screens.
- For scenarios that judge pages: a model provider credential, or a coding
  agent for the delegate route.

Start it and note the port:

```bash
node dist/tests/fixtures/login-site.js   # prints http://127.0.0.1:<port>
export LOGIN_SITE_PASSWORD='quickstart-Secret-123'
```

A working configuration (`.uxlintrc.yml`):

```yaml
mainPageUrl: http://127.0.0.1:<port>/dashboard
subPageUrls:
  - http://127.0.0.1:<port>/settings
pages:
  - url: http://127.0.0.1:<port>/dashboard
    features: Shows this month's usage and the three most recent invoices.
  - url: http://127.0.0.1:<port>/settings
    features: Lets the account owner change the display name and time zone.
persona: An operations lead who checks usage once a week from a laptop.
report:
  output: ./ux-report.md
signIn:
  url: http://127.0.0.1:<port>/login
  steps:
    - fill: Email
      value: qa@example.com
    - fill: Password
      secret: LOGIN_SITE_PASSWORD
    - click: Sign in
  signedIn:
    name: Sign out
    role: button
```

## Scenario 1 — Sign-in can be checked on its own (US4, FR-025, SC-008)

```bash
node dist/source/cli.js sign-in
```

**Expect**: `signed in — found button "Sign out" after 3 steps`, a `✓` line per
configured page, exit 0, no report file, and no model provider credential
needed (run it with the provider variables unset).

Change `fill: Password` to `fill: Passphrase` and run again.

**Expect**: `sign-in failed at step 2 (fill "Passphrase"): not-found`, followed
by what the page showed; exit 1; well under a minute.

## Scenario 2 — A headless run reviews the pages, not the login form (US1, SC-001)

```bash
node dist/source/cli.js; echo "exit $?"
```

**Expect**: the report's header says `**Signed in**: yes`; both pages appear
under _Page Analyses_ with findings about usage and settings; no finding
mentions a sign-in form. The log shows exactly one sign-in for the run
(SC-006).

## Scenario 3 — A rejected account reviews nothing (US2, FR-009, SC-003)

```bash
LOGIN_SITE_PASSWORD='wrong-password-123' node dist/source/cli.js; echo "exit $?"
```

**Expect**: exit 1 although the configuration has no `thresholds` block; the
terminal says `sign-in failed —` with the form's own error text; the report
lists both pages under _Failed Pages_ with that reason and says
`**Signed in**: no`; the log shows no model request.

```bash
env -u LOGIN_SITE_PASSWORD node dist/source/cli.js; echo "exit $?"
```

**Expect**: `Sign-in needs LOGIN_SITE_PASSWORD, which is not set in the
environment`; exit 1; no browser started, no report written.

## Scenario 4 — A page that does not show the sign is not reviewed (FR-008, FR-012)

Add `/no-sign` to the configured pages and run `node dist/source/cli.js`.

**Expect**: the other pages are reviewed; `/no-sign` is under _Failed Pages_
with `Signed in, but this page did not show the signed-in sign "Sign out"`.
`node dist/source/cli.js sign-in` marks the same page with `✗`.

## Scenario 5 — A session lost partway (FR-011)

The fixture exposes `/__expire`, which invalidates the current session. A
configuration cannot call it between two pages, so this scenario is automated
only: the test expires the session after the first page and
asserts that the second page triggers exactly one further sign-in and is then
reviewed, and — with the account also disabled — that it is recorded as
`session lost` and the third page is still attempted.

## Scenario 6 — The secret goes nowhere (US3, SC-005)

Add `/secret` to the configured pages and run once per route (provider,
`--delegate`, `delegate capture` + `evidence`). `UXLINT_LOG_DIR` below stands
for the platform's log directory, which `source/infrastructure/logger.ts`
documents.

```bash
grep -R -F "$LOGIN_SITE_PASSWORD" ux-report.md "$(node -p "require('os').tmpdir()")"/uxlint-* "$UXLINT_LOG_DIR" 2>/dev/null
```

**Expect**: no match anywhere. The report's section for `/secret` shows
`[redacted]` where the product printed the password. The automated version of
this scenario also captures every request body sent to the mock model and the
evidence served to the fake host agents, and searches those.

## Scenario 7 — Nothing changes without `signIn` (FR-023, SC-007)

Remove the `signIn` block and point the pages at the fixture's public
`/login`.

**Expect**: the run completes as it does on `main`: same statuses, same gate
verdict. The one visible addition is in a run whose configured address
forwards elsewhere — configure `/dashboard` with no `signIn` block and the
page's section gains `**Reviewed page**: …/login (the configured address
forwarded here)`, with the page's status unchanged (FR-014).

## Scenario 8 — A real product

Against a staging product with a form login and a test account:

1. Write the `signIn` block; run `uxlint sign-in` until it exits 0.
2. Run `uxlint` in the pipeline with the secret supplied as a pipeline secret.
3. Confirm the report reviews the product's pages, and search the pipeline's
   log output for the secret.

This is the scenario the fixture cannot stand in for: real login forms differ
in how they name their fields, and the first report of a form that the two
step kinds cannot sign in to is the signal to extend the grammar.

## Contract-level checks (automated, not manual)

- Every row of the validation table in
  [contracts/config-surface.md](./contracts/config-surface.md) is a unit test.
- Every reason text in [data-model.md](./data-model.md#reason-texts) is
  asserted where it is produced.
- The audit is still called in `snapshot` mode (research R10).
- With a `signIn` block, no capture reaches the model without passing
  admission: a test hands the wrapped tool a signed-out structure and asserts
  the model receives nothing and the page closes as `failed`.
