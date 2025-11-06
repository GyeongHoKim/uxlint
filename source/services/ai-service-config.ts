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
	 * Value of 5 supports the typical workflow:
	 * 1. browser_navigate - Navigate to the page
	 * 2. browser_take_screenshot - Capture visual screenshot
	 * 3. browser_snapshot - Get accessibility tree
	 * 4. Analysis - LLM analyzes the data
	 * 5. Optional retry if needed
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

	/**
	 * Timeout for AI calls in milliseconds (2 minutes)
	 * Prevents indefinite hangs during LLM API calls
	 */
	aiCallTimeoutMs: 120_000,

	/**
	 * Context window limits for Claude models
	 * Claude 3.5 Sonnet: 200k tokens input, 8k tokens output
	 */
	contextWindow: {
		/** Maximum input tokens (conservative estimate) */
		maxInputTokens: 180_000,
		/** Warning threshold (80% of max) */
		warningThreshold: 144_000,
		/** Average characters per token (rough estimate) */
		charsPerToken: 4,
	},
} as const;
