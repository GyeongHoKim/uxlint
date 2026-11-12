# Contract: Configuration Surface

**Feature**: 011-authenticated-pages | **Date**: 2026-11-11

The `signIn` block of `.uxlintrc.yml` / `.uxlintrc.json`. The README section
written for this feature must agree with this file exactly.

---

## The block

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
    role: button
  timeoutMs: 30000
```

| Key | Required | Meaning |
| --- | --- | --- |
| `url` | yes | Absolute address where sign-in starts. Opened before the first step. |
| `steps` | yes | Ordered list, at least one. Carried out one at a time. |
| `signedIn.name` | yes | Accessible name of an element shown only to a signed-in visitor. |
| `signedIn.role` | no | Narrows the sign to one role (`button`, `link`, …). |
| `timeoutMs` | no | Bound on one sign-in, from opening `url` to finding the sign. Default `30000`. |

The block is optional. Without it, a run behaves exactly as it did before this
feature (FR-023).

## Steps

Each step is an object with exactly one of two keys.

### `fill`

```yaml
- fill: Password # the field's accessible name
  secret: UXLINT_QA_PASSWORD # or `value:`
  role: textbox # optional
```

- Exactly one of `value` (a literal, for things that are not secret) or
  `secret` (the **name** of an environment variable) is required.
- Without `role`, the target must be a fillable element: `textbox`,
  `searchbox` or `combobox`.

### `click`

```yaml
- click: Sign in # the element's accessible name
  role: button # optional
```

- Without `role`, the target must be a `button` or a `link`.

### How a target is found

Before each step the page structure is captured afresh. The target is the
element whose accessible name equals the step's string after both are trimmed
and have their internal whitespace collapsed; comparison is case-sensitive.

- No such element → the step fails as `not-found`.
- More than one → the step fails as `ambiguous`. Add `role` to narrow it.

A step never waits for its target to appear beyond the same short window used
for the signed-in sign (5 s), and the whole sign-in is bounded by `timeoutMs`.

## Secrets

- `secret` names an environment variable. Its value is read when the run
  starts, from the process environment, which includes a local `.env` file —
  the mechanism model provider keys already use.
- The configuration file never holds a secret value (FR-017). A password
  written under `value:` is treated as a non-secret literal and is **not**
  redacted; the README says so.
- A named variable that is unset stops the run before the browser starts and
  names the variable (FR-010).
- An empty value, or one shorter than four characters, stops the run the same
  way: it could not be redacted without mangling ordinary text.

## The signed-in sign

A visitor is signed in when the captured structure of the current page has an
element whose accessible name equals `signedIn.name` (same comparison as
above) and whose role equals `signedIn.role` when one is given.

- Checked once after the steps complete, and on every configured page before
  it is reviewed (FR-005, FR-008).
- It is the only test. A run does not infer the signed-in state from an
  address (clarified FR-008).
- Choose something every configured page shows. `uxlint sign-in` reports which
  pages do not show it.

## Validation

Runs with the rest of configuration validation, before any page is opened. The
first problem found is reported as a `ConfigurationError` carrying a dotted
key, as the `browser`, `analysis` and `thresholds` blocks already do.

| Input | Key reported | Message says |
| --- | --- | --- |
| `signIn` is not an object | `signIn` | must be an object |
| `url` missing or not absolute | `signIn.url` | must be an absolute URL |
| `steps` missing or empty | `signIn.steps` | must list at least one step |
| a step with neither or both of `fill` / `click` | `signIn.steps[2]` | must be exactly one of fill or click |
| `fill` with neither or both of `value` / `secret` | `signIn.steps[1]` | needs exactly one of value or secret |
| `click` with `value` or `secret` | `signIn.steps[2]` | click takes no value |
| `signedIn` missing | `signIn.signedIn` | a signed-in sign is required |
| `signedIn.name` empty | `signIn.signedIn.name` | must be a non-empty string |
| `timeoutMs` not a positive integer | `signIn.timeoutMs` | must be a positive integer of milliseconds |
| unknown key anywhere in the block | e.g. `signIn.steps[0].selector` | is not a recognised setting; lists the allowed keys |
| a `signIn` key on an entry of `pages` | e.g. `pages[1].signIn` | sign-in is set once for the whole run; a page cannot have its own (FR-016) |

## What the block cannot express

Stated here so the README can say it plainly:

- A step that needs a person: one-time codes, CAPTCHA, an identity-provider
  prompt. The run reports a sign-in failure (FR-026).
- A session supplied ready-made (a cookie, a token), or a script.
- More than one account, or pages reviewed signed out in the same run
  (FR-016). Review those with a configuration that has no `signIn` block.
