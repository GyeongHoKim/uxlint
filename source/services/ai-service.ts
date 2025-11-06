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

/**
 * Analysis prompt input
 */
export type AnalysisPrompt = {
	snapshot: string;
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
	maxRetries = 3,
	initialDelay = 1000,
): Promise<T> {
	let lastError: Error | undefined;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			// eslint-disable-next-line no-await-in-loop
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Don't retry on last attempt
			if (attempt === maxRetries - 1) {
				break;
			}

			// Calculate delay with exponential backoff: 1s, 2s, 4s
			const delay = initialDelay * 2 ** attempt;
			// eslint-disable-next-line no-await-in-loop
			await new Promise(resolve => {
				setTimeout(resolve, delay);
			});
		}
	}

	throw lastError ?? new Error('Retry failed with unknown error');
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
	let tools: Record<string, any> | undefined;
	if (mcpClient) {
		try {
			tools = await mcpClient.tools();
		} catch (error) {
			console.warn(
				'Failed to fetch MCP tools, continuing without tools:',
				error,
			);
		}
	}

	const hasTools = tools !== undefined && Object.keys(tools).length > 0;

	// Build prompts
	const systemPrompt = buildSystemPrompt(prompt.personas, hasTools);
	const userPrompt = buildAnalysisPrompt(prompt, hasTools);

	// Create anthropic provider with custom API key
	const anthropic = createAnthropic({
		apiKey: config.apiKey,
	});

	// Call AI with retry logic
	return retryWithBackoff(async () => {
		const chunks: string[] = [];

		// eslint-disable-next-line @typescript-eslint/await-thenable
		const result = await streamText({
			model: anthropic(config.model),
			system: systemPrompt,
			prompt: userPrompt,
			temperature: 0.3,
			tools: tools ?? undefined,
			// @ts-expect-error - maxSteps exists in AI SDK but type definitions may not be up to date
			maxSteps: 5, // Allow up to 5 sequential tool calls
			onStepFinish(event) {
				// Log tool calls for debugging
				if (event.toolCalls && event.toolCalls.length > 0) {
					console.log(
						'[AI] Tool calls:',
						event.toolCalls.map(tc => tc.toolName),
					);
				}

				if (event.toolResults && event.toolResults.length > 0) {
					console.log('[AI] Tool results:', event.toolResults.length);
				}
			},
		});

		// Stream response chunks
		for await (const chunk of result.textStream) {
			chunks.push(chunk);
			onChunk?.(chunk);
		}

		// Parse complete response
		const fullResponse = chunks.join('');
		return parseAnalysisResponse(fullResponse, prompt.pageUrl);
	});
}
