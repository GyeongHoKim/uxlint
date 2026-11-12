# Research: Analyse Pages Behind a Login

**Feature**: 011-authenticated-pages | **Date**: 2026-11-11

Every decision below is one the spec left to planning. R1 is a live run; the
rest follow from it and from reading the code that exists.

## R1: Can a declared sign-in be carried out with the browser server alone?

**Method.** A local test site (a login form posting to `/login`, an `HttpOnly`
session cookie, a `/dashboard` that redirects signed-out visitors to `/login`)
was driven through `chrome-devtools-mcp` 1.7.0 — the version this project pins —
against headless Chrome stable on macOS, launched with the same `--headless
--isolated` flags `buildLaunchSpec` uses. The driver called the server's tools
directly, with no model in the loop.

**Observed.**

| Question | Result |
| --- | --- |
| How does the page structure name a form field? | `uid=1_4 textbox "Email "` — role, then the accessible name, which can carry stray whitespace from the markup. |
| Can a field be filled by that handle? | `fill {uid, value}` → `Successfully filled out the element`, 207 ms. The reply does not echo the value. |
| Can a button be pressed by that handle? | `click {uid}` → `Successfully clicked on the element` + `Page navigated to …/dashboard`, 185 ms. |
| Does the session persist? | Yes. A later `navigate_page` to `/dashboard` stayed on `/dashboard` in the same throwaway profile. |
| Is the address actually reached visible? | Yes, twice: the `## Pages` list in the navigation reply (`1: Sign in (…/login) [selected]`) and the structure's root (`RootWebArea "Sign in" url="…/login"`). |
| What does a filled field look like in the structure? | A text field shows its value (`value="qa@example.com"`). A password field shows bullets (`value="••••••"`). |
| What if the product displays a secret? | It appears verbatim: `StaticText "Your API key: S3cr3t-probe-value"`. |
| What does a rejected sign-in look like? | The form's own error is in the structure: `alert … StaticText "Invalid email or password"`. |
| What does a signed-in visitor asking for `/login` get? | Whatever the product serves; the test site showed the form again. |

Capturing the structure took 3–6 ms per call. The only slow step was the first
navigation of a cold browser (7.6 s), which every run already pays.

**Decision.** Sign-in is carried out by uxlint calling the server's `fill` and
`click` tools, resolving each target from the page structure by role and
accessible name.

**Rationale.** It needs nothing the run does not already have: the same server,
the same structure the analysis reads, real input events rather than synthetic
ones. Identifying a field by its accessible name is also the natural unit for
this tool — it is what the model is shown, and a login form whose fields have
no accessible name is a finding in its own right.

**Alternatives considered.**

- _CSS selectors through `evaluate_script`._ Rejected: setting `.value` from
  script bypasses the input handling most frameworks rely on, and it would make
  an arbitrary-script tool a required one.
- _A second browser driver for sign-in._ Rejected: two drivers cannot share one
  throwaway profile, and a session established in one would not exist in the
  other.
- _Letting the model sign in._ Ruled out by FR-007 and FR-018.

## R2: The shape of the sign-in description

**Decision.** One optional top-level block, `signIn`:

```yaml
signIn:
  url: https://app.example.com/login
  steps:
    - fill: Email
      value: qa@example.com
    - fill: Password
      secret: UXLINT_QA_PASSWORD
    - click: Sign in
  signedIn:
    name: Sign out
    role: button # optional
  timeoutMs: 30000 # optional
```

- A step is `fill` (with exactly one of `value` or `secret`) or `click`. The
  string is the target's accessible name; an optional `role` disambiguates.
- `secret` is the **name** of an environment variable, never a value.
- `signedIn` is the signed-in sign (FR-005): an accessible name, optionally a
  role, that some element of a signed-in page carries.

Full grammar and validation: [contracts/config-surface.md](./contracts/config-surface.md).

**Rationale.** Two step kinds cover the form logins this feature targets,
including multi-screen ones (email, _Next_, password), because every step
re-reads the structure before resolving its target. Each addition beyond these
— waits, key presses, conditionals — would be a small language to document and
validate, and none is needed by a form that R1 could not already sign in to.

**Alternatives considered.**

- _pa11y-style action strings_ (`set field #email to …`). Rejected: a string
  grammar needs a parser and puts the secret reference inside free text, where
  FR-017 (no values in the file) cannot be checked structurally.
