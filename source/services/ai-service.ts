/**
 * AI Service
 * Business logic for AI-powered UX analysis with structured output
 *
 * @packageDocumentation
 */

import {streamText, type experimental_MCPClient, Output} from 'ai';
import {z} from 'zod';
import type {UxFinding} from '../models/analysis.js';
import {loadEnvConfig} from '../infrastructure/config/env-config.js';
import {aiConfig} from './ai-service-config.js';
import {createAiProvider} from './ai-provider-factory.js';

/**
 * Type for MCP tools returned from experimental_MCPClient.tools()
 * Uses 'ai' package export for full type compatibility with streamText
 */
type McpTools = Awaited<ReturnType<experimental_MCPClient['tools']>>;

/**
 * Extended StreamText parameters to include experimental features
 * maxSteps and experimental_output available in runtime but not in type definitions yet
 */
type StreamTextWithExperimentalFeatures = {
	maxSteps?: number;
	experimental_output?: ReturnType<typeof Output.object>;
};

/**
 * Extended StreamTextResult to include experimental features
 * These properties are available at runtime but not in type definitions yet
 */
type StreamTextResultWithExperimental<T> = {
	experimental_partialOutputStream: AsyncIterable<T>;
	experimental_output: Promise<T>;
};

/**
 * Zod schema for UX finding
 * Used with experimental_output for structured generation
 */
const uxFindingSchema = z.object({
	severity: z.enum(['critical', 'high', 'medium', 'low']),
	category: z.string(),
	description: z.string(),
	personaRelevance: z.array(z.string()),
	recommendation: z.string(),
});

/**
 * Zod schema for complete analysis result
 * Used with experimental_output for structured generation
 */
const analysisResultSchema = z.object({
	summary: z.string(),
	findings: z.array(uxFindingSchema),
});

/**
 * Analysis prompt input
 */
export type AnalysisPrompt = {
	snapshot?: string; // Optional: LLM can capture via tools when MCP client is available
	pageUrl: string;
	features: string;
	personas: string[];
};

/**
 * Analysis result from AI
 */
export type AnalysisResult = {
	findings: UxFinding[];
	summary: string;
};

/**
 * Build system prompt for AI model
 * Formats persona context into analysis guidelines with comprehensive UX checklist
 */
