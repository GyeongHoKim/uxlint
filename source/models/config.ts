/**
 * Configuration models for UX Lint
 * Defines the structure of configuration files and related types
 */

/**
 * Supported AI provider types
 */
export type ProviderType = 'anthropic' | 'openai' | 'ollama' | 'xai' | 'google';

/**
 * Anthropic provider configuration
 */
export type AnthropicAiConfig = {
	/**
	 * Provider type
	 */
	provider: 'anthropic';

	/**
	 * AI model name
	 * Defaults to 'claude-sonnet-4-5-20250929' if not specified
	 */
	model?: string;

	/**
	 * Anthropic API key
	 */
	apiKey: string;
};

/**
 * OpenAI provider configuration
 */
export type OpenAiAiConfig = {
	/**
	 * Provider type
	 */
	provider: 'openai';

	/**
	 * AI model name
	 * Defaults to 'gpt-5' if not specified
	 */
	model?: string;

	/**
	 * OpenAI API key
	 */
	apiKey: string;
};

/**
 * Ollama provider configuration
 */
export type OllamaAiConfig = {
	/**
	 * Provider type
	 */
	provider: 'ollama';

	/**
	 * AI model name
	 * Defaults to 'qwen3-vl' if not specified
	 * IMPORTANT: Must support both vision and tool calling
	 */
	model?: string;

	/**
	 * Ollama server base URL
	 * Defaults to 'http://localhost:11434/api' if not specified
	 */
	baseUrl?: string;
};

/**
 * XAI (Grok) provider configuration
 */
export type XaiAiConfig = {
	/**
	 * Provider type
	 */
	provider: 'xai';

	/**
	 * AI model name
	 * Defaults to 'grok-4' if not specified
	 */
	model?: string;

	/**
	 * XAI API key
	 */
	apiKey: string;
};

/**
 * Google (Gemini) provider configuration
 */
export type GoogleAiConfig = {
	/**
	 * Provider type
	 */
	provider: 'google';

	/**
	 * AI model name
	 * Defaults to 'gemini-2.5-pro' if not specified
	 */
	model?: string;

	/**
	 * Google API key
	 */
	apiKey: string;
};

/**
 * AI service configuration (discriminated union)
 */
export type AiConfig =
	| AnthropicAiConfig
	| OpenAiAiConfig
	| OllamaAiConfig
	| XaiAiConfig
	| GoogleAiConfig;

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
	persona: Persona;

	/**
	 * Report output configuration
	 */
	report: ReportConfig;

	/**
	 * AI service configuration (optional)
	 * If not provided, defaults to Anthropic with environment variables or prompts for API key
	 */
	ai?: AiConfig;
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
 * Type guard to check if a value is a valid AI configuration
 */
function isAiConfig(value: unknown): value is AiConfig {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const config = value as Record<string, unknown>;
	if (!('provider' in config) || typeof config['provider'] !== 'string') {
		return false;
	}

	const provider = config['provider'] as ProviderType;
	if (!['anthropic', 'openai', 'ollama', 'xai', 'google'].includes(provider)) {
		return false;
	}

	switch (provider) {
		case 'anthropic':
		case 'openai':
		case 'xai':
		case 'google': {
			return (
				'apiKey' in config &&
				typeof config['apiKey'] === 'string' &&
				(!('model' in config) || typeof config['model'] === 'string') &&
				!('baseUrl' in config)
			);
		}

		case 'ollama': {
			return (
				!('apiKey' in config) &&
				(!('model' in config) || typeof config['model'] === 'string') &&
				(!('baseUrl' in config) || typeof config['baseUrl'] === 'string')
			);
		}
	}
}

/**
 * Type guard to check if a value is a valid UxLintConfig
 */
export function isUxLintConfig(value: unknown): value is UxLintConfig {
	if (
		typeof value !== 'object' ||
		value === null ||
		!('mainPageUrl' in value) ||
		typeof value.mainPageUrl !== 'string' ||
		!('subPageUrls' in value) ||
		!isStringArray(value.subPageUrls) ||
		!('pages' in value) ||
		!isPageArray(value.pages) ||
		!('persona' in value) ||
		typeof value.persona !== 'string' ||
		value.persona.length === 0 ||
		!('report' in value) ||
		!isReportConfig(value.report)
	) {
		return false;
	}

	const config = value as Record<string, unknown>;
	if ('ai' in config && config['ai'] !== undefined) {
		return isAiConfig(config['ai']);
	}

	return true;
}
