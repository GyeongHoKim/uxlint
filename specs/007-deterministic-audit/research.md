# Phase 0 Research: Deterministic Audit

**Feature**: 007-deterministic-audit
**Recorded**: 2026-08-19
**Server**: `chrome-devtools-mcp@1.7.0` (the pinned version, run as-is)
**Browser**: Chrome for Testing 152.0.7977.42, downloaded locally for these runs
**Lighthouse**: 13.4.1 (bundled inside the server)

## How this was measured

Everything below was produced by starting the pinned server over stdio through
`@ai-sdk/mcp` — the same client uxlint uses — and calling its tools against a
fixture page served from `127.0.0.1`. No mocks, no reading of documentation
where a measurement was possible.

The probe scripts and fixtures are kept in [`probe/`](./probe/) so the numbers
can be reproduced rather than trusted. `probe.mjs` times the tool sequence,
`probe2.mjs` examines the trace metrics and abort behaviour, `probe3.mjs`
checks the result envelope and run-to-run determinism.

**This matters because the roadmap's record of features 004 and 005 says twice
that the failures came from things documents could not tell you.** Five of the
nine findings below contradict something the spec or the roadmap assumed.

---

## R1 — What `lighthouse_audit` actually returns

**Decision**: The audit's violations are read by uxlint from the JSON report
file on disk. The tool's own reply is a four-line summary and cannot carry
findings.

**Measured.** The reply is 409 bytes and looks like this in full:

```text
## Lighthouse Audit Results
Mode: navigation
Device: desktop
URL: http://127.0.0.1:46737/
### Category Scores
- Accessibility: 67 (accessibility)
- Best Practices: 100 (best-practices)
- SEO: 75 (seo)
- Agentic Browsing: 67 (agentic-browsing)
### Audit Summary
Passed: 34
Failed: 7
Total Timing: 4312.56ms
### Reports
- /tmp/chrome-devtools-mcp-D5mCEr/report.json
- /tmp/chrome-devtools-mcp-x3YTaT/report.html
```

There is no rule id, no impact, no element in it — only counts and two file
paths. The full Lighthouse result (**155,968 bytes** for a six-element fixture
page) is written to disk and referenced by path.

**Consequence for the spec.** FR-002 says violations are recorded "without
being routed through the model". That is not merely preferable here, it is the
only thing that works: the tool reply the model would see does not contain the
violations at all. Reading the JSON is the only path to them.

**Alternatives considered**: passing `outputDirPath` to control where reports
land — see R7, which is why we do not.

---

## R2 — The severity mapping has a real source

**Decision**: Severity comes from `audit.details.debugData.impact`, exactly as
the spec's assumption proposed. The fixed table stands.

**Measured** on the planted fixture — every failing accessibility audit
carried an impact:

| Rule | Impact | Failing elements |
| --- | --- | --- |
| `color-contrast` | serious | 3 |
| `html-has-lang` | serious | 1 |
| `image-alt` | critical | 1 |
| `landmark-one-main` | moderate | 1 |

Confirmed in the bundled Lighthouse source as well: `AxeAudit` attaches
`{type: 'debugdata', impact, tags}` to every axe-backed audit's details. The
element count for FR-013 is `details.items.length`, shown above.

**A wrinkle worth recording**: `landmark-one-main` carries tags
`["cat.semantics", "best-practice"]` and no WCAG tag. Not every failing audit
inside the accessibility category is a WCAG failure. The `tags` array is
available if the feature later wants to distinguish them; this feature does
not, and treats every failing accessibility audit alike.

---

## R3 — Snapshot mode gives the same accessibility answer in a third of the time

**Decision**: Use `mode: 'snapshot'`, not the default `mode: 'navigation'`.

**Measured**, same page, back to back:

| Mode | Wall clock | Accessibility score | Failed audits | Reloads the page |
| --- | --- | --- | --- | --- |
| `navigation` (default) | **4,709 ms** | 67 | 7 | yes |
| `snapshot` | **1,712 ms** | 67 | 7 | no |

Two independent reasons to prefer snapshot mode, and one caution.

1. **It is 2.7× faster**, on a fixture that loads instantly. The gap is the
   reload.
2. **It does not reload the page.** The default mode re-navigates, which would
   mean the structure captured by `take_snapshot` and the state the audit
   judged are two different page loads. Snapshot mode audits the DOM that is
   actually there — the same one the snapshot describes and the model reads.
   This resolves the question deferred out of `/speckit-clarify`.

