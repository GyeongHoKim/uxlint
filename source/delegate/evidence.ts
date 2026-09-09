/**
 * Page evidence
 *
 * What a host agent is given about one page. Assembled from the browser's own
 * capture and from the measurement service, with no model involved at any
 * point.
 *
 * @packageDocumentation
 */

import type {Page} from '../models/config.js';
import type {PageEvidence} from '../models/delegate.js';
import type {PageMeasurement} from '../models/measurement.js';
import {describeMeasurement} from '../services/measurement.js';

/**
 * Assemble one page's evidence.
 *
 * A page whose capture failed still produces evidence, carrying the reason.
 * Withholding it would leave the host agent unable to tell a page it has not
 * reached from a page there is nothing to say about, and that distinction is
 * the one the report depends on.
 *
 * @param options - Everything the deterministic half produced for this page
 * @param options.page - The page as configured
 * @param options.persona - The run's persona
 * @param options.snapshot - The browser's own output, unaltered
 * @param options.measurement - What was measured, and what was not
 * @param options.captureFailureReason - Why the page was never read, when it was not
 * @returns The evidence a judgement will be made on
 */
export function buildEvidence(options: {
	page: Page;
	persona: string;
	snapshot: string;
	measurement: PageMeasurement;
	captureFailureReason?: string;
}): PageEvidence {
	const {page, persona, snapshot, measurement, captureFailureReason} = options;

	return {
		pageUrl: page.url,
		features: page.features,
		persona,
		snapshot,
		// The same description the built-in mode puts in front of the model, so
		// a delegated judgement is made on the same measured facts rather than
		// on a second rendering of them.
		measurementDigest: describeMeasurement(measurement),
		...(captureFailureReason !== undefined && {captureFailureReason}),
	};
}
