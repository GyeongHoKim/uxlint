/**
 * AI Service Configuration Constants
 * Centralized configuration for AI-powered UX analysis
 *
 * @packageDocumentation
 */

/**
 * AI Service Configuration
 * All configurable parameters for AI analysis behavior
 */
export const aiConfig = {
	/**
	 * Maximum number of sequential tool calls allowed per analysis
	 * Workflow: navigate → screenshot → snapshot → analyze → (optional retries)
	 */
	maxToolSteps: 5,

	/**
	 * Temperature for AI model (0-1)
	 * Lower values = more consistent, deterministic responses
	 * Higher values = more creative, varied responses
	 * 0.3 is ideal for UX analysis where consistency is important
	 */
	temperature: 0.3,

	/**
	 * Maximum number of retry attempts on failure
	 */
	maxRetries: 3,

	/**
	 * Initial delay in milliseconds before first retry
	 * Uses exponential backoff: 1s, 2s, 4s
	 */
	initialRetryDelayMs: 1000,
} as const;