export function buildSystemPrompt(
	personas: string[],
	hasTools: boolean,
): string {
	const personaSection =
		personas.length > 0
			? `\n\nFocus your analysis on these specific personas:\n${personas
					.map(p => `- ${p}`)
					.join('\n')}`
			: '';

	const toolSection = hasTools
		? `\n\nYou have access to comprehensive browser automation tools via Playwright MCP.

## Required Analysis Workflow

1. **Set Desktop Viewport**: Call browser_resize to set desktop resolution (1920x1080 or 1440x900)
2. **Navigate**: Call browser_navigate with the provided page URL
3. **Capture Visual**: Call browser_take_screenshot (REQUIRED for visual UX analysis)
4. **Get Structure**: Call browser_snapshot to get accessibility tree
5. **Interact & Test** (if needed): Use interaction tools to test UI elements
6. **Analyze**: Provide comprehensive UX findings

## Complete Toolset Available

**Navigation & Page Control:**
- browser_navigate: Navigate to URL
- browser_navigate_back: Go back in history
- browser_resize: Set viewport size (USE THIS for desktop testing - 1920x1080 or 1440x900)
- browser_tabs: Manage multiple tabs (if page has tabs/links that open new windows)
- browser_close: Close browser
- browser_wait_for: Wait for elements/conditions

**Visual Inspection:**
- browser_take_screenshot: Capture visual design (REQUIRED - call this BEFORE analyzing)
- browser_snapshot: Get accessibility tree structure

**Element Interaction:**
- browser_click: Click buttons, links, tabs, UI elements
- browser_hover: Hover over elements (test hover states)
- browser_drag: Drag and drop operations
- browser_type: Type text into inputs
- browser_press_key: Press keyboard keys (test keyboard navigation)
- browser_fill_form: Fill multiple form fields
- browser_select_option: Select from dropdowns

**Advanced Testing:**
- browser_evaluate: Execute JavaScript for custom checks
- browser_file_upload: Upload files to test file inputs
- browser_handle_dialog: Handle alerts/confirms/prompts
- browser_console_messages: Check for JavaScript errors
- browser_network_requests: Inspect network activity

**CRITICAL REQUIREMENTS:**
1. ALWAYS call browser_resize FIRST to set desktop viewport
2. ALWAYS take screenshot for visual analysis
3. USE browser_click for interactive elements (tabs, buttons, etc.)
4. TEST hover states with browser_hover
5. CHECK keyboard navigation with browser_press_key
6. For multi-tab interfaces, use browser_tabs to switch between them`
		: '';

	return `You are an expert UX analyst specialized in web accessibility and usability evaluation.

Your task is to analyze web pages and identify UX issues that affect user experience.
${toolSection}

## UX Analysis Framework

Evaluate pages across these dimensions:

1. **Accessibility**
   - Screen reader compatibility (proper ARIA labels, semantic HTML)
   - Keyboard navigation support (focus indicators, tab order)
   - Color contrast ratios (WCAG AA/AAA compliance)
   - Alt text for images and icons
   - Form labels and error messages

2. **Usability**
   - Clear visual hierarchy and information architecture
   - Intuitive navigation and wayfinding
   - Consistent UI patterns and terminology
   - Appropriate touch target sizes (minimum 44x44px)
   - Error prevention and recovery

3. **Performance**
   - Page load indicators and perceived performance
   - Image optimization and lazy loading
   - Unnecessary animations or heavy resources

4. **Visual Design**
   - Visual consistency and brand alignment
   - Appropriate use of whitespace
   - Readable typography (font size, line height, line length)
   - Clear call-to-action buttons

5. **Content**
   - Clear, scannable content structure
   - Appropriate heading hierarchy
   - Concise, action-oriented microcopy
   - Helpful empty states and placeholder text

6. **Mobile Responsiveness**
   - Touch-friendly interface elements
   - Readable text without zooming
   - Proper viewport configuration
   - Mobile-optimized interactions
${personaSection}

## Analysis Guidelines

- **Always provide at least 2-3 findings** even for well-designed pages
- Look for opportunities for improvement, not just critical issues
- Consider edge cases and error states
- Prioritize findings by impact on user experience
- Be specific and actionable in your recommendations
- Consider the provided personas and their specific needs

## Output Requirements

Your response will be automatically structured with the following fields:
- summary: Overall assessment of UX quality
- findings: Array of UX issues with severity, category, description, affected personas, and recommendations

Focus on providing valuable, actionable insights that will help improve the user experience.`;
}

/**
 * Build analysis prompt combining context
 * Combines snapshot, features, and personas into structured prompt with specific evaluation criteria
 */
