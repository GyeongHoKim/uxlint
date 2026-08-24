/**
 * Configuration models for UX Lint
 * Defines the structure of configuration files and related types
 *
 * NOTE: AI configuration has been moved to environment variables for security.
 * See source/infrastructure/config/env-io.ts for AI configuration types.
 */

import type {BrowserSettings} from './browser.js';
import type {Thresholds} from './thresholds.js';

/**
 * Represents a page configuration with its URL and feature descriptions
 */
export type Page = {
	/**
	 * The URL of the page to analyze
	 */
	url: string;

	/**
	 * Freeform description of key tasks, flows, and components on the page
	 */
	features: string;
};

/**
 * Represents a user persona description
 * A persona is a freeform text describing user goals, motivations, constraints, devices, and accessibility needs
 */
export type Persona = string;

/**
 * Report output configuration
 */
export type ReportConfig = {
	/**
	 * File path where the UX report will be written (e.g., './ux-report.md')
	 */
	output: string;
};

/**
 * Optional per-run analysis settings.
 *
 * Every field is optional; the documented default applies when the block or a
 * field within it is absent.
 */
export type AnalysisConfig = {
	/**
	 * Wall-clock bound for analysing one page, in milliseconds.
	 *
	 * A page that exceeds it is recorded `partial` with the expiry as its
	 * reason and the run continues with the remaining pages. The shipped
	 * default is calibrated from measured healthy page durations (008 SC-004);
	 * the constant below is the provisional value that calibration may replace.
	 */
	pageTimeLimitMs?: number;
};

/**
 * The provisional per-page analysis bound, before baseline calibration.
 *
 * Lives beside its type so the default ships with the setting instead of
 * being re-declared at every read site that would otherwise disagree.
 */
export const defaultPageTimeLimitMs = 600_000;

/**
 * One problem found while validating an `analysis` block.
 */
export type AnalysisConfigIssue = {
	key: string;
	received: unknown;
	message: string;
};

const knownAnalysisKeys = new Set(['pageTimeLimitMs']);

/**
 * Describe a rejected value without dumping an entire object into the message.
 */
function describe(value: unknown): string {
	if (value === null) {
		return 'null';
	}

	if (Array.isArray(value)) {
		return 'an array';
	}

	if (typeof value === 'object') {
		return 'an object';
	}

	if (typeof value === 'string') {
		return `"${value}"`;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	return typeof value;
}

/**
 * Validate an `analysis` block from a configuration file.
 *
 * Returns the first problem found, or `undefined` when the block is usable.
 * An unrecognised key is an error rather than something to ignore: a
 * misspelled `pageTimeLimtMs` that was silently dropped would leave the user
 * believing their stuck pages were bounded when they were not.
 *
 * @param value - The raw `analysis` value as parsed from YAML or JSON
 * @returns The first issue found, or `undefined` if valid
 *
 * @example
 * ```typescript
 * const issue = validateAnalysisConfig({pageTimeLimitMs: -1});
 * // issue.key === 'analysis.pageTimeLimitMs'
 * ```
 */
export function validateAnalysisConfig(
	value: unknown,
): AnalysisConfigIssue | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return {
			key: 'analysis',
			received: value,
			message: `analysis must be an object, received ${describe(value)}`,
		};
	}

	const block = value as Record<string, unknown>;

	for (const [key, received] of Object.entries(block)) {
		if (!knownAnalysisKeys.has(key)) {
			return {
				key: `analysis.${key}`,
				received,
				message: `analysis.${key} is not a recognised analysis setting. Expected one of: ${[
					...knownAnalysisKeys,
				].join(', ')}`,
			};
		}
	}

	const limit = block['pageTimeLimitMs'];
	if (
		limit !== undefined &&
		(typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit <= 0)
	) {
		return {
			key: 'analysis.pageTimeLimitMs',
			received: limit,
			message: `analysis.pageTimeLimitMs must be a positive integer of milliseconds, received ${describe(
				limit,
			)}`,
		};
	}

	return undefined;
}

/**
 * Complete UX Lint configuration
 * This represents the structure of .uxlintrc.yml or .uxlintrc.json files
 *
 * NOTE: AI configuration is no longer part of .uxlintrc files.
 * All AI settings (provider, API keys, models) are configured via environment variables.
 * See .env.example for AI configuration options.
 */
export type UxLintConfig = {
	/**
	 * The primary entry URL of the application
	 */
	mainPageUrl: string;

	/**
	 * Additional pages to analyze
	 */
	subPageUrls: string[];

	/**
	 * Per-page descriptions to guide analysis
	 * Each page URL must match either mainPageUrl or one of the subPageUrls
	 */
	pages: Page[];

	/**
	 * One or more persona descriptions
	 * Each persona describes user goals, motivations, constraints, devices, and accessibility needs
	 */
	persona: Persona;

	/**
	 * Report output configuration
	 */
	report: ReportConfig;

	/**
	 * Optional CI gate thresholds.
	 *
	 * Absent means the gate is off and the run exits exactly as it did before
	 * this field existed, so adding the feature cannot break an existing
	 * pipeline.
	 */
	thresholds?: Thresholds;

	/**
	 * Optional browser settings.
	 *
	 * Absent means the documented defaults apply: search the platform's usual
	 * locations, tolerate untrusted TLS certificates as every earlier release
	 * did, and send nothing derived from the analysed URL to a third party.
	 */
	browser?: BrowserSettings;

	/**
	 * Optional per-run analysis settings.
	 *
	 * Absent means the documented defaults apply: each page is bounded at
	 * `defaultPageTimeLimitMs` of wall clock, so one stuck page cannot stall
	 * the run.
	 */
	analysis?: AnalysisConfig;
};