**Caution**: the other categories degrade in snapshot mode. `URL` comes back
`undefined`, SEO scored 50 instead of 75 and Agentic Browsing 67 instead of 50,
because navigation-only audits are skipped (14 passed audits instead of 34).
**The accessibility score and the failing set were identical**, which is what
this feature acts on. Since FR-003 admits only accessibility violations as
findings, the degraded companion scores are a reporting concern, not a
correctness one — and the plan records them as measured in snapshot mode so a
reader is not misled into comparing them with a navigation-mode number.

---

## R4 — The trace gives LCP and CLS. It does not give FCP.

**Decision**: Record LCP and CLS. **Drop FCP from the feature.**

**Measured.** A trace over a page with a real navigation reports:

```text
## insight set id: NAVIGATION_0
Metrics (lab / observed):
  - LCP: 80 ms, event: (eventKey: r-1357, ts: 864375136336), nodeId: 12
  - LCP breakdown:
  - CLS: 0.00
Metrics (field / real users): n/a – no data for this page in CrUX
```

FCP appears nowhere as an observed metric. Its only occurrence in the whole
7,018-byte reply is inside an insight, as `estimated metric savings: FCP 0 ms`
— a projected saving from a suggested fix, not the page's First Contentful
Paint. Reporting it as the page's FCP would be a fabricated number, which is
the exact defect this feature exists to remove.

**Consequence for the spec**: FR-004 and SC-004 name three vitals. They must
name two. This is written up as an amendment in `plan.md` and applied to
`spec.md`.

**A second finding, from the first fixture**: a page trivial enough to load
with no navigation event produces `insight set id: NO_NAVIGATION` and reports
**CLS only — no LCP**. So LCP is not guaranteed even on a successful trace.
FR-006's "not taken" state must therefore cover a per-metric absence, not just
a per-measurement one: a trace can succeed and still have no LCP to report.

**Alternatives considered**: saving the raw trace via `filePath` and parsing it
ourselves for FCP. Rejected — it means owning a trace-event parser to recover
one metric, against Constitution V, when the two metrics that do arrive are
enough to make the report comparable between runs.

---

## R5 — What measurement costs, and the bound it implies

**Decision**: The per-measurement bound of FR-005a is **60 seconds**, set from
the measurements below with the headroom stated.

**Measured** (fixture served from localhost, so this is a floor, not a
typical case):

| Call | Wall clock | Reply size |
| --- | --- | --- |
| `navigate_page` | 1,430 ms | 108 B |
| `take_snapshot` | 7 ms | 334 B |
| `lighthouse_audit` (navigation) | 4,709 ms | 409 B |
| `lighthouse_audit` (snapshot) | **1,712 ms** | 393 B |
| `performance_start_trace` | **5,222–5,906 ms** | 5,349–7,018 B |

Measurement therefore adds roughly **7.6 seconds per page** with the snapshot
mode chosen in R3 — 1.7s of audit and 5.9s of trace — against a page that
loads in 1.4s.

**The trace has a five-second floor by design**: with `autoStop: true` the
server sleeps a fixed `5_000` ms before stopping. Nothing we pass shortens it.

**The audit has its own internal 30-second page-load ceiling**
(`maxWaitForLoad: 30_000`), which is a load timeout, not a total.

**Why 60 seconds.** The audit's own internal ceiling is 30s, and a real site
over a real network on CI hardware will be some multiple of a localhost
fixture. A bound below the tool's own load timeout would fire on pages the
tool would have handled. 60s is double that ceiling, roughly eight times the
observed cost, and still small enough that a hung page cannot consume a run.
**It is a safety net against a hang, not a performance target** — a run
regularly hitting it should be read as something being wrong.

This is the number SC-008 asked for.

---

## R6 — Aborting a measurement works, and leaves a mark

**Decision**: Implement FR-005a with `options.signal` on `callTool`. Record the
after-effect below in the plan.

**Measured.** `client.callTool({..., options: {signal: AbortSignal.timeout(300)}})`
against a running audit rejects with `MCPClientError: Request was aborted`.
`RequestOptions` is `{signal?, timeout?, maxTotalTimeout?}`, so the bound needs
no new machinery.