export function buildAnalysisPrompt(
	prompt: AnalysisPrompt,
	hasTools: boolean,
): string {
	const {snapshot, pageUrl, features, personas} = prompt;

	if (hasTools) {
		// When tools are available, LLM can navigate and capture page itself
		return `# Page Analysis Request

**Page URL**: ${pageUrl}

**Features to Evaluate**: ${features}

**Target Personas**:
${personas.map(p => `- ${p}`).join('\n')}

## Required Analysis Steps (Execute in Order)

**Step 1: Set Desktop Viewport**
- Use browser_resize to set viewport to 1920x1080 or 1440x900
- This ensures proper desktop UX evaluation

**Step 2: Navigate & Capture**
- Navigate to the page URL using browser_navigate
- Take a screenshot using browser_take_screenshot
- Get accessibility tree using browser_snapshot

**Step 3: Test Interactive Elements**
- If the features mention **tabs, navigation, or interactive UI**:
  * USE browser_click to click on each tab/button
  * Capture screenshots of different states
  * Test hover effects with browser_hover
- If forms are mentioned:
  * Test input fields with browser_type or browser_fill_form
  * Check validation and error states
- If dropdowns/selects exist:
  * Test with browser_select_option
- Test keyboard navigation:
  * Use browser_press_key to test Tab key navigation
  * Verify focus indicators are visible

**Step 4: Check Console & Network**
- Use browser_console_messages to check for JavaScript errors
- Use browser_network_requests to identify slow resources

**Step 5: Conduct Thorough Analysis**
Examine for:
- **Accessibility**: ARIA labels, semantic HTML, keyboard nav, color contrast, alt text
- **Usability**: Navigation clarity, visual hierarchy, consistency, touch targets (44x44px min)
- **Performance**: Load indicators, image optimization, unnecessary animations
- **Visual Design**: Typography, spacing, alignment, whitespace, clear CTAs
- **Content**: Scannable structure, heading hierarchy, microcopy quality
- **Mobile Responsiveness**: Touch-friendly elements, readable text, proper viewport
- **Interactive States**: Hover, focus, active, disabled states
- **Error Handling**: Validation messages, error recovery, empty states
- **Persona-specific concerns**: Based on the target users

## Critical Instructions

1. ⚠️ **ALWAYS resize viewport first** - Desktop sites need proper resolution
2. ⚠️ **CLICK interactive elements** - Tabs, buttons, links mentioned in features
3. ⚠️ **TEST keyboard navigation** - Press Tab key and verify focus indicators
4. ⚠️ **CAPTURE multiple states** - Different tabs, hover states, form states
5. ⚠️ **CHECK console for errors** - JavaScript errors affect UX

**IMPORTANT**: Even if the page is well-designed, identify at least 2-3 opportunities for improvement. Consider edge cases, error states, keyboard-only users, and screen reader compatibility.

Provide your findings in the structured JSON format with clear, actionable recommendations.`;
	}

	// Legacy mode: snapshot provided in prompt
	if (!snapshot) {
		throw new Error(
			'Snapshot is required when MCP tools are not available. Please provide a snapshot or enable MCP client.',
		);
	}

	return `# Page Analysis Request

**Page URL**: ${pageUrl}

**Features to Evaluate**: ${features}

**Target Personas**:
${personas.map(p => `- ${p}`).join('\n')}

**Accessibility Tree Snapshot**:
\`\`\`json
${snapshot}
\`\`\`

## Analysis Task

Conduct a thorough UX analysis of this page based on the accessibility tree and feature description.

## Evaluation Checklist

Examine the page for:
- Accessibility issues (ARIA, semantic HTML, form labels, alt text)
- Usability problems (navigation structure, information architecture)
- Content quality (heading hierarchy, descriptive text)
- Persona-specific concerns based on the target users

**IMPORTANT**: Even if the structure appears sound, identify at least 2-3 opportunities for improvement or potential enhancements. Consider edge cases, missing ARIA attributes, and advanced accessibility features.

Provide your findings in the structured format with clear, actionable recommendations.`;
}

/**
 * Retry a function with exponential backoff
 * Retries up to maxRetries times with increasing delay
 */
export async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxRetries = aiConfig.maxRetries,
	initialDelay = aiConfig.initialRetryDelayMs,
): Promise<T> {
	let lastError: Error | undefined;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			// Sequential retry logic requires await in loop
			// Each attempt must complete before deciding whether to retry
			// eslint-disable-next-line no-await-in-loop -- Required for sequential retry with exponential backoff
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Don't retry on last attempt
			if (attempt === maxRetries - 1) {
				break;
			}

			// Calculate delay with exponential backoff: 1s, 2s, 4s
			const delay = initialDelay * 2 ** attempt;
			// Sequential backoff delay must complete before next retry attempt
			// eslint-disable-next-line no-await-in-loop -- Required for exponential backoff between retries
			await new Promise(resolve => {
				setTimeout(resolve, delay);
			});
		}
	}

	throw lastError ?? new Error('Retry failed with unknown error');
}

/**
 * Estimate token count from text
 * Uses rough approximation: 1 token ≈ 4 characters
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
function estimateTokenCount(text: string): number {
	return Math.ceil(text.length / aiConfig.contextWindow.charsPerToken);
}

/**
 * Check if prompt size is within context window limits
 * Warns if approaching limits to prevent failures
 *
 * @param systemPrompt - System prompt text
 * @param userPrompt - User prompt text
 */
