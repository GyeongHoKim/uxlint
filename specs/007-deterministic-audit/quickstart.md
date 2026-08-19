# Quickstart: Deterministic Audit

**Feature**: 007-deterministic-audit
**Date**: 2026-08-19

How to run this feature's checks and see the thing itself work. Every check
below is verified against **what a user reads or sees** — the rendered
markdown, the terminal display, the intercepted request — never against an
in-memory object. That rule is not stylistic: features 005 and 006 each shipped
a defect that every object-level test passed.

---

## Prerequisites

Node ≥ 22.22.2, and this repository's dependencies installed. Most checks need
nothing else.

A browser is needed only for the live checks in §4. Chrome is not a dependency
of the pinned server, which is why feature 005 added a preflight. If none is
installed:

```bash
npx @puppeteer/browsers install chrome@stable
```

It lands in `./chrome/` (already git-ignored) and is removed with `rm -rf chrome`.

In a container, Chrome additionally needs `--chromeArg=--no-sandbox`. uxlint's
preflight detects this by starting a browser rather than by inspecting the
uid — the uid test is wrong, as feature 005 established and this feature's
Phase 0 reconfirmed on a non-root user.

---

## 1. The whole suite

```bash
npm test
```

Builds, checks formatting, lints, and runs Ava against `dist/`. Run this before
pushing, not the three quality-gate commands alone: feature 004 recorded a CI
failure caused by a type-aware lint rule that only fires after `build`.

During development:

```bash
npm run compile && npm run format && npm run lint
```

In that order — Constitution I.

---

## 2. Success criteria, one command each

Each criterion is asserted by a named test, so a criterion cannot silently stop
being checked.

| Criterion | What it asserts | Run |
| --- | --- | --- |
| SC-001 | A planted contrast defect appears in the rendered report, named by its rule | `npx ava --match='*planted defect*'` |
| SC-002 | Every rendered finding states its origin | `npx ava --match='*every finding states its origin*'` |
| SC-003 | Two audits of an unchanged page give the same violation set | `npx ava --match='*violation set is reproducible*'` |
| SC-004 | Vitals and scores render, and absence renders as absence | `npx ava --match='*absent measurement*'` |
| SC-005 | A failed audit loses no findings, on that page or earlier ones | `npx ava --match='*audit failure loses nothing*'` |
| SC-006 | A rule on N elements renders as one finding stating N | `npx ava --match='*one finding per rule*'` |
| SC-007 | Request bytes per page stay ≤ 192,000 | `npx ava --match='*context budget*'` |
| SC-008a | A measurement that never returns still lets the page finish | `npx ava --match='*measurement that never returns*'` |
| SC-009 | No performance finding is rendered at all | `npx ava --match='*no performance finding*'` |
| SC-009a | The progress display names the measurement phase | `npx ava --match='*measuring phase*'` |
| SC-010 | Exactly one model note per page with violations | `npx ava --match='*one note per page*'` |
| SC-011 | Measured findings carry the audit's own wording | `npx ava --match='*audit wording is unaltered*'` |

None of these needs a browser or a model provider. The audit and trace replies
are served from **recorded fixtures** — the real replies captured in Phase 0,
not hand-written approximations. Feature 006's lesson: a double that is
friendlier than the real thing hides the bug it was meant to catch.

---

## 3. The context budget (SC-007)

```bash
npx ava --match='*context budget*'
```

Reuses feature 006's intercepting harness, which reads the request bodies that
would have been sent to the provider. No account, no network.

The number to beat is **192,000 bytes** per page — 1.25× the 153,913 bytes
recorded for v4.3.0 in `specs/006-context-diet/baseline.md`, measured the same
way so the comparison is between like and like.

The headroom is for the measurement digest (~300–600 bytes) and the model's
per-page note. The measurement tools themselves add nothing, because the model
is never offered them — see [`contracts/measurement.md`](./contracts/measurement.md).

---

## 4. Seeing it work for real

Needs a browser. This is the check no fixture can replace.

```bash
npm run build
node specs/007-deterministic-audit/probe/probe.mjs
```

The probe starts the pinned server, drives a fixture page with planted
accessibility defects, and prints the timings and replies that Phase 0 recorded.
Expected, on a localhost fixture:

```text
server tool count: 29
navigate_page          ~1400 ms
take_snapshot             ~7 ms
lighthouse_audit       ~1700 ms   (snapshot mode)
performance_start_trace ~5900 ms  (5 s of which is a fixed sleep)
```

and, in the report JSON it points at:

```text
color-contrast:serious:3
html-has-lang:serious:1
image-alt:critical:1
landmark-one-main:moderate:1
```

If `Protocol error (Target.setDiscoverTargets): Target closed` appears on every
call, Chrome cannot create a user namespace here — pass
`--chromeArg=--no-sandbox`. This reproduces on a non-root user; it is not a
root-only condition.

### A full run against a real site

```bash
npm run build
node dist/cli.js --interactive
```

Watch for the **measuring** phase between capturing and analyzing (FR-013c),
then open the report at the configured `report.output`. What to look for:

- Findings marked as measured carry a rule id; findings marked as judgement do
  not (FR-011).
- The statistics carry the accessibility score, LCP and CLS, with the companion
  scores labelled as snapshot-mode (FR-012a).
- Any rule that failed on more than one page appears once in the recurrence
  summary (FR-013b).

---

## 5. Things that should look wrong, and do not

Worth exercising by hand once, because each is a case where a wrong
implementation still passes a naive test:

| Do this | Expect |
| --- | --- |
| Point at a URL that 404s | Page renders with both measurements "not taken (page not loaded)", not as a pass |
| Point at a page with no accessibility defects | "audited, no violations" — a different statement from silence |
| Kill the browser mid-run | That page is not measured; earlier pages keep every finding |
| Run twice against an unchanged page | Identical violations; LCP differs, and that is correct |

---

## 6. Cleaning up

```bash
rm -rf chrome          # the downloaded browser, ~391 MB
rm -rf /tmp/chrome-devtools-mcp-*   # audit reports left by probe runs
```

uxlint deletes its own report directories after reading them (research.md R7).
The probe scripts do not — they exist to be inspected.
