# Specification Quality Checklist: Single Browser Server — Swap to chrome-devtools-mcp

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

Every item passed on the first pass; no spec revisions were required. Two items deserve a note on *how* they pass, because both were near misses by construction rather than by luck.

1. **"No implementation details" for a feature that is entirely a tooling change.** Product names appear in the title and the Input statement, which is where they identify the feature, and nowhere in the requirements. FR-001, FR-018 and SC-009 say "a single browser tooling source" and "the removed browser server" instead. This is not cosmetic: it keeps the requirements reviewable by someone who has no opinion about which server is better, and it keeps them true if the choice of server is ever revisited.

2. **"Success criteria are measurable" turns on the word the roadmap flagged.** The roadmap named "equivalent" as the term this feature must define. The spec never uses it as a criterion: SC-001 states a countable property (the same pages reach the same statuses across three runs on each side of the change), and Assumptions states that equivalence is structural and never textual, with the reason — language-model output varies between runs, so a textual bar could not be met and would be quietly lowered later rather than achieved.

## Notes on scope decisions taken without a clarification marker

The command permits up to three [NEEDS CLARIFICATION] markers. None were used. Three decisions could reasonably have been questions; each had a defensible default, and each is recorded in Assumptions where a reviewer can overturn it:

- **TLS tolerance default** — preserved as-is rather than tightened, so that any behavioural difference observed after the swap has exactly one possible cause. Tightening it is a separate decision. **Confirmed in clarification (2026-08-15); FR-015 now states the default explicitly.**
- **Meaning of equivalence** — defined as structural, per note 2 above. Not revisited in clarification; still an assumption.
- **Browser procurement policy** — the product requires a pre-installed browser and fails with guidance, rather than downloading one. This follows from the adopted tooling shipping no browser of its own; a download path would be a new capability, not a preserved one. Not revisited in clarification; still an assumption.

## Re-validation after clarification (2026-08-15)

Four questions were answered and integrated. All 16 items still pass; no item changed state. The integrations introduced three internal inconsistencies, all found and fixed during the post-integration validation pass rather than left for planning:

1. **A requirement contradicted by its own clarification.** FR-003 ("same field set") and FR-011 ("record the tooling version") could not both hold. FR-003 is now scoped to protect existing fields from removal, renaming and change of meaning, which is the intent it always had; additions are permitted and FR-011 makes exactly one. US1 scenario 3 was reworded to match.
2. **A second field smuggled in by a requirement written before the first answer.** FR-014 asked the report to disclose external data lookups — which would have been a second added field, contradicting both FR-003's new wording and the Key Entities claim that provenance is the only addition. The disclosure is now carried inside the provenance record, so the count stays at one.
3. **Stale vocabulary after the dependency answer.** User Story 4 still spoke of runs "resolving" the tooling, which describes run-time fetching — the behaviour the clarification removed. Reworded to "use", and its Independent Test now claims no network access at all, which the answer makes true.

Item 2 is worth noting for planning: it was not present in the original spec and was not introduced by an answer either. It appeared because an answer changed the meaning of a constraint that a *different*, previously consistent requirement depended on. Integrating clarifications one at a time without re-reading the whole document would have shipped it.
