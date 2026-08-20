# Data Model: Deterministic Audit

**Feature**: 007-deterministic-audit
**Date**: 2026-08-19

Types are described by what they mean and why they are shaped that way. Field
lists are given in TypeScript because this repository's model files are the
specification of its data — see `source/models/analysis.ts`.

---

## 1. Finding provenance — the change with the widest reach

### `FindingOrigin`

```ts
export type FindingOrigin = 'audit' | 'judgement';
```

Named for **what produced the statement**, not for the vendor that produced it.
`'lighthouse'` would put a tool name in the domain model and in the rendered
report, and would have to be renamed the day the tool changes — while what the
reader needs to know ("did a machine check this, or did an AI conclude it?")
would not have changed at all.

A `'trace'` member was declared first, on the argument that widening a stored
format later is expensive. It is gone: nothing can emit one, because vitals are
reported as numbers rather than as findings, and a member no code can produce
is a promise the report cannot keep. Adding it the day something registers a
trace finding is a smaller change than explaining an origin that never
appears.

### `UxFinding` — modified

```ts
export type UxFinding = {
	severity: FindingSeverity;
	category: string;
	description: string;
	personaRelevance: string[];
	recommendation: string;
	pageUrl: string;

	/** What produced this finding (FR-007) */
	origin: FindingOrigin;

	/** Rule that produced it; present only when origin is 'audit' (FR-008) */
	ruleId?: string;

	/** How many elements the rule failed on; present only when origin is 'audit' (FR-013) */
	affectedElements?: number;
};
```

**`origin` is required, not optional.** An optional field would let a finding
be created without one, and the first such finding would render as neither
measured nor judged — defeating the point of the feature. Every construction
site is made to state it.

**Invariants** (each is a test, not a comment):

| Invariant | Requirement |
| --- | --- |
| `ruleId` present ⟺ `origin === 'audit'` | FR-008 |
| `affectedElements` present ⟺ `origin === 'audit'`, and ≥ 1 | FR-013 |
| `origin === 'audit'` ⟹ `description` is the audit's own title, unmodified | FR-017, SC-011 |
| `severity` for `origin === 'audit'` is `impactToSeverity(impact)` | FR-009 |

---

## 2. Measurement

### `Measured<T>`

```ts
export type Measured<T> =
	| {state: 'taken'; value: T}
	| {state: 'not-taken'; reason: NotTakenReason};

export type NotTakenReason =
	| 'page-not-loaded'
	| 'tool-failed'
	| 'timed-out'
	| 'unparseable';
```

The three states of FR-006 in one type. A plain `T | undefined` cannot
distinguish "audited and clean" from "never audited", and FR-006 exists
precisely because a blank reads as a pass. Making absence carry a reason costs
nothing and is what lets FR-006's rendering say *why*.

`Measured` wraps **each metric** as well as each measurement, per FR-006a: a
trace that succeeded but reported no LCP is `{state: 'taken'}` at the trace
level and `{state: 'not-taken'}` at the LCP level.

### `AuditResult`

```ts
export type AuditResult = {
	/** Category scores, 0–100, keyed by the category id the audit reports */
	scores: Record<string, number>;

	/** Every accessibility rule that failed (FR-003) */
	violations: Violation[];

	/**
	 * Whether the companion scores were taken in the non-reloading mode.
	 *
	 * Always true in this feature. Recorded rather than assumed because the
	 * SEO and best-practices numbers are degraded by that choice (research.md
	 * R3) and a reader must not compare them with a full-navigation score.
	 */
	snapshotMode: boolean;
};
```

### `Violation`

```ts
export type Violation = {
	/** The audit's rule id, e.g. 'color-contrast' */
	ruleId: string;

	/** The audit's own title, carried unaltered (FR-017) */
	title: string;

	/** axe impact rating, the sole input to severity (FR-009) */
	impact: AxeImpact;

	/** Number of elements the rule failed on; ≥ 1 */
	affectedElements: number;
};

export type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor';
```

### `TraceResult`

```ts
export type TraceResult = {
	/** Largest Contentful Paint in milliseconds */
	largestContentfulPaint: Measured<number>;

	/** Cumulative Layout Shift, unitless */
	cumulativeLayoutShift: Measured<number>;
};
```

