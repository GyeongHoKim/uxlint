# Contract: CLI Surface

**Feature**: 011-authenticated-pages | **Date**: 2026-11-11

One new command, and what a sign-in description changes about the existing
ones. Exit codes and message shapes here are the contract.

---

## `uxlint sign-in`

Checks that the configured sign-in works. Reviews nothing.

```text
uxlint sign-in
```

**Preconditions**: a configuration with a `signIn` block, the secrets it names,
and an environment the browser preflight accepts. No model provider credential
is read.

**Behaviour**: runs preflight, signs in, confirms the signed-in sign, then
opens each configured page in turn and applies the same admission test a
review would. Makes no model call, takes no measurement, writes no report.

**Output** (terminal, after the browser has closed):

```text
uxlint: signed in — found button "Sign out" after 3 steps (1.2 s)
  ✓ https://app.example.com/dashboard
  ✓ https://app.example.com/settings
  ✗ https://app.example.com/editor — signed in, but this page did not show the signed-in sign "Sign out"
  → https://app.example.com/home — reached https://app.example.com/dashboard
```

A `→` line is informational: the page showed the sign but at a different
address than configured.

On a failed sign-in, only the failure is printed, with the step and what the
product showed (FR-015):

```text
uxlint: sign-in failed at step 2 (fill "Password"): not-found. The page showed: "Sign in" at https://app.example.com/login/verify
```

**Exit**: `0` when sign-in succeeded and every page showed the sign. `1` when
sign-in failed, when any page was refused, when the configuration has no
`signIn` block, or when preflight fails.

---

## Existing commands with a `signIn` block

Applies to `uxlint`, `uxlint --interactive`, `uxlint --delegate` and
`uxlint delegate capture`.

### Before the browser starts

| Condition | Result |
| --- | --- |
| The `signIn` block is malformed | Configuration error naming the key; exit 1. As today for other blocks. |
| A named secret is unset | `uxlint: Sign-in needs UXLINT_QA_PASSWORD, which is not set in the environment` (several names are listed together); exit 1. No browser, no report. |
| A named secret is set but empty or under four characters | `uxlint: Sign-in cannot use UXLINT_QA_PASSWORD: its value is empty` (or `its value is shorter than 4 characters`); exit 1. No browser, no report. |

### After the browser connects, before the first page

| Condition | Result |
| --- | --- |
| The browser server lacks `fill` or `click` | Startup failure, as for a missing `navigate_page` today; exit 1. |
| Sign-in succeeds | The run proceeds; every page is admitted or refused individually. |
| Sign-in fails | No page is judged or measured. A report is written with every page under _Failed Pages_ and the sign-in reason. `uxlint: sign-in failed — {reason}`; **exit 1 whether or not `thresholds` is configured** (FR-009). |

### Per page

| Condition | Result |
| --- | --- |
| The sign is present | Reviewed as today. |
| The sign is absent, recovery restores it | Reviewed as today. |
| The sign is absent, signing in again fails | Page `failed` — session lost. The run continues. |
| The sign is absent, signing in again succeeds, sign still absent | Page `failed` — signed in, sign missing on this page. The run continues. |

Pages failed this way are ordinary failed pages to the gate: counted by
`failOnFailedPage`, named with their reason in the gate's output (FR-013), and
subject to the existing rule that a gated run with no page analysed fails.

### `uxlint delegate capture`

- On a failed sign-in, `capture` writes the report itself, creates no run, and
  exits 1. There is nothing for an agent to judge.
- Otherwise its payload is unchanged in shape: a refused page appears as
  `captured: false` with its `failureReason`, as an unreachable page does
  today.

### `uxlint --interactive`

- Shows that the run is signing in before the first page's progress.
- On a failed sign-in, shows the reason and ends in the existing error state,
  which exits 1.
- The wizard is unchanged and asks nothing about sign-in.

---

## Without a `signIn` block

Every command behaves as it did before this feature. `uxlint sign-in` exits 1
with `uxlint: this configuration has no signIn block`.
