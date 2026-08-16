# SC-009 runbook

The one criterion in 006 that a mock cannot answer: **did a smaller context make
the analysis weaker?** It compares median findings per page before and after the
diet, against the same real targets and the same model.

Not performed during implementation — that environment had no provider account
and no Chrome. Recording that is not the same as verifying it, so this exists to
make the check one command rather than a research project.

## Running it

```bash
cd specs/006-context-diet/sc009
UXLINT_AI_PROVIDER=anthropic UXLINT_AI_API_KEY=sk-... ./run.sh
```

Needs a usable Chrome. `RUNS=3` by default; `BASELINE_REF` defaults to `d663ea8`,
the commit before the diet.

## What it does

1. Checks out the baseline commit, builds, and runs the analysis `RUNS` times
   against `targets.yml`
2. Does the same on the feature branch
3. Reports the median findings per page on each side and the change

`measure.mjs` reads the count the report states per page, from the rendered
markdown rather than from an in-memory object — the markdown is what a run
leaves behind and what a person would compare. Verified against output from the
real report generator.

## Reading the result

| Change | Meaning |
| --- | --- |
| within −20% | SC-009 holds |
| worse than −20% | The diet cost analysis quality. **Revisit the design, not the threshold** |

Findings counts vary between runs on the same page, which is why the script
takes the median of several runs on each side rather than comparing single runs.
