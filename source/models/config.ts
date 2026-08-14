/**
 * Configuration models for UX Lint
 * Defines the structure of configuration files and related types
 *
 * NOTE: AI configuration has been moved to environment variables for security.
 * See source/infrastructure/config/env-io.ts for AI configuration types.
 */

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
};
