# Contract: Report and Evidence Surface

**Feature**: 011-authenticated-pages | **Date**: 2026-11-11

What a reader of the report, a delegated agent, and anyone searching a run's
outputs can and cannot see.

---

## Additions to the report

### Whether the run was signed in

One line in the report header, present only when the configuration had a
`signIn` block:

```text
**Signed in**: yes — reviewed as a signed-in visitor
**Signed in**: no — sign-in failed; no page was reviewed
```

The account is not named. A run without a `signIn` block has no such line, so
existing reports are unchanged.

### The page actually reviewed (FR-014)

One line in a page's section, present only when the reached address differs
from the configured one (fragment and trailing slash ignored):

```text
**Reviewed page**: https://app.example.com/dashboard (the configured address forwarded here)
```

Applies to every run, with or without a `signIn` block. It changes no status,
no finding and no gate verdict.

### Pages not reached

A refused page is a `failed` page. It appears in the existing _Failed Pages_
section with its reason, using the texts in
[data-model.md](../data-model.md#reason-texts):

```text
### Failed Pages

- ❌ https://app.example.com/editor — Signed in, but this page did not show the signed-in sign "Sign out". The account may not have access to it, or the page may not carry the sign
```

A refused page has no snapshot, no findings and no measurement.

## Evidence handed to a delegated agent

- A refused page's evidence carries its `captureFailureReason` and an empty
  structure, exactly as an unreachable page's does today.
- No evidence field carries a cookie, a storage value, a header, or the
  sign-in description. The agent is not told how the run signed in.

## What never appears, anywhere

For every value read through a `secret` reference (FR-018 to FR-021):

| Sink | Guarantee |
| --- | --- |
| Requests to the model provider | The value does not appear, even when the product displays it on a reviewed page. |
| Evidence printed by `delegate evidence` or served by `mcp-serve` | Same. |
| Run directories under the temporary directory | Same; captured structures are stored already redacted. |
| The report file | Same. |
| Log files | Same; enforced by the logger, not by each call site. |
| Terminal output and error messages | Same. Messages name a secret's variable, never its value. |

Where the product displayed a secret, the reader sees `[redacted]` in its
place.

Not covered, and stated in the README: a value the developer wrote under
`value:` rather than `secret:`; a secret the product displays in an encoding
other than literal or URL-encoded; and the content of signed-in pages in
general, which is sent for judgement as public page content already is.

## After the run (FR-022)

The session exists only in the browser's throwaway profile, which is discarded
when the browser closes. Every route closes the browser on every path it
controls. No file written by uxlint holds session state.