No First Contentful Paint. The trace does not report one (research.md R4), and
a field that could only ever be filled from a projected saving would invite
exactly the fabrication this feature removes.

### `PageMeasurement`

```ts
export type PageMeasurement = {
	audit: Measured<AuditResult>;
	trace: Measured<TraceResult>;
};
```

Independently wrapped, because one can succeed while the other fails and the
report must say which (spec Edge Cases).

---

## 3. Severity mapping (FR-009)

```ts
const impactToSeverity: Record<AxeImpact, FindingSeverity> = {
	critical: 'critical',
	serious: 'high',
	moderate: 'medium',
	minor: 'low',
};
```

A total `Record`, so a new impact value cannot be silently dropped — the
compiler rejects the map, which is the point of writing it as data rather than
as a `switch` with a default.

Verified against real output: `color-contrast` → serious → high,
`image-alt` → critical → critical, `landmark-one-main` → moderate → medium
(research.md R2).

---

## 4. Page and report

### `PageAnalysis` — modified

```ts
export type PageAnalysis = {
	// ... existing fields unchanged ...

	/** What was measured for this page (FR-001, FR-006) */
	measurement: PageMeasurement;

	/**
	 * The model's single note about this page's measured violations.
	 *
	 * Absent when the page had no violations to write about. Stored apart
	 * from `findings` so that model prose can never be read as measured
	 * (FR-018, FR-019).
	 */
	measurementNote?: string;
};
```

### `RuleRecurrence` — new, report-level

```ts
export type RuleRecurrence = {
	ruleId: string;
	title: string;
	pageCount: number;
};
```

Derived at render time from the findings, per FR-013b. **Derived, not stored**
— a stored copy is a second source of truth that can disagree with the
findings it summarises, and the summary must never be able to say something
the findings do not.

### `ReportMetadata.tooling` — extended

```ts
export type RunProvenance = {
	browserServer: string;
	browserServerVersion: string;
	browserVersion: string;
	externalDataAllowed: boolean;

	/** Version of the audit engine that produced the measurements (FR-010) */
	auditEngineVersion: string;
};
```

Read from the audit's own report (`lighthouseVersion`, measured as `13.4.1`),
not hardcoded. A report weeks old must be able to say which engine judged it;
the engine ships inside the browser server and moves independently of the
uxlint version.

---

## 5. State transitions

The stage machine of feature 006 is **unchanged**. Measurement is not a stage,
because stages exist to decide which tools the *model* may call, and the model
never calls the measurement tools (see `contracts/measurement.md`).

Measurement happens once per page, after the page reaches `analysable` — that
is, after a navigation and a capture both succeeded — and before the first
model call that forms a judgement.

```text
unloaded --navigate_page--> loaded --take_snapshot--> analysable
                                                          |
                                                   [measure: audit, trace]
                                                          |
                                                   model judgement loop
```

Measuring only at `analysable` follows from FR-001 ("every page that loads")
and from the audit's non-reloading mode (FR-012a): there must be a loaded page
whose current DOM is the thing to audit.

A page that never reaches `analysable` records
`{state: 'not-taken', reason: 'page-not-loaded'}` for both measurements — the
report then says the page was not measured, rather than implying it passed.

---

## 6. Interactive progress

`AnalysisStage` gains one member:

```ts
const analysisStages = [
	'idle',
	'navigating',
	'capturing',
	'measuring',   // new (FR-013c)
	'analyzing',
	'page-complete',
	'generating-report',
	'complete',
	'error',
] as const;
```

Placed between `capturing` and `analyzing` because that is when it happens, and
because `isAnalysisInProgress` reads this list.

---

## 7. What is deliberately absent

| Not modelled | Why |
| --- | --- |
| A stored per-run baseline | Feature 010. This feature makes the numbers exist; comparing them across runs needs an artefact this one does not define. |
| Thresholds on LCP or CLS | Turning "LCP is 4.1s" into a finding requires agreeing what is too slow for a persona — feature 009. |
| Findings from SEO, best-practices or agentic-browsing | FR-003. They carry no impact rating, so severity would have to be invented. |
| A cross-page violation entity | FR-013a keeps findings page-scoped; recurrence is derived at render time. |
| Raw audit report retention | The 156 KB JSON is read and its directory deleted (research.md R7). Keeping it would grow `/tmp` by megabytes per run for data already extracted. |