function validateContextWindow(systemPrompt: string, userPrompt: string): void {
	const systemTokens = estimateTokenCount(systemPrompt);
	const userTokens = estimateTokenCount(userPrompt);
	const totalTokens = systemTokens + userTokens;

	const {maxInputTokens, warningThreshold} = aiConfig.contextWindow;

	if (totalTokens > maxInputTokens) {
		throw new Error(
			`Prompt exceeds context window: ${totalTokens} tokens (max: ${maxInputTokens}). ` +
				'Consider reducing accessibility tree size or page complexity.',
		);
	}

	if (totalTokens > warningThreshold) {
		console.warn(
			`[AI] Large prompt detected: ${totalTokens} tokens (${Math.round(
				(totalTokens / maxInputTokens) * 100,
			)}% of context window). This may impact performance and cost.`,
		);
	}
}

/**
 * Analyze page with AI using Vercel AI SDK with structured output
 * Uses streamText with JSON mode + Zod validation to support tool calling
 *
 * @param prompt - Analysis prompt with page context
 * @param onChunk - Optional callback for streaming response chunks
 * @param mcpClient - Optional MCP client for tool calling (AI SDK integration)
 */
export async function analyzePageWithAi(
	prompt: AnalysisPrompt,
	onChunk?: (chunk: string) => void,
	mcpClient?: experimental_MCPClient,
): Promise<AnalysisResult> {
	const config = loadEnvConfig();

	// Get tools from MCP client (AI SDK automatically converts them)
	let tools: McpTools | undefined;
	if (mcpClient) {
		try {
			tools = await mcpClient.tools();
		} catch (error) {
			// MCP client provided but tools unavailable - this is a critical error
			// Without tools, LLM cannot navigate or capture screenshots
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';
			throw new Error(
				`MCP client provided but tools unavailable: ${errorMessage}. Analysis requires browser automation tools for screenshot capture and navigation.`,
			);
		}
	}

	const hasTools = tools !== undefined && Object.keys(tools).length > 0;

	// Build prompts
	const systemPrompt = buildSystemPrompt(prompt.personas, hasTools);
	const userPrompt = buildAnalysisPrompt(prompt, hasTools);

	// Validate context window size
	validateContextWindow(systemPrompt, userPrompt);

	// Create AI provider using factory (supports multiple providers)
	const provider = createAiProvider(config);

	// Call AI with retry logic
	return retryWithBackoff(async () => {
		// Setup timeout with AbortController
		const abortController = new AbortController();
		const timeout = setTimeout(() => {
			abortController.abort();
		}, aiConfig.aiCallTimeoutMs);

		try {
			// StreamText with experimental features:
			// - maxSteps: Enables multi-turn tool calling (required for MCP tools)
			// - experimental_output: Enforces structured output with Zod schema
			// Per AI SDK docs: use streamText + experimental_output for tool calling + structured output
			const experimentalParameters: StreamTextWithExperimentalFeatures = {
				maxSteps: aiConfig.maxToolSteps,
				experimental_output: Output.object({
					schema: analysisResultSchema,
				}),
			};

			const result = streamText({
				model: provider.getModel(),
				system: systemPrompt,
				prompt: userPrompt,
				temperature: aiConfig.temperature,
				tools: tools ?? undefined,
				abortSignal: abortController.signal,
				...experimentalParameters,
			});

			// Stream partial results for progress feedback
			// Type assertion needed for experimental features not yet in official AI SDK types
			type AnalysisOutput = z.infer<typeof analysisResultSchema>;
			const experimentalResult =
				result as unknown as StreamTextResultWithExperimental<AnalysisOutput>;

			let lastSummary = '';
			for await (const chunk of experimentalResult.experimental_partialOutputStream) {
				if (chunk.summary && chunk.summary !== lastSummary) {
					onChunk?.(chunk.summary);
					lastSummary = chunk.summary;
				}
			}

			// Get final structured output
			const output = await experimentalResult.experimental_output;

			// Transform to AnalysisResult format
			// Add pageUrl to each finding (required by UxFinding type)
			const findings: UxFinding[] = (output.findings ?? []).map(
				(finding: z.infer<typeof uxFindingSchema>) => ({
					...finding,
					pageUrl: prompt.pageUrl,
				}),
			);

			return {
				findings,
				summary: output.summary ?? 'Analysis completed.',
			};
		} finally {
			// Clean up timeout
			clearTimeout(timeout);
		}
	});
}