- _`username` / `password` / `submit` fixed fields_ (StackHawk's form
  authentication). Rejected: it cannot express a two-screen login, which is
  common enough that the first user to meet one would be stuck.
- _A separate file for the description._ Rejected: it holds no secrets, so it
  has no reason to live apart from the configuration it belongs to.

## R3: How "signed in" is decided

**Decision.** The signed-in sign is matched against the captured page
structure: the visitor is signed in when some element has the declared
accessible name (compared after trimming and collapsing whitespace) and, if a
role was declared, that role. The same test is used after sign-in and on every
page.

Because a page can render its account controls a moment after it loads, an
absent sign is re-checked on fresh captures for a short fixed window (5 s)
before the page is treated as signed out. A capture costs 3–6 ms (R1), so the
window is nearly free when the sign is present, which is the normal case.

**Rationale.** One definition, one evidence source. The structure is captured
for every page anyway, so the check adds no browser call on the normal path,
and matching a whole element name rather than a substring keeps a login page
that merely mentions "sign out" from passing.

**Alternatives considered.**

- _The server's `wait_for` tool._ Rejected as the definition: it matches page
  text by its own rule, which would give two slightly different meanings of
  "the sign is present".
- _Inferring from the reached address._ Excluded by the clarified FR-008.
- _A separate logged-out sign_ (ZAP, StackHawk). Not needed: with a required
  signed-in sign, its absence is the logged-out test.

## R4: Where the check sits in each route

The two analysis paths reach a page differently, so the check has two call
sites and one implementation.

- **Delegate routes** (`capturePage` in `source/delegate/capture-pass.ts`) open
  and capture each page deterministically. The check is a direct call after the
  capture.
- **Provider route** (`AIService.analyzePage`): the model itself calls
  `navigate_page` and `take_snapshot`, and the capture's output goes straight
  to it. The check therefore has to sit **inside the capture tool the model is
  handed**: the tool is wrapped so that its reply passes through the session
  before anything else sees it.

**Decision.** A `SignedInSession` owns sign-in and page admission. The provider
route wraps `take_snapshot`'s `execute`; the delegate routes call the same
admission function directly. A page that is not admitted ends the way a page
that exceeded its time bound ends today: the wrapper returns an empty failed
capture (so the stage machine does not advance and nothing is recorded as a
snapshot), sets the reason, and the loop's `prepareStep` stops the page, which
is closed with `failCurrentPage(reason)`.

**Rationale.** This makes FR-008 structural, in the way the stage machine
already makes capture order structural: with a sign-in description, there is no
path by which a signed-out capture reaches the model, because the only tool
that produces captures is the wrapped one.

**Alternatives considered.**

- _Check each page before starting the model loop._ Rejected: the model
  navigates again inside the loop, so the checked capture is not the one it
  judges.
- _Check after the loop, and discard the findings._ Rejected: the model has by
  then been sent the login screen and been paid to judge it.

## R5: Recovery, and telling the three failures apart

**Decision.** When a page's sign is absent after the wait in R3, the session
signs in again, once, re-opens the page and re-captures it:

| Signing in again | Sign on the re-captured page | Outcome |
| --- | --- | --- |
| fails | — | Page failed: session lost and could not be re-established (FR-011). |
| succeeds | present | Page proceeds normally. |
| succeeds | absent | Page failed: signed in, but this page did not show the sign (FR-012). |

"The account was refused" and "this page does not carry the sign" cannot be
told apart from outside the product, so the third reason names both. The spec's
FR-011, FR-012 and one edge case were reworded to match what can actually be
distinguished.

Recovery runs inside the page that needed it, under the same bound as the
initial sign-in, and therefore counts against that page's time limit. The
page limit defaults to twenty times the sign-in bound; pausing a page's timer
around recovery was judged not worth the machinery.

## R6: Keeping secrets out of everything

Secrets enter a run in exactly one place — read from the environment by name —
and are used in exactly one place: the `value` argument of a `fill` call made
by uxlint to its own child process. The risks are the places a value could
come back out.

**Decision.** Three measures, each closing a route R1 or the code showed to be
real:

