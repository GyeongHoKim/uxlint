# Contract: The Judgement Document

**Feature**: 010-inverted-delegation | **Date**: 2026-09-10

What `uxlint delegate submit` accepts, and what it refuses. This is the same
contract the MCP judgement tools enforce, expressed as one document instead of a
series of calls — because that is what an agent driving a CLI can compose in one
step.

---

## Shape

One document per call, covering one or more pages of one run.

```json
{
	"run": "<run identity from capture>",
	"pages": [
		{
			"pageUrl": "https://example.com/",
			"findings": [
				{
					"severity": "high",
					"category": "navigation",
					"description": "What is wrong, for this persona.",
					"personaRelevance": ["Why this persona in particular hits it"],
					"recommendation": "What to do about it."
				}
			],
			"measurementNote": "What the measured violations mean here.",
			"finished": true
		}
	]
}
```

Every field of a finding is exactly what the existing judgement tool accepts. That
is deliberate: `submit` does not define a finding, it decomposes a document into the
submissions the existing intake already validates.

---

## What is refused, and why

### A finding that declares its own provenance

`origin`, `ruleId` and `affectedElements` are refused outright, naming the field.

This is the single most important rule in delegate mode and it is not stylistic.
uxlint assigns every finding's origin on receipt, so that a reader can tell what was
measured from what was judged. A submitter able to mark its own output measured
would make the distinction the report is built on worthless, and a judged finding
carrying a rule identifier would claim a verification that never happened.

The schema is strict, so an unrecognised key is a rejection rather than something
silently dropped. 009 hardened this boundary twice — once at the tool, and again
when reading the submission log back, after a live Cursor Agent run appended a line
of its own to a log. This route must not become a third place where the rule can
drift, which is why `submit` may not construct a finding itself.

### A page outside the run

Refused, and the refusal names the run's pages, so the agent can correct itself
rather than guess.

### A page whose evidence was never read

Refused. A judgement made on a URL instead of on the captured evidence is not a
judgement, and the state machine that enforces this is the same one the tool route
uses.

### A submission after the page was finished

Refused as late, and nothing already recorded for that page changes.

### A second measurement note for a page

Refused. The note is recorded once per page; a second would overwrite the first.

### A malformed or truncated document

Refused before anything is appended, so the run's recorded state survives. The
message names what was wrong.

---

## Partial acceptance

A document carrying one bad finding among good ones has its good ones accepted and
the bad one refused by name. One malformed finding must not cost an agent a page's
work, and the refusal has to be actionable, because the agent's only chance to act
on it is its next call.

This mirrors what the tool route already gives an agent per call. The difference is
that here several submissions share one exit, so the response has to say which were
accepted and which were not.

---

## What `submit` does with an accepted document

1. Records each accepted finding, note and completion into the run's log, through
   the existing intake, which assigns the origin.
2. Assembles the report at the configured output path from everything the run has
   accumulated, not only from this call.
3. Reports the gate verdict with the existing exit semantics.

Page status in that report is decided by what arrived (FR-011). `"finished": true`
is a signal from the agent that uxlint records; it is not the status. A page an
agent marks finished having submitted nothing for it is recorded as judged-and-empty;
a page it never marks at all is recorded as partial with a reason. Neither is
inferred from the agent's own account of how the review went.
