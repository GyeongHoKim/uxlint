/**
 * Configuration models for UX Lint
 * Defines the structure of configuration files and related types
 */

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
	personas: Persona[];

	/**
	 * Report output configuration
	 */
	report: ReportConfig;
};

/**
 * Type guard to check if a value is a valid Page
 */
export function isPage(value: unknown): value is Page {
	return (
		typeof value === 'object' &&
		value !== null &&
		'url' in value &&
		typeof value.url === 'string' &&
		'features' in value &&
		typeof value.features === 'string'
	);
}

/**
 * Type guard to check if a value is a valid ReportConfig
 */
export function isReportConfig(value: unknown): value is ReportConfig {
	return (
		typeof value === 'object' &&
		value !== null &&
		'output' in value &&
		typeof value.output === 'string'
	);
}

/**
 * Type guard to check if a value is a valid array of strings
 */
function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * Type guard to check if a value is a valid array of Pages
 */
function isPageArray(value: unknown): value is Page[] {
	return Array.isArray(value) && value.every(item => isPage(item));
}

/**
 * Type guard to check if a value is a valid UxLintConfig
 */
export function isUxLintConfig(value: unknown): value is UxLintConfig {
	return (
		typeof value === 'object' &&
		value !== null &&
		'mainPageUrl' in value &&
		typeof value.mainPageUrl === 'string' &&
		'subPageUrls' in value &&
		isStringArray(value.subPageUrls) &&
		'pages' in value &&
		isPageArray(value.pages) &&
		'personas' in value &&
		isStringArray(value.personas) &&
		'report' in value &&
		isReportConfig(value.report)
	);
}
