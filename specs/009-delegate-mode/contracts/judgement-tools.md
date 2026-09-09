# Contract: Judgement Tools

**Feature**: 009-delegate-mode | **Date**: 2026-09-09

The MCP tool surface uxlint serves to a host agent. Server name: `uxlint`.
Under Claude Code these appear as `mcp__uxlint__<name>`, which is the form the
adapter passes to `--allowedTools`.

Five tools. Two serve evidence, three receive judgement. Nothing else is
exposed: a tool the host agent cannot act on is a definition re-sent on every
request for no gain, which is the reasoning `measurement.ts` already records
for keeping the audit tools out of the built-in mode's tool set.

---

## `listPages`

**Input**: none.

**Returns**: every page in the run, in configuration order.

| Field | Meaning |
| --- | --- |
| `pageUrl` | Identifies the page in every other call |
| `features` | The page's declared features |
| `captured` | Whether the page's structure was read |
| `judgement` | `not-started`, `open`, or `finished` |

**Purpose**: one session covers the whole run (FR-021), so the host agent needs
to know what it is working through and what it has already finished. Exposing
`judgement` lets an agent that loses its place recover without submitting into a
page it already closed.

---

## `getPageEvidence`

**Input**: `{ pageUrl: string }`

**Returns**: `persona`, `features`, `snapshot`, `measurementDigest`, and
`captureFailureReason` when the page was never read.

**Effects**: moves the page from `not-started` to `open`. Calling it again on an
`open` page is idempotent and returns the same evidence.

**Errors**:

| Condition | Response |
| --- | --- |
| `pageUrl` names no page in this run | Rejected, listing the valid page URLs |
| The page is `finished` | Rejected, naming it as already finished |

**Note**: a page whose capture failed is still served, carrying its reason. The
host agent must be able to tell a page it has not reached from a page there is
nothing to say about (data-model, PageEvidence validation).

---

## `addFinding`

**Input**:

| Field | Type | Constraint |
| --- | --- | --- |
| `severity` | enum | `critical` \| `high` \| `medium` \| `low` |
| `category` | string | non-empty |
| `description` | string | non-empty |
| `personaRelevance` | string[] | — |
| `recommendation` | string | non-empty |
| `pageUrl` | string | must name a page whose judgement is `open` |

**Not accepted**: `origin`, `ruleId`, `affectedElements`. uxlint assigns
`origin: 'judgement'` on receipt (FR-009). The other two exist only on measured
findings; accepting them would let a submitter claim a verification that never
happened.

**Returns**: `{ accepted: true, findingsOnPage: <count> }`.

**Errors**:

| Condition | Response |
| --- | --- |
| Any field violates the contract | Rejected, naming the offending field and what was expected (FR-008) |
| `pageUrl` names a page that is `not-started` | Rejected, telling the agent to request the page's evidence first |
| `pageUrl` names a page that is `finished` or `abandoned` | Rejected as a late submission; nothing is recorded |

**Why rejections carry a reason**: this is the property that made MCP the right
intake for every host, including Cursor. The submission is validated the moment
it arrives and the agent can correct itself on its next call. A batch of
findings validated after the session ended would turn one malformed field into a
lost page.

---

## `noteOnMeasuredIssues`

**Input**: `{ pageUrl: string, note: string }`

**Returns**: `{ accepted: true }`.

**Constraints**: at most once per page, and only for a page whose measurement
was taken. A second call on the same page is rejected rather than silently
overwriting.

**Purpose**: unchanged from the built-in mode — say what the measured violations
mean for this persona, without restating them. The violations are already
recorded as measured findings, and repeating them would put a guess beside a
fact.

---

## `completePageAnalysis`

**Input**: `{ pageUrl: string }`

**Returns**: `{ accepted: true, pageUrl, findingsOnPage: <count> }`.

**Effects**: moves the page to `finished`. Later submissions naming it are
rejected.

**Difference from the built-in mode**: the built-in tool takes no arguments,
because only one page is ever open. Here one session covers many pages
(FR-021), so the page must be named. This is the **only** intentional
divergence between the two tool sets (R6), and it is what makes FR-022's
per-page attribution enforceable rather than conventional.

**Errors**: a page that is `not-started` cannot be finished; the rejection says
so.

---

## Rules that hold across every tool

1. **Page status is decided by tool traffic, never by the agent's narration.**
   A page is `complete` only when it was captured *and* its completion tool
   fired. This is the built-in mode's rule (`finalisePage`) applied unchanged.
2. **uxlint owns provenance.** No tool accepts `origin`. No tool accepts a rule
   identifier. Measured findings are registered by uxlint from the audit before
   the host agent is ever launched.
3. **A rejection is an instruction.** Every error response says what to do
   differently, because the agent is the only party that can act on it.
4. **The server writes JSON-RPC to stdout and nothing else** (R10). Diagnostics
   go to the file logger. `console-output.ts` must be unreachable from the
   server process.
