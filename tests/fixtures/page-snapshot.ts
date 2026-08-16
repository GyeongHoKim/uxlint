/**
 * A page structure fixture of representative size.
 *
 * Roughly 57 KB, sized to sit in the range a real product or marketing page
 * produces. Phase 0 measured with a 6,800-character stand-in, which risks
 * flattering the reduction: the smaller the tree is relative to the prompt and
 * the tool definitions, the less its duplication costs and the less removing
 * that duplication appears to save.
 *
 * Lives outside the spec files because more than one of them needs it, and
 * because Ava refuses to let a spec be imported as a module.
 */
export const pageSnapshotFixture = Array.from(
	{length: 900},
	(_, index) =>
		`link "Product ${index}" [ref=e${index}]\n  text "Description for item ${index}"`,
).join('\n');

/**
 * A marker appearing exactly once per copy of the fixture in a request body.
 *
 * Deliberately free of quotes. A marker ending in `"` is escaped to `\"` once
 * the body is serialised, so counting it silently returns zero — which reads
 * as "no duplication" rather than as "the count is broken".
 */
export const pageSnapshotMarker = 'ref=e899';
