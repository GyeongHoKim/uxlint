# Specification Quality Checklist: Context Diet

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-15
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

## Validation Notes

All items pass. Three points deserve recording rather than silent approval.

1. **The token target is a number, and numbers in specs rot.** SC-002 says 40%. That is defensible arithmetic — the change removes a duplicated page structure from every subsequent turn plus roughly twenty-seven unused tool definitions from every request — but it is still a figure chosen before measurement. It is stated as a floor rather than a forecast, and the Assumptions section says why: a threshold only an exceptional run can clear gets lowered later instead of met. If the baseline shows 40% is unreachable, the honest response is to revisit the design, not the number.

2. **Success criteria are paired so that "cheaper" cannot silently mean "worse".** SC-002 (smaller requests) sits next to SC-006 (same per-page status) and SC-009 (the model still receives the page structure, persona and features). A context diet that trimmed the analysis into producing less would satisfy the first and fail the others. 005 taught this the expensive way: a criterion asserted about an internal object rather than the user-visible result passed while the artefact was wrong.

3. **The first draft of this spec made the central criteria unenforceable, and that was the real defect.** It tied token measurement to live runs against real targets, copying the shape of 005's baseline without asking whether the shape fitted. It did not. 005 needed live runs because it asked whether swapping a browser engine preserved behaviour; this feature asks what the system puts into a request, which is knowable before the request is sent. Measuring it at the intercepted transport boundary makes every criterion CI-enforceable, needs no provider account, and removes the dependency that has now delayed verification on two consecutive features. The corrected version also measures something more faithful than the draft would have: the actual serialised request, not an approximation taken further up the stack.

## Note on the "no implementation details" item

That item passes with a qualification worth stating rather than glossing.

The requirements and success criteria name no mechanism: they say what must be
true of a request, not how a request is observed. The Assumptions section does
name the verification approach — interception at the transport boundary, and
why it beats stubbing the provider client. That is deliberate. How a criterion
will be checked is part of whether it is a criterion at all: the first draft of
this spec set criteria that turned out to need a provider account, and nothing
in the requirements themselves revealed that. Recording the approach where the
assumptions live is what makes the difference reviewable.

## Notes on scope decisions taken without a clarification marker

No [NEEDS CLARIFICATION] markers were used. Three decisions could have been questions; each had a defensible default and is recorded in Assumptions where a reviewer can overturn it:

- **Snapshot trimming excluded.** The roadmap raises injecting only relevant regions of very large trees. That trades fidelity for size and needs its own evidence; this feature only stops paying for the same text twice.
- **Filtering layer left to planning.** The requirement is that unused tools are absent, not how. Both a client-side selection and server-side category switches exist as of the pinned server; the note that the performance category belongs to 007 is recorded so the features do not collide.
- **The manual loop stays.** Replacing it is 008. This feature changes what each call is given, not who drives the calls.
- **Verification intercepts the provider endpoint rather than stubbing the provider client.** Both would be deterministic; interception measures the real request body and exercises serialisation, and this project already uses that approach for its authentication tests.
