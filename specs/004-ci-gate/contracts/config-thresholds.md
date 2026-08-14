# Contract: `.uxlintrc` `thresholds` block

**Feature**: `004-ci-gate` | **Stability**: additive — a config without this block behaves exactly as it does in 4.0.1 (FR-004)

This is a user-facing contract. Both supported file formats accept the same shape with identical meaning (FR-001).

## Shape

```yaml
thresholds:
  maxCritical: 0 # integer >= 0. Absent = not gated on this severity.
  maxHigh: 3
  maxMedium: 10
  maxLow: 20
  failOnPartialPage: true # default true when `thresholds` is present
  failOnFailedPage: true # default true when `thresholds` is present
```

```json
{
  "thresholds": {
    "maxCritical": 0,
    "maxHigh": 3,
    "maxMedium": 10,
    "maxLow": 20,
    "failOnPartialPage": true,
    "failOnFailedPage": true
  }
}
```

Every key is optional. `thresholds: {}` is valid and gates on coverage only.

## Semantics

| Input | Behaviour |
| --- | --- |
| No `thresholds` key | Gate is off. Exit status identical to 4.0.1. |
| `thresholds` present, severity key absent | That severity is not gated. |
| `maxCritical: 0` | Any critical finding fails the run. |
| `count == limit` | **Passes.** The limit is an inclusive maximum (FR-006). |
| `count > limit` | Fails, and the breach names the limit and the count. |
| `failOnPartialPage: true` | Any partial page fails the run. |
| `failOnFailedPage: true` | Any failed page fails the run; output includes each page's recorded reason. |
| No page completed or partially completed | Fails regardless of every setting above, including both coverage flags set to `false` (FR-012). Requires `thresholds` to be present at all — with no block the gate never runs. |

Findings are counted across **all** pages, including partial and failed ones (FR-011).

## Rejected input

Rejected **before analysis starts**, so a misconfigured pipeline costs no model usage (SC-005). Each error names the offending key and the received value.

| Input | Rejected because |
| --- | --- |
| `maxCritical: "0"` | not a number |
| `maxCritical: -1` | negative |
| `maxCritical: 1.5` | not an integer |
| `maxHigh: null` | not a number |
| `failOnPartialPage: "yes"` | not a boolean |
| `maxCritcal: 0` (typo) | unrecognised key |
| `thresholds: []` | not an object |
| `thresholds: null` | not an object |

Unknown-key rejection is what makes a typo loud instead of silent. A misspelled key that was merely ignored would leave the user believing they had a gate when they had none — the failure US3 exists to prevent.

## Exit status

| Outcome | Non-interactive | Interactive |
| --- | --- | --- |
| Gate passed | `0` | unchanged from today |
| Gate breached | non-zero | unchanged from today |
| Analysis threw | non-zero (unchanged) | unchanged from today |

A single non-zero status covers every breach type; the log carries the detail (spec Assumptions). Pipelines only need success-versus-failure.

The report file is written before exit in every case (FR-010) — a failing gate must not cost the user the artifact that explains the failure.

## Output contract

Written to stdout after the MCP transport is closed, and to the Winston log (research R4).

**Breached** — every breach listed, not just the first (FR-007):

```
uxlint: gate failed

  critical  2 findings, limit 0
  high      5 findings, limit 3
  partial   1 page not fully analysed
              https://shop.test/cart
  failed    1 page could not be analysed
              https://shop.test/checkout — navigation timed out after 30s
```

**Passed** — still reports what was evaluated, so an active gate is visible in a green log (FR-009):

```
uxlint: gate passed

  critical  0 findings, limit 0
  high      2 findings, limit 3
```

**Nothing analysed** (FR-012):

```
uxlint: gate failed

  no page was analysed successfully — the report is not evidence of anything
```
