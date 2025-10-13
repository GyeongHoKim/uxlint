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
 * TODO: Implement in T022
 */
export function buildSystemPrompt(_personas: string[]): string {
	throw new Error('Not implemented');
}

/**
 * Build analysis prompt combining context
 * TODO: Implement in T023
 */
export function buildAnalysisPrompt(_prompt: AnalysisPrompt): string {
	throw new Error('Not implemented');
}

/**
 * Parse AI response to extract findings
 * TODO: Implement in T024
 */
export function parseAnalysisResponse(
	_response: string,
	_pageUrl: string,
): AnalysisResult {
	throw new Error('Not implemented');
}

/**
 * Extract summary from AI response
 * TODO: Implement in T025
 */
export function extractSummary(_response: string): string {
	throw new Error('Not implemented');
}