**The server survives the abort** — the next `take_snapshot` succeeded. But it
took **4,661 ms**, against 7 ms for the same call on an unabused connection.
The abandoned audit goes on running inside the browser and the next call waits
behind it.

**Consequence**: abandoning a measurement is not free, and a timeout that fires
costs roughly a second measurement's worth of time on the call after it. This
is acceptable for a safety net that should never fire in a healthy run, and it
is a further argument against a tight bound: a bound that fires spuriously
would tax every page twice.

---

## R7 — Report files land in the OS temp directory, and are never reused

**Decision**: Parse the report path out of the reply text, read the JSON, and
delete the directory when done.

**Measured.** On connect the server logs:

> The connecting client did not negotiate the MCP roots capability. File-writing
> tools will be restricted to the OS temp directory.

So `outputDirPath` cannot be pointed at a project directory unless uxlint
negotiates MCP roots or the server is started with
`--allow-unrestricted-paths`. Neither is worth doing to choose a directory.

Each call creates a **fresh random temp directory** — two audits of the same
page in one session produced
`/tmp/chrome-devtools-mcp-UOPSWk/` and `/tmp/chrome-devtools-mcp-jsjU41/`.
Paths cannot be predicted or cached; they must be read from the reply.

**Consequence**: at 156 KB of JSON plus an HTML report per audit, a ten-page
run leaves several megabytes in `/tmp` behind every run. uxlint deletes the
directory after reading it.

---

## R8 — The result envelope carries no structured content

**Decision**: Extract the report path by parsing the reply text.

**Measured.** The `CallToolResult` that reaches uxlint has exactly two keys:
`content` and `isError`. The server does populate `structuredContent`, and
`@ai-sdk/mcp` **does not pass it through**.

This is the same class of surprise feature 006 hit — assuming the adapter's
result shape instead of checking it, and having every test double agree with
the assumption. The parsing is therefore written against the format recorded in
R1, and its test fixture is the recorded reply, not a hand-written string.

**Risk accepted**: a server upgrade that changes the summary wording breaks the
parse. Mitigated by the version pin (feature 005's `@latest` prohibition) and
by treating an unparseable reply as "not measured" rather than as a crash.

---

## R9 — The violation set is reproducible

**Decision**: SC-003 is achievable as written.

**Measured.** Two audits of the same unchanged page in one session produced
identical results, compared as `ruleId:impact:elementCount`:

```text
run 1: ["color-contrast:serious:3","html-has-lang:serious:1","image-alt:critical:1","landmark-one-main:moderate:1"]
run 2: ["color-contrast:serious:3","html-has-lang:serious:1","image-alt:critical:1","landmark-one-main:moderate:1"]
identical: true
```

The planted contrast defect was caught as `color-contrast`, impact `serious`,
on 3 elements — so SC-001 is satisfiable exactly as the spec words it, and the
fixture that proves it is [`probe/fixture.html`](./probe/fixture.html).

Vitals are **not** reproducible in the same way — LCP is a timing and moves
between runs. SC-003 is correct to constrain only the violation set.

---

## R10 — Confirmations of things the roadmap recorded

Two claims checked rather than inherited:

- **The server exposes 29 tools**, confirming feature 005's correction of the
  roadmap's "50". Unchanged in 1.7.0.
- **The container sandbox failure is real and reproduces here.** Without
  `--chromeArg=--no-sandbox` every tool returned
  `Protocol error (Target.setDiscoverTargets): Target closed` — the exact
  symptom 005 documented, on a non-root user, confirming that the deciding
  factor is the user-namespace restriction rather than the uid. Feature 005's
  preflight already supplies the flag; this feature inherits it and adds
  nothing.

---

## Summary of spec amendments this research forces

| # | Finding | Spec change required |
| --- | --- | --- |
| R4 | FCP is not an observed metric of the trace | FR-004, SC-004: three vitals become two |
| R4 | A successful trace can still report no LCP | FR-006: "not taken" must be per metric |
| R3 | Snapshot-mode audit degrades the non-accessibility scores | FR-012: companion scores labelled as snapshot-mode |
| R5 | Measurement costs ~7.6 s/page on a localhost fixture | SC-008: bound recorded as 60 s |

All four are applied to `spec.md` as part of this plan, and listed in
`plan.md` under *Spec amendments from Phase 0*.
