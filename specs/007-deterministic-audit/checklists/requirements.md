# Specification Quality Checklist: Deterministic Audit

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-18
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### Iteration 1 — 2026-08-18

Two items needed correction and one remains open.

**Corrected during drafting**

- *Success criteria are measurable*: SC-007 originally read "must not undo
  feature 006", which states an intention rather than a threshold. It now
  names a byte ceiling (192,000) derived from a recorded prior measurement,
  checkable with the harness that produced that measurement.
- *Success criteria are technology-agnostic*: SC-008 does not invent a
  wall-clock ceiling here. Feature 005 recorded what happens when a number is
  written into a spec without being measured first, so the criterion requires
  the measurement and defers the ceiling to `plan.md`.

**Resolved by the user, iteration 2**

Two markers were raised rather than guessed, because answering either wrongly
by default would have changed what the feature is. Both are now decided and
the requirements were renumbered to FR-001…FR-021 with cross-references
checked.

- *Which audit categories produce findings* → **accessibility only**
  (FR-003). Performance, best practices and SEO are measured and scored but
  do not become findings. The deciding argument: only the accessibility
  category arrives with an impact rating, so it is the only one FR-009's fixed
  severity mapping can read. Admitting the others would mean inventing a
  severity for each, which is the guessing this feature exists to remove.
- *Whether the model annotates measured violations* → **hybrid**
  (FR-017/018/019). Violations are recorded in the audit's own wording, so
  nothing labelled measured contains model prose. The model writes one note
  per page about the violation set, labelled as judgement and rendered outside
  the findings. Per-violation annotation was rejected because its cost scales
  with violation count, against the budget feature 006 established.

All items pass. The spec is ready for `/speckit-plan`.

### Re-validated after `/speckit-clarify` — 2026-08-18

Three clarifications were integrated (finding scope for repeated rules, the
bound on a measurement that never returns, and whether measurement is a
visible phase). Re-running every item against the updated spec: **16/16 before
→ 16/16 after**, no state changes, no regressions.

One item nearly regressed and was fixed before it could. SC-009a was written
as "verified by rendering the progress component, as this project tests its
other Ink components" — naming a framework inside a success criterion, which
*Success criteria are technology-agnostic* forbids. It now reads "verified
against what the display renders, not against the state that drove it", which
says the same thing and additionally carries the lesson features 005 and 006
both paid for: check the artefact, not the intermediate state.

### Re-validated after Phase 0 research — 2026-08-19

Running the pinned server for real amended four requirements. Re-running every
item against the amended spec: **16/16 → 16/16**, no state changes.

The item most at risk was *Success criteria are measurable*, and it came out
stronger rather than weaker. SC-008 previously deferred its ceiling to the plan
because no measurement existed; it now carries 60 seconds, derived from a
measured 7.6 seconds per page. A criterion that promised to be measured is now
one that has been.

*Requirements are testable and unambiguous* also improved: FR-004 no longer
asks for a metric the tooling cannot supply. A requirement that cannot be
satisfied is not unambiguous, it is merely untested — and it would have been
discovered during implementation instead of during planning.

### Deliberate non-issues

- The spec names Largest Contentful Paint and Cumulative Layout Shift. These
  are web-platform metrics, not implementation choices — naming them is what
  makes FR-004 testable, and no alternative vocabulary for them exists. First
  Contentful Paint was named in the original draft and has been removed: Phase
  0 established that the trace does not report it.
- The spec references features 004, 005 and 006 by number. They are shipped
  work in this repository, not planned implementation, so the references are
  dependency facts rather than leaked design.