1. **A redactor built from the run's secret values**, applied to every reply
   the browser server returns before any other code sees it — the model-facing
   tools and the direct calls alike. R1 showed a product can print a secret
   onto a page; this is what satisfies FR-021.
2. **The same redactor applied to the audit report**, which the measurement
   service reads from a file rather than from a tool reply, and which quotes
   page markup.
3. **The same redactor installed as a logger format**, so that no log entry can
   carry a value regardless of which call site wrote it. Sign-in tool arguments
   are additionally never passed to the logger.

A match is replaced with `[redacted]`. The value is matched literally and in
its URL-encoded form. Empty values are refused at startup; a secret shorter
than four characters is refused too, because redacting it would shred ordinary
text.

Non-secret step values (`value:`) are not redacted: the developer wrote them
into a committed file.

**Rationale.** Redacting at the two sources, rather than at each sink, is the
smaller surface: there are two ways page content enters a run and many ways it
leaves (model requests, evidence files, the report, the terminal).

**Alternatives considered.**

- _Redact at each sink._ Rejected: every future sink would have to remember.
- _Trust that secrets never reach a page._ Rejected by R1's last row.

## R7: What a failed sign-in does to the run

**Decision.** In every route, sign-in happens after the browser is connected
and before the first page. On failure the run:

1. judges nothing and measures nothing,
2. records every configured page as `failed` with the sign-in reason,
3. writes the report to the configured path,
4. closes the browser, prints the reason, and exits 1 — without consulting the
   gate.

A missing secret or a browser server lacking `fill` or `click` is caught
earlier still, before the browser starts, and exits 1 the way an invalid
configuration does.

For `delegate capture`, step 3 means the report is written by `capture` itself
and no run is left behind, since there is nothing for an agent to judge.

**Rationale.** `failed` is the existing status for "this page was not
analysed", it already carries a reason into the report's _Failed Pages_
section, and the gate already counts it — so FR-013 needs no new status. The
delegate routes currently record a capture failure as `partial`; a page that
was never reached as a signed-in visitor is recorded as `failed` in all routes
so the same event reads the same way everywhere.

## R8: Checking sign-in without a review (FR-025)

**Decision.** A subcommand, `uxlint sign-in`. It signs in, confirms the sign,
then opens each configured page and reports whether the sign was found there
and which address was reached. It makes no model call and writes no report.
Exit 0 when sign-in succeeded and every page showed the sign, 1 otherwise.

**Rationale.** The page sweep is the same admission function the review uses,
so it costs no new mechanism, and it is the only way a developer can find out
that a chosen sign is missing from one of their pages (an edge case the spec
makes their responsibility) without paying for a review.

**Alternatives considered.**

- _A flag on the main command._ Rejected: flags on the bare command describe a
  review; this is a different activity with a different exit meaning.
- _Under `uxlint auth`._ Rejected: `auth` is uxlint Cloud's own login, and
  putting the target site's sign-in beside it invites exactly that confusion.

## R9: Reporting the page actually reviewed (FR-014)

**Decision.** The reached address is read from the root of the captured
structure (`RootWebArea … url="…"`, R1). When it differs from the configured
address after normalisation (fragment and trailing slash ignored), it is stored
on the page and rendered as one line in that page's section. This applies to
every run, with or without a sign-in description, and changes no status.

## R10: What the audit and trace do to a session

Both were checked because either could silently sign a run out.

- The audit is called with `mode: 'snapshot'`
  (`source/services/measurement.ts`), which analyses the current state and does
  not reload or reset storage. Its `navigation` mode would.
- The trace is called with `reload: true`, which reloads the page and keeps
  cookies.

**Decision.** No change; a test pins the audit's mode, since the day it changes
to `navigation` every signed-in run would break.

## Open items carried into implementation

- R1 was run on macOS only. The Linux container path (`--no-sandbox`) is
  exercised by the same code but was not probed for this feature.
- A session cookie lives in the throwaway profile until the browser closes.
  Every route closes the browser in a `finally`; a run killed with `SIGKILL`
  cannot, and what remains then is whatever the browser server leaves in the
  temporary directory. FR-022 is met for every ending the process can observe.
- The redactor matches a value literally and URL-encoded. A product that
  displays a secret in another encoding (Base64, HTML entities) is not covered.
- Whether the interactive progress display needs a distinct "signing in" stage
  or can reuse an existing one is left to the task that touches it.
