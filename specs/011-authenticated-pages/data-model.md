# Data Model: Analyse Pages Behind a Login

**Feature**: 011-authenticated-pages | **Date**: 2026-11-11

Types are given as TypeScript shapes because that is how this project states
its models. Nothing here is persisted except where noted.

## New

### SignInDescription

The optional `signIn` block of the configuration. Lives in
`source/models/sign-in.ts` and is added to `UxLintConfig` as `signIn?`.

```ts
type SignInDescription = {
	url: string; // where sign-in starts
	steps: SignInStep[]; // at least one
	signedIn: ElementMatcher; // the signed-in sign, required
	timeoutMs?: number; // default 30_000
};

type SignInStep =
	| {fill: string; role?: string; value: string}
	| {fill: string; role?: string; secret: string}
	| {click: string; role?: string};

type ElementMatcher = {name: string; role?: string};
```

Validation (`validateSignIn`, same contract as `validateBrowserSettings`:
returns the first issue with a dotted key, or undefined):

- `signIn` absent → valid, and nothing else in this feature activates.
- `url` is a non-empty string that parses as an absolute URL.
- `steps` is a non-empty array; each step has exactly one of `fill` / `click`;
  a `fill` step has exactly one of `value` / `secret`; a `click` step has
  neither.
- `secret` is a non-empty string naming an environment variable.
- `signedIn.name` is a non-empty string.
- `timeoutMs`, when present, is a positive integer.
- Any unrecognised key, at any level, is an issue naming that key.

### ResolvedSecrets

The values behind the `secret` names, read once at startup.

```ts
type ResolvedSecrets =
	| {kind: 'resolved'; values: ReadonlyMap<string, string>}
	| {kind: 'missing'; names: string[]}
	| {kind: 'unusable'; name: string; reason: string}; // empty or under 4 chars
```

Never logged, never stored, never placed on any other type in this document.
The only consumers are the sign-in steps (as `fill` arguments) and the
redactor.

### Redactor

```ts
type Redactor = (text: string) => string;
```

Built from `ResolvedSecrets.values`. Replaces each value, literal and
URL-encoded, with `[redacted]`, longest value first. With no secrets it is the
identity function.

### SignInOutcome

What an attempt to sign in produced.

```ts
type SignInOutcome =
	| {kind: 'signed-in'}
	| {kind: 'failed'; failure: SignInFailure};

type SignInFailure =
	| {
			kind: 'step-failed';
			stepIndex: number; // 0-based position in `steps`
			step: string; // e.g. `fill "Password"` — never a value
			problem: 'not-found' | 'ambiguous' | 'tool-error';
			shown: string; // what the product showed, redacted
	  }
	| {kind: 'sign-absent'; shown: string} // steps ran, sign never appeared
	| {kind: 'timed-out'; afterMs: number}
	| {kind: 'not-opened'; detail: string}; // signIn.url could not be opened
```

`shown` is a short description derived from the captured structure at the
point of failure: the reached address, the page title, and the names of any
`alert` elements. It is what satisfies FR-015 and it has passed through the
redactor.

### PageAdmission

What the session decided about one captured page.

```ts
type PageAdmission =
	| {kind: 'admitted'; snapshot: string; reachedUrl?: string}
	| {kind: 'refused'; reason: NotReachedReason; detail: string};

type NotReachedReason = 'session-lost' | 'sign-missing';
```

- `admitted.snapshot` is redacted and may be a re-capture taken after recovery.
- `session-lost`: signing in again failed (FR-011).
- `sign-missing`: signing in again succeeded and the page still lacked the
  sign (FR-012).

### SignedInSession

The run-scoped object that owns the above. One per run, created only when the
configuration has a `signIn` block; a run without one never constructs it.

| Operation | Does |
| --- | --- |
| `establish()` | Opens `signIn.url`, carries out the steps, waits for the sign. Returns `SignInOutcome`. Bounded by `timeoutMs`. |
| `admit(pageUrl, snapshot)` | Applies the signed-in test to a capture; on absence waits, then recovers once. Returns `PageAdmission`. |
| `redact` | The run's `Redactor`. |

State: whether the session has been established, and the count of recoveries
(for the log). No secret is held as a field reachable from outside the object.

## Changed

### UxLintConfig

```ts
type UxLintConfig = {
	// …existing fields unchanged
	signIn?: SignInDescription;
};
```

### PageAnalysis

```ts
type PageAnalysis = {
	// …existing fields unchanged
	reachedUrl?: string; // set only when it differs from pageUrl (FR-014)
};
```

No new `AnalysisStatus`. A page refused admission is `failed`, with `error`
carrying the reason text.

### RunProvenance

```ts
type RunProvenance = {
	// …existing fields unchanged
	signedIn?: boolean; // present only when the run had a sign-in description
};
```

`true` when the session was established; `false` when sign-in failed and every
page was recorded as not analysed.

### Delegate capture

`CapturedPage` gains the same optional `reachedUrl`, and a page refused
admission carries a `notReached` reason alongside its `failureReason` so that
`assembleReport` closes it with `failCurrentPage` instead of `partial`.

## Lifecycle

```text
config valid ─► secrets resolved ─► browser connected ─► establish()
                     │                                        │
                 missing/unusable                          failed
                     ▼                                        ▼
              exit 1 (no browser)            all pages failed · report · exit 1

establish() = signed-in ─► for each page: capture ─► admit()
                                                       ├─ admitted ─► review as today
                                                       └─ refused  ─► page failed, next page
```

## Terms

The spec says a page was **not analysed**. In this design that is one status
and two causes: the page's status is `failed`; `refused` is the admission
outcome that produced it; `session-lost` and `sign-missing` are the two
reasons a page can be refused. "Not reached" in prose means refused.

## Reason texts

Stated once so that the report, the terminal and the tests agree.

| Case | Text |
| --- | --- |
| Step failed | `Sign-in failed at step {n} ({step}): {problem}. The page showed: {shown}` |
| Sign absent after steps | `Sign-in steps completed but the signed-in sign "{name}" did not appear. The page showed: {shown}` |
| Timed out | `Sign-in did not finish within {ms} ms` |
| Missing secret | `Sign-in needs {NAME}, which is not set in the environment` |
| Session lost | `The session was lost and signing in again failed: {failure}` |
| Sign missing on page | `Signed in, but this page did not show the signed-in sign "{name}". The account may not have access to it, or the page may not carry the sign` |
