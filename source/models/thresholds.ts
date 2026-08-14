/**
 * Threshold configuration for the CI gate
 *
 * Declares how many findings of each severity a run may produce before it
 * fails, and whether incomplete coverage counts as a failure.
 *
 * @packageDocumentation
 */

import type {FindingSeverity} from './analysis.js';

/**
 * Maximum permitted counts and coverage rules for a run.
 *
 * Every field is optional, and absent is not the same as zero: an absent
 * `maxCritical` means critical findings are not gated at all, while
 * `maxCritical: 0` means none are permitted.
 */
export type Thresholds = {
	/** Maximum critical findings permitted; absent means not gated */
	maxCritical?: number;

	/** Maximum high findings permitted; absent means not gated */
	maxHigh?: number;

	/** Maximum medium findings permitted; absent means not gated */
	maxMedium?: number;

	/** Maximum low findings permitted; absent means not gated */
	maxLow?: number;

	/** Whether a page cut short before finishing fails the run */
	failOnPartialPage?: boolean;

	/** Whether a page that could not be analysed fails the run */
	failOnFailedPage?: boolean;
};

/**
 * Which threshold field caps which severity.
 *
 * Kept as a single lookup so that adding a severity later touches one place
 * rather than every counting site.
 */
export const severityThresholdKeys = {
	critical: 'maxCritical',
	high: 'maxHigh',
	medium: 'maxMedium',
	low: 'maxLow',
} as const satisfies Record<FindingSeverity, keyof Thresholds>;

/**
 * A partial page fails the run unless the user says otherwise.
 *
 * Asymmetric with the severity limits, which default to absent, and
 * deliberately so: a severity budget is a policy choice a team has to make,
 * but a verdict resting on pages that never finished is not evidence of
 * anything. Once a user opts into gating at all, that is the safe default.
 */
export const defaultFailOnPartialPage = true;

/**
 * A failed page fails the run unless the user says otherwise.
 *
 * @see defaultFailOnPartialPage for why this defaults to true
 */
export const defaultFailOnFailedPage = true;

/**
 * A rejected threshold configuration, described well enough to fix.
 */
export type ThresholdsIssue = {
	/** Dotted path to the offending key, e.g. `thresholds.maxCritical` */
	key: string;

	/** What was actually supplied */
	received: unknown;

	/** Human-readable explanation naming the key and the value */
	message: string;
};

const booleanKeys = ['failOnPartialPage', 'failOnFailedPage'] as const;

const severityKeys = Object.values(severityThresholdKeys);

const knownKeys = new Set<string>([...severityKeys, ...booleanKeys]);

/**
 * Render a value for an error message without JSON.stringify's `undefined` hole.
 */
function describe(value: unknown): string {
	if (typeof value === 'string') {
		return JSON.stringify(value);
	}

	if (typeof value === 'object' && value !== null) {
		return Array.isArray(value) ? 'an array' : 'an object';
	}

	return String(value);
}

/**
 * Validate a `thresholds` block from a configuration file.
 *
 * Returns the first problem found, or `undefined` when the block is usable.
 * Returning rather than throwing keeps this model free of the infrastructure
 * error type, so the caller decides how a rejection surfaces.
 *
 * An unrecognised key is an error rather than something to ignore. A
 * misspelled `maxCritcal` that was silently dropped would leave the user
 * believing they had a gate when they had none.
 *
 * @param value - The raw `thresholds` value as parsed from YAML or JSON
 * @returns The first issue found, or `undefined` if valid
 *
 * @example
 * ```typescript
 * const issue = validateThresholds({maxCritical: -1});
 * // issue.key === 'thresholds.maxCritical'
 * ```
 */
export function validateThresholds(
	value: unknown,
): ThresholdsIssue | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return {
			key: 'thresholds',
			received: value,
			message: `thresholds must be an object, received ${describe(value)}`,
		};
	}

	const block = value as Record<string, unknown>;

	for (const [key, received] of Object.entries(block)) {
		if (!knownKeys.has(key)) {
			return {
				key: `thresholds.${key}`,
				received,
				message: `thresholds.${key} is not a recognised threshold. Expected one of: ${[
					...knownKeys,
				].join(', ')}`,
			};
		}
	}

	for (const key of severityKeys) {
		const limit = block[key];
		if (limit === undefined) {
			continue;
		}

		// `Number.isSafeInteger` rejects NaN, Infinity and fractions in one
		// check, so a limit that survives it is a real count.
		if (
			typeof limit !== 'number' ||
			!Number.isSafeInteger(limit) ||
			limit < 0
		) {
			return {
				key: `thresholds.${key}`,
				received: limit,
				message: `thresholds.${key} must be a whole number of zero or more, received ${describe(
					limit,
				)}`,
			};
		}
	}

	for (const key of booleanKeys) {
		const flag = block[key];
		if (flag === undefined) {
			continue;
		}

		if (typeof flag !== 'boolean') {
			return {
				key: `thresholds.${key}`,
				received: flag,
				message: `thresholds.${key} must be true or false, received ${describe(
					flag,
				)}`,
			};
		}
	}

	return undefined;
}
