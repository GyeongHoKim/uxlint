/**
 * AI Service
 * Business logic for AI-powered UX analysis
 *
 * @packageDocumentation
 */

import type {UxFinding} from './analysis.js';

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
export function buildSystemPrompt(personas: string[]): string {
	const personaSection =
		personas.length > 0
			? `\n\nFocus your analysis on these specific personas:\n${personas
					.map(p => `- ${p}`)
					.join('\n')}`
			: '';

	return `You are an expert UX analyst specialized in web accessibility and usability evaluation.

Your task is to analyze web page accessibility trees and identify UX issues that affect user experience.

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
export function buildAnalysisPrompt(prompt: AnalysisPrompt): string {
	const {snapshot, pageUrl, features, personas} = prompt;

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
