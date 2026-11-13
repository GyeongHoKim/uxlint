# Feature Specification: Analyse Pages Behind a Login

**Feature Branch**: `011-authenticated-pages`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Analyse pages that sit behind a login (GitHub issue #41). uxlint cannot analyse a page that requires the visitor to be signed in. There is no way to give a run an authenticated session, so any product whose pages sit behind a login is out of reach. A developer must be able to have uxlint review pages behind a login as the signed-in user those pages are built for, in every existing way of running uxlint: interactive runs, headless CI runs where no person is present to sign in, and delegate runs. Credentials must never reach the model provider or a delegated host agent, and must never appear in the report, the logs or any stored run artifact. When a run could not get signed in, or lost its session partway, the affected pages must say so in the report and count as not covered for the CI gate, instead of the login screen being reviewed in their place. Products that need no login must keep working exactly as they do now, with no configuration change."

## Overview

uxlint opens every configured page as a visitor who has never been to the site.
For a product whose pages require signing in — internal tools, admin consoles,
dashboard-style SaaS — that visitor is turned away at the door, and the only
screen uxlint can review is the login screen.

Two things are wrong today, and they are separate:

- **There is no way to sign in.** A run cannot be given an account, and it
  cannot borrow a session the developer already has. The configuration has
  nowhere to say anything about signing in.
- **Being turned away is invisible.** When a configured page sends the visitor
  to a login screen, uxlint reviews the login screen as if it were the
  configured page, against feature descriptions and a persona written for a
  different page. The report presents the result as a review of the configured
  page, and a CI gate passes it.

The second is the more damaging of the two. A developer who lists ten dashboard
pages receives ten confident reviews of one login form and has no way to tell
from the report that this is what happened.

This feature lets a run sign in before it reviews anything, without a person
present, and makes a page that could not be reached as a signed-in user say so
instead of being silently replaced.

**Target personas**: the frontend engineer of a login-gated product, who wants
the same quick UX feedback uxlint already gives on public pages; and the
pipeline owner (004), who needs a gate verdict that means the configured pages
were actually reviewed.

## Clarifications

### Session 2026-11-11

- Q: Which ways of telling uxlint how an account signs in must be supported? → A: Declared sign-in steps in the configuration file only (where to go, which fields to fill with which named secrets, what to submit). Supplying an already-issued session value and running a developer-written sign-in script are out of scope.
- Q: After the sign-in steps have run, what does uxlint use to decide that the visitor is signed in? → A: A signed-in sign that the developer must declare in the configuration (something present only on a signed-in screen). uxlint checks it right after sign-in and on every page; it does not infer the signed-in state by itself.
- Q: Must a run that failed to sign in exit non-zero even when no CI gate is configured? → A: Yes, always, in every mode. A sign-in failure is a failed run, like an unusable browser or an invalid configuration, and is not subject to the gate's opt-in rule.
- Q: Should the interactive wizard that creates a configuration also ask about sign-in? → A: No. The wizard is not extended; a sign-in description is written into the configuration file by hand and documented in the README.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A headless run reviews pages behind a login (Priority: P1)

A frontend engineer works on a product whose every page except the login screen
requires an account. They describe, once, how a test account signs in to their
product, and make that account's secrets available to the run from outside the
configuration file. From then on a plain `uxlint` run in their pipeline, with no
person present, signs in before it does anything else and reviews each
configured page as that signed-in user. The report they receive is about the
dashboard, the settings page and the billing page — the pages they listed — and
not about the login form.

**Why this priority**: This is the feature. A product behind a login gets no
value from uxlint without it, and the headless run is the hardest case: nobody
is there to sign in by hand, so anything that works here works in the other
modes too.

**Independent Test**: Against a test site whose pages redirect signed-out
visitors to a login screen, configure sign-in with a valid test account and run
headless. Confirm that every configured page is reviewed with its own content,
that the report contains findings about those pages, and that no finding
describes the login screen.

**Acceptance Scenarios**:

1. **Given** a configuration that describes how to sign in and a valid account
   supplied to the run, **When** a headless run starts, **Then** the run signs
   in once, before any page is reviewed, and every configured page is reviewed
   as the signed-in user.
2. **Given** the same configuration, **When** the run is started interactively
   or as a delegate run, **Then** the pages are reviewed as the signed-in user
   in exactly the same way, with no additional step asked of the developer.
3. **Given** a run that has signed in, **When** it reviews several pages,
   **Then** it stays signed in across all of them and does not sign in again
   for each page.
4. **Given** a configuration with no sign-in description, **When** a run
   starts, **Then** it behaves exactly as it does today: no sign-in is
   attempted, and page statuses, findings and the gate verdict are unchanged.

---

### User Story 2 - A page that was not reached says so (Priority: P1)

A pipeline owner relies on the gate to tell them whether the configured pages
are acceptable. When a run cannot sign in — the account was disabled, a secret
was not set, the product's login form changed — or when the session ends
partway through, the affected pages are recorded as not analysed, with the
reason, and the gate treats them as it treats any other page that could not be
analysed. No login screen is reviewed in a configured page's place.

**Why this priority**: Equal to P1. Signing in without this is a regression in
honesty: a run that fails to sign in would quietly fall back to reviewing the
login screen, and the developer who has just configured sign-in would trust the
result more than they do today. A review of the wrong page reported as a review
of the right one is worse than no review.

**Independent Test**: Configure sign-in with an account that the test site
rejects and run headless. Confirm that no configured page is reviewed, that the
report names every page as not analysed with sign-in as the reason, that the
run exits non-zero, and that no model usage was spent judging pages.

**Acceptance Scenarios**:

1. **Given** sign-in is configured and the account is rejected, **When** the
   run starts, **Then** no page is judged, the report records every configured
   page as not analysed with the sign-in failure as the reason, and the run
   exits non-zero whether or not a gate is configured.
2. **Given** sign-in is configured and a required secret is not available to
   the run, **When** the run starts, **Then** it stops before opening any page
   and names the missing secret by its name, never by a value.
3. **Given** a run that signed in successfully, **When** a later page is found
   to be signed out, **Then** the run signs in again once and retries that
   page; if signing in again fails, the page is recorded as not analysed with
   the lost session as the reason, and the run continues with the remaining
   pages.
4. **Given** pages recorded as not analysed because of sign-in, **When** the
   gate evaluates the run, **Then** they count as pages that could not be
   analysed under the existing incomplete-coverage rules, and the output names
   them and their reason.
5. **Given** a configuration with no sign-in description, **When** a configured
   page sends the visitor to a different page, **Then** the report states which
   page was actually reviewed, and nothing else about the run changes.

---

### User Story 3 - Secrets stay where the developer put them (Priority: P2)

A frontend engineer hands uxlint the password of a test account so that it can
sign in. They need to know where that password goes. It is used to sign in to
their own product and nowhere else: it is not part of anything sent to a model
provider, not part of anything handed to a delegated coding agent, and not
written into the report, the log files, the terminal output or any file a run
leaves behind. The configuration file they commit to their repository contains
no secret values at all.

**Why this priority**: P2 only because it constrains Story 1 rather than
delivering something on its own; it is not optional. A developer will not give
a tool an account if the tool might forward it, and uxlint already sends page
content to third parties by design.

**Independent Test**: Run a signed-in review with a recognisable secret value,
capturing everything sent to the model provider, everything handed to a
delegated agent, the report, the log files, the terminal output and every file
the run created. Confirm the value appears in none of them.

**Acceptance Scenarios**:

1. **Given** a signed-in run with a model provider, **When** the run completes,
   **Then** no request sent to the provider contains a supplied secret value.
2. **Given** a signed-in delegate run, **When** uxlint hands evidence to the
   coding agent, **Then** nothing it hands over contains a supplied secret
   value or the means to reuse the signed-in session.
3. **Given** a sign-in attempt that fails, **When** the failure is reported,
   **Then** the message explains what failed without echoing any secret value.
4. **Given** a completed signed-in run, **When** the report, the log files and
   the files the run left behind are searched, **Then** no supplied secret
   value is found in any of them.
5. **Given** a sign-in that needs a password, **When** the developer describes
   it, **Then** the configuration file can name the secret without containing
   its value, and nothing about the description requires the value to be
   written there.

---

### User Story 4 - A sign-in problem can be diagnosed without a full run (Priority: P3)

A developer setting up sign-in for the first time gets it wrong: a field is
described incorrectly, or the product shows an extra step. They can find out
what went wrong — which step of signing in did not succeed, and what the
product showed instead — quickly and without paying for a review of every page,
and the explanation is specific enough to correct the configuration.

**Why this priority**: Sign-in is the one part of the configuration that is
specific to each product and cannot be defaulted. Without a short feedback loop
it will be the main reason a developer gives up on the feature, but the feature
is still usable without it.

**Independent Test**: Configure sign-in with one deliberately wrong step
against a test site and confirm that the developer is told which step failed
and what was on the screen at that point, with no page reviewed and no model
usage spent.

**Acceptance Scenarios**:

1. **Given** a sign-in description whose step cannot be carried out, **When**
   sign-in is attempted, **Then** the output names that step and describes what
   the product showed at that point.
2. **Given** a sign-in that completes its steps but leaves the visitor signed
   out, **When** sign-in is checked, **Then** the output says that the steps
   ran and the product still treated the visitor as signed out.
3. **Given** a sign-in description that is malformed, **When** the
   configuration is validated, **Then** the run stops before any page is
   opened and names the offending part of the configuration, as it does for
   any other invalid setting.

---

### Edge Cases

- **Sign-in that cannot be completed unattended.** A product that demands a
  one-time code from a person's phone, a CAPTCHA, or a redirect through an
  identity provider that blocks automated browsers cannot be signed in to
  without a person. The run reports this as a sign-in failure with what the
  product showed; it does not wait for input that will never come.
- **A page that redirects for an ordinary reason.** A configured address that
  forwards to its canonical form, or to a default sub-page of the same screen,
  is not a sign-in problem. Only the absence of the signed-in sign counts as
  not reached.
- **A configured page that does not show the signed-in sign.** A page the
  account can reach but that lacks the declared sign (a full-screen editor
  with no account menu) is recorded as not analysed, not reviewed. Choosing a
  sign that every configured page shows is the developer's responsibility,
  and the reason recorded for the page says the sign was not found.
- **The login screen is itself a configured page.** In a signed-in run, a
  signed-in visitor asking for the login screen is usually forwarded elsewhere,
  and the report says which page was reviewed instead (FR-014). The login
  screen is reviewed by a separate run with no sign-in description (FR-016).
- **The product displays the account's own name or email address.** That text
  is page content and is reviewed like any other; only the secret values
  supplied for signing in are guaranteed never to leave.
- **A secret value appears on a page.** If the product itself displays a
  supplied secret (an API key shown in settings that happens to equal one), it
  must still not be forwarded.
- **Sign-in takes longer than a page is allowed to take.** Signing in at the
  start of a run has its own bound and consumes no page's time limit. Signing
  in again for a page that lost its session has the same bound and counts
  against that page. Neither can stall the run indefinitely.
- **The account has no access to a configured page.** A page that refuses the
  signed-in account is recorded as not analysed with that as the reason, and
  is not confused with a lost session.
- **Two runs at once with the same account.** A product that allows only one
  session per account may sign the first run out when the second signs in.
  Each run reports the lost session on the pages it affected.
- **A signed-in run leaves no session behind.** After a run ends, nothing
  remains on the machine that would let someone else act as the account.

## Requirements *(mandatory)*

### Functional Requirements

**Signing in**

- **FR-001**: A developer MUST be able to describe, in the configuration, how
  an account signs in to their product, as an ordered list of declared steps:
  where sign-in starts, which fields are filled with which named secrets or
  plain values, and what is submitted. The description MUST be sufficient for
  a run to carry sign-in out with no person present, and MUST NOT require or
  permit developer-written code.
- **FR-002**: When sign-in is described, a run MUST sign in before reviewing
  any page, and MUST review every configured page within that signed-in
  session.
- **FR-003**: A run MUST sign in once and reuse the session across its pages,
  signing in again only when it finds the session lost (FR-011).
- **FR-004**: Signed-in review MUST work identically in interactive runs,
  headless runs and both delegate routes, from the same configuration.
- **FR-005**: A sign-in description MUST declare a signed-in sign: something
  the product shows only to a signed-in visitor. After carrying out the
  sign-in steps, a run MUST find that sign before reviewing any page; sign-in
  whose steps ran but whose sign is absent is a sign-in failure.
- **FR-006**: Every sign-in MUST be bounded in time. Signing in at the start of
  a run has its own bound and consumes no page's time limit; signing in again
  for a page that lost its session has the same bound and counts against that
  page.
- **FR-007**: Sign-in MUST be carried out by uxlint itself and MUST NOT be
  delegated to a model or to a host agent.

**Reporting what was reached**

- **FR-008**: A run with sign-in described MUST look for the signed-in sign on
  every configured page before reviewing it, and MUST NOT review a page on
  which the sign is absent. The declared sign is the only test of being
  signed in; a run MUST NOT infer it from the page's address or from anything
  else.
- **FR-009**: When a run cannot sign in, it MUST judge no page, MUST write a
  report recording every configured page as not analysed with the sign-in
  failure as the reason, and MUST exit non-zero in every mode, whether or not
  a gate is configured. This is a failed run, not a gate verdict: the rule
  that a configuration without a gate exits as it always did (004) does not
  apply to it.
- **FR-010**: When a secret that the sign-in description names is not available
  to the run, or its value is empty or too short to be kept out of the run's
  outputs without mangling ordinary text, the run MUST stop before opening any
  page and MUST name the secret, never its value.
- **FR-011**: When a page is found signed out after a successful sign-in, the
  run MUST sign in again once and retry that page. If signing in again fails,
  the page MUST be recorded as not analysed with the lost session as the
  reason, and the run MUST continue with the remaining pages.
- **FR-012**: A page that still lacks the signed-in sign after signing in
  again succeeded MUST be recorded as not analysed with a reason distinct
  from a lost session: the account was signed in, and this page did not show
  the sign (the account may have no access to it, or the page may not carry
  the sign).
- **FR-013**: Pages recorded as not analysed for a sign-in reason MUST be
  treated by the gate exactly as other pages that could not be analysed are
  treated, and MUST be named with their reason in the gate's output.
- **FR-014**: For every page, the report MUST state the page that was actually
  reviewed when it differs from the page that was configured. Without a
  sign-in description this is informational only and MUST NOT change any page
  status or gate verdict.
- **FR-015**: A sign-in failure MUST be reported with the step that did not
  succeed and a description of what the product showed at that point.
- **FR-016**: A run MUST hold exactly one session: with a sign-in description,
  every configured page is reviewed as the same signed-in account, and no page
  can be marked as signed out or assigned a different account. A sign-in
  setting placed on an individual page MUST be rejected when the
  configuration is validated, not ignored. Reviewing a page as a signed-out
  visitor, the login screen included, is done by a run whose configuration
  has no sign-in description.

**Keeping secrets**

- **FR-017**: A sign-in description MUST be able to refer to every secret it
  needs by name, with the value supplied to the run from outside the
  configuration file, so that no sign-in requires a secret value to be written
  into the file. A value a developer writes into the file directly is treated
  as not secret, and the documentation MUST say so.
- **FR-018**: A supplied secret value MUST NOT appear in anything sent to a
  model provider.
- **FR-019**: A supplied secret value, and anything that would let the
  signed-in session be reused, MUST NOT appear in anything uxlint hands to a
  delegated host agent.
- **FR-020**: A supplied secret value MUST NOT appear in the report, the log
  files, the terminal output, an error message, or any file a run creates.
- **FR-021**: FR-018 to FR-020 MUST hold even when the product itself displays
  a supplied secret value on a reviewed page.
- **FR-022**: When a run ends, however it ends, nothing that would let the
  signed-in session be reused MUST remain on the machine.

**Compatibility and diagnosis**

- **FR-023**: A configuration with no sign-in description MUST produce the same
  page statuses, findings and gate verdict as it does before this feature,
  with no change to the configuration.
- **FR-024**: A malformed sign-in description, including one with no signed-in
  sign, MUST stop the run before any page is opened and MUST name the
  offending part, consistent with how other invalid settings are reported.
- **FR-025**: A developer MUST be able to check that sign-in works without
  reviewing any page and without spending model usage.
- **FR-026**: A run MUST NOT wait for a person to complete sign-in, in any
  mode. A sign-in that needs a person (a one-time code, a CAPTCHA, an
  identity-provider prompt) MUST be reported as a sign-in failure under FR-015
  within the bound of FR-006.

### Key Entities

- **Sign-in description**: The part of the configuration that says how an
  account signs in to the product (the declared steps) and how to tell that
  it worked (the signed-in sign). Holds names of secrets, never values.
  Absent for products that need no login.
- **Signed-in sign**: Something the product shows only to a signed-in visitor,
  declared by the developer and required whenever sign-in is described. It is
  what a run checks after signing in and on every page.
- **Secret**: A value the run needs in order to sign in (a password, a token),
  supplied from outside the configuration file and referred to by name.
- **Session**: The signed-in state a run holds from sign-in until it ends.
  Belongs to one run and does not outlive it.
- **Sign-in outcome**: Whether sign-in succeeded and, if not, which step did
  not and what the product showed. Recorded in the report.
- **Reached page**: For each configured page, the page that was actually
  reviewed, and whether the visitor was signed in when it was.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a test product where every page but the login screen requires
  an account, a headless run with a valid account reviews 100% of the
  configured pages with their own content, and 0 findings describe the login
  screen.
- **SC-002**: Across interactive, headless and both delegate routes, the same
  configuration and account produce the same set of pages reviewed as signed
  in.
- **SC-003**: With an account the product rejects, 0 pages are judged, 0 model
  usage is spent on page judgement, and the run exits non-zero.
- **SC-004**: In a run where sign-in was described, the number of pages
  reported as reviewed while the visitor was in fact signed out is 0.
- **SC-005**: A recognisable secret value supplied to a run appears 0 times in
  the requests sent to the model provider, the evidence handed to a delegated
  agent, the report, the log files, the terminal output and the files the run
  created.
- **SC-006**: A run signs in once however many pages it reviews, and signing in
  adds no more than 30 seconds to a run against a product whose login responds
  normally.
- **SC-007**: For an existing configuration with no sign-in description, page
  statuses, findings counts by origin and severity, and the gate verdict are
  identical before and after this feature on the same site.
- **SC-008**: A developer whose sign-in description has one wrong step learns
  which step it is in under one minute, without any page being reviewed.

## Assumptions

- The developer provides an account intended for automated use — a test
  account, ideally on a staging environment — whose sign-in can be completed
  without a person. Making an account like that available is the developer's
  responsibility.
- The account's access should match the configured persona; uxlint does not
  check that it does.
- The content of signed-in pages is sent for judgement the same way the content
  of public pages already is. Using an account whose data may be shared with
  the configured model provider or coding agent is the developer's decision;
  this feature protects the secrets used to sign in, not the page content.
- Signing in happens in the same isolated, throwaway browser the run already
  uses. Reusing the developer's everyday browser profile is out of scope.
- Creating accounts, resetting passwords and testing the sign-in flow's own
  security are out of scope. The login screen can still be reviewed for UX as
  an ordinary page in a run with no sign-in description.
- Signing in by hand is out of scope, including for interactive runs. A
  product whose sign-in cannot be completed unattended is not served by this
  feature; it can be added later without changing what is specified here.
- Sign-in is described only as declared steps. Supplying an already-issued
  session value (a cookie or token) and running a developer-written sign-in
  script are out of scope; a product with no sign-in form of its own is not
  served by this feature.
- One account per run. Reviewing the same product as several accounts, or
  mixing signed-in and signed-out pages in one report, is out of scope and is
  done with separate runs.
- The interactive wizard is not extended to collect a sign-in description in
  this feature; a developer adds it to the configuration file by hand, and
  the README documents how, including how secrets are supplied.
- Secrets are supplied to a run the same way model provider credentials
  already are, so a developer has one place to keep values that must not be
  committed.
- Depends on the page statuses and reasons introduced by the report
  data-integrity work (4.0.1), the gate (004) and the per-page time limit
  (008), and on both delegate routes (009, 010).
