---
name: uxlint-review
description: Run a UX review of a web application with uxlint. Use when asked to "review the UX", "check the user experience", "run a UX review", "audit this app's usability", or when a .uxlintrc.yml or .uxlintrc.json is present and the user wants the app assessed for a persona.
---

# Reviewing a web application with uxlint

uxlint does the deterministic half of a UX review — it opens every configured
page in a real browser, captures its structure, and measures accessibility and
performance. It does not judge. **You do the judging**, and uxlint assembles the
report from what you submit.

That is why no model API key is involved: the reasoning is yours, and uxlint
needs none of its own.

## What you must not do

- **Do not invent measurements.** Accessibility violations and performance
  figures are measured and already recorded. You are reading a text description
  of a page: it carries no contrast ratios, no computed roles, no focus order and
  no paint timings. A severity you assign to something you cannot observe is a
  guess.
- **Do not restate the measured violations as findings.** Treat them as
  established fact. There is one place to comment on them, described below.
- **Do not claim provenance.** `origin`, `ruleId` and `affectedElements` are
  uxlint's to set, and a submission carrying any of them is refused. Leave them
  out.

## The sequence

### 1. Capture

```bash
uxlint delegate capture
```

Run this from the directory holding `.uxlintrc.yml` or `.uxlintrc.json`. It opens
a browser, works through every configured page, and prints JSON:

```json
{
	"run": "<run id>",
	"pages": [{"pageUrl": "https://example.com/", "captured": true}]
}
```

Keep the `run` value. Every command below needs it. A page with
`"captured": false` carries a `failureReason` — uxlint could not read it, and
there is nothing for you to judge there.

### 2. Read the evidence

```bash
uxlint delegate evidence --run <run id>
```

Prints, per page: the declared features, the persona, the captured structure, and
a description of what was measured. It opens no browser, so it is cheap to call
again.

If the pages are large, take them one at a time:

```bash
uxlint delegate evidence --run <run id> --page https://example.com/
```

Read each page **as the persona uxlint gives you**, not as yourself. The persona
is in the evidence, and it is the whole point: whether the wording makes sense to
_them_, whether the structure matches how _they_ think, whether the flow is one
_they_ could finish.

### 3. Judge, and submit

Write a JSON document and submit it:

```bash
uxlint delegate submit --run <run id> --file judgement.json
```

The document, or `-` to pipe it on stdin:

```json
{
	"run": "<run id>",
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
			"measurementNote": "What the measured violations mean for this persona, and how to address them here.",
			"finished": true
		}
	]
}
```

- `severity` is one of `critical`, `high`, `medium`, `low`.
- Three to ten findings per page is typical. Cover several categories:
  navigation, visual design, content, interaction, mobile responsiveness.
- `measurementNote` is at most once per page, and only where measurements were
  supplied. Say what that set of violations means for this persona — do not list
  the violations again.
- `finished: true` says you are done with that page.

You may submit once at the end or once per page as you work. The report is
written on every call, so a review interrupted halfway has still produced a
report saying which pages were judged.

### 4. Tell the user where the report is

The report goes to the `report.output` path in their configuration. The command
also prints the gate verdict, and exits non-zero when the configured thresholds
were not met — worth passing on as it is.

## If something is refused

Refusals name the field or the page. Read them and correct that finding on your
next `submit` call: the rest of what you sent was accepted and does not need
resending. In particular, a finding for a page whose evidence you never read is
refused, because a judgement made on a URL rather than on the captured evidence
is not a judgement.

## Housekeeping

```bash
uxlint delegate runs                 # reviews that exist, and how far each got
uxlint delegate discard --run <id>   # throw one away
```

Runs are kept for 24 hours, so a review can be picked up the next day. If the
user asks about an earlier review, `runs` is where to look.
