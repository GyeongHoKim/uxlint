/**
 * AI Service
 * Business logic for AI-powered UX analysis
 *
 * @packageDocumentation
 */

import {createAnthropic} from '@ai-sdk/anthropic';
import {streamText, type experimental_MCPClient} from 'ai';
import type {UxFinding} from '../models/analysis.js';
import {loadEnvConfig} from '../infrastructure/config/env-config.js';
import {aiConfig} from './ai-service-config.js';

/**
 * Type for MCP tools returned from experimental_MCPClient.tools()
 * Uses 'ai' package export for full type compatibility with streamText
 */
type McpTools = Awaited<ReturnType<experimental_MCPClient['tools']>>;

/**
 * Extended StreamText parameters to include experimental maxSteps
 * maxSteps is available in runtime but not yet in type definitions (AI SDK v5.0.68)
 */
type StreamTextWithMaxSteps = {
	maxSteps?: number;
};

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
 * Formats persona context into analysis guidelines
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
		? `\n\nYou have access to browser automation tools. Follow these steps:

1. First, call browser_navigate with the provided page URL
2. Then, call browser_take_screenshot to capture the visual design
3. Call browser_snapshot to get the accessibility tree
4. Analyze the results and provide your findings

Available tools:
- browser_navigate: Navigate to a URL
- browser_take_screenshot: Capture visual screenshot (REQUIRED for visual UX analysis)
- browser_snapshot: Get accessibility tree snapshot
- browser_click, browser_fill_form, browser_evaluate: For interaction if needed

IMPORTANT: You MUST take a screenshot to see the actual visual design. Text-only accessibility trees are not sufficient for complete UX analysis.`
		: '';

	return `You are an expert UX analyst specialized in web accessibility and usability evaluation.

Your task is to analyze web pages and identify UX issues that affect user experience.
${toolSection}

For each finding, provide:
- **Severity**: critical | high | medium | low
- **Category**: The type of issue (e.g., Accessibility, Usability, Performance, Security)
- **Description**: Clear description of the issue
- **Personas Affected**: Which personas are impacted (comma-separated)
- **Recommendation**: Actionable steps to fix the issue
${personaSection}

Format your response as markdown with ## Finding N headings for each issue.
Start with a ## Summary section describing the overall UX quality.`;
}

/**
 * Build analysis prompt combining context
 * Combines snapshot, features, and personas into structured prompt
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

Please analyze this page:
1. Navigate to the page URL
2. Take a screenshot to see the visual design
3. Get the accessibility tree snapshot
4. Analyze the page for UX issues considering the features and personas
5. Provide your findings in the specified format`;
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

Please analyze this page and identify any UX issues or recommendations.`;
}

/**
 * Parse AI response to extract findings
 * Uses regex to extract structured finding data from markdown
 */
export function parseAnalysisResponse(
	response: string,
	pageUrl: string,
): AnalysisResult {
	const findings: UxFinding[] = [];

	// Extract findings using regex
	const findingPattern =
		/## Finding \d+\s+\*\*Severity\*\*:\s*(\w+)\s+\*\*Category\*\*:\s*([^\n]+)\s+\*\*Description\*\*:\s*([^\n]+)\s+\*\*Personas Affected\*\*:\s*([^\n]*)\s+\*\*Recommendation\*\*:\s*([^\n]+)/g;

	let match;
	while ((match = findingPattern.exec(response)) !== null) {
		const [, severity, category, description, personasText, recommendation] =
			match;

		// Parse severity
		const validSeverity = severity?.toLowerCase() as
			| UxFinding['severity']
			| undefined;
		if (
			!validSeverity ||
			!['critical', 'high', 'medium', 'low'].includes(validSeverity)
		) {
			continue;
		}

		// Parse personas (comma-separated)
		const personaRelevance = personasText
			? personasText
					.split(',')
					.map(p => p.trim())
					.filter(p => p.length > 0)
			: [];

		findings.push({
			severity: validSeverity,
			category: category?.trim() ?? '',
			description: description?.trim() ?? '',
			personaRelevance,
			recommendation: recommendation?.trim() ?? '',
			pageUrl,
		});
	}

	const summary = extractSummary(response);

	return {
		findings,
		summary,
	};
}

/**
 * Extract summary from AI response
 * Finds and returns the Summary section content
 */
export function extractSummary(response: string): string {
	const summaryPattern = /## Summary\s+([^#]+)/;
	const match = summaryPattern.exec(response);

	if (match?.[1]) {
		return match[1].trim();
	}

	return 'Analysis completed. Review findings for details.';
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
 * Analyze page with AI using Vercel AI SDK
 * Streams response from Claude and parses findings
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

	// Create anthropic provider with custom API key
	const anthropic = createAnthropic({
		apiKey: config.apiKey,
	});

	// Call AI with retry logic
	return retryWithBackoff(async () => {
		const chunks: string[] = [];

		// Setup timeout with AbortController
		const abortController = new AbortController();
		const timeout = setTimeout(() => {
			abortController.abort();
		}, aiConfig.aiCallTimeoutMs);

		try {
			// StreamText with experimental maxSteps parameter
			// MaxSteps enables multi-turn tool calling (required for MCP tools)
			// Type definitions don't include maxSteps yet (AI SDK v5.0.68), but it's available at runtime
			const experimentalParameters: StreamTextWithMaxSteps = {
				maxSteps: aiConfig.maxToolSteps,
			};

			const result = streamText({
				model: anthropic(config.model),
				system: systemPrompt,
				prompt: userPrompt,
				temperature: aiConfig.temperature,
				tools: tools ?? undefined,
				abortSignal: abortController.signal,
				...experimentalParameters,
			});

			// Stream response chunks
			for await (const chunk of result.textStream) {
				chunks.push(chunk);
				onChunk?.(chunk);
			}

			// Parse complete response
			const fullResponse = chunks.join('');
			return parseAnalysisResponse(fullResponse, prompt.pageUrl);
		} finally {
			// Clean up timeout
			clearTimeout(timeout);
		}
	});
}
