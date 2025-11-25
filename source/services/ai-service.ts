import {createAnthropic} from '@ai-sdk/anthropic';
import {createGoogleGenerativeAI} from '@ai-sdk/google';
import {type experimental_MCPClient as McpClient} from '@ai-sdk/mcp';
import {createOpenAI} from '@ai-sdk/openai';
import {createXai} from '@ai-sdk/xai';
import {
	tool,
	streamText,
	type LanguageModel,
	type ModelMessage,
	type Tool,
	zodSchema,
} from 'ai';
import {createOllama} from 'ollama-ai-provider-v2';
import {z} from 'zod';
import type {ReportBuilder} from './report-builder.js';
import type {
	FindingSeverity,
	PageAnalysis,
	UxFinding,
	UxReport,
} from '@/models/analysis.js';
import type {Page} from '@/models/config.js';
import type {EnvConfig} from '@/infrastructure/config/env-config.js';

const MAX_AGENT_STEPS = 8;

type ManualToolSet = Record<string, Tool<any, never>>;

type ExecutorTools = Awaited<ReturnType<McpClient['tools']>>;

type ToolCache = {
	readonly manualTools: ManualToolSet;
	readonly executorTools: ExecutorTools;
};

type AgentTrace = {
	latestSnapshot?: string;
};

type ToolCall = {
	toolName: string;
	toolCallId: string;
	input: unknown;
};

export class AIService {
	private readonly model: LanguageModel;
	private readonly personas: string[];
	private readonly reportBuilder: ReportBuilder;
	private readonly mcpClient?: McpClient;
	private toolCache?: ToolCache;

	constructor(options: {
		model: LanguageModel;
		personas: string[];
		reportBuilder: ReportBuilder;
		mcpClient?: McpClient;
	}) {
		this.model = options.model;
		this.personas = options.personas;
		this.reportBuilder = options.reportBuilder;
		this.mcpClient = options.mcpClient;
	}

	async analyzePage(page: Page): Promise<PageAnalysis> {
		const hasBrowserTools = Boolean(this.mcpClient);
		const prompt = buildAnalysisPrompt(
			{
				pageUrl: page.url,
				features: page.features,
				personas: this.personas,
			},
			hasBrowserTools,
		);
		const systemPrompt = buildSystemPrompt(this.personas, hasBrowserTools);
		const messages: ModelMessage[] = [
			{
				role: 'system',
				content: systemPrompt,
			},
			{
				role: 'user',
				content: prompt,
			},
		];

		const trace: AgentTrace = {};
		const assistantReply = await this.runAgentLoop(messages, trace);
		const parsed = parseAnalysisResponse(assistantReply, page.url);

		return {
			pageUrl: page.url,
			features: page.features,
			snapshot: trace.latestSnapshot ?? '',
			findings: parsed.findings,
			analysisTimestamp: Date.now(),
			status: 'complete',
		};
	}

	generateReport(analyses: PageAnalysis[]): UxReport {
		return this.reportBuilder.generateReport(analyses, this.personas);
	}

	private async runAgentLoop(
		messages: ModelMessage[],
		trace: AgentTrace,
	): Promise<string> {
		if (!this.mcpClient) {
			const result = streamText({model: this.model, messages});
			await result.consumeStream();
			const response = await result.response;
			return extractAssistantReply(response.messages);
		}

		const tools = await this.ensureToolCache();
		let iterations = 0;

		/* eslint-disable no-await-in-loop */
		while (iterations < MAX_AGENT_STEPS) {
			iterations += 1;
			const result = streamText({
				model: this.model,
				messages,
				tools: tools.manualTools,
			});
			await result.consumeStream();
			const response = await result.response;
			const finishReason = await result.finishReason;
			const responseMessages = response.messages;
			messages.push(...responseMessages);

			if (finishReason === 'tool-calls') {
				const toolCalls = await result.toolCalls;
				for (const call of toolCalls) {
					const executionOutput = await this.executeToolCall(
						{
							toolName: call.toolName,
							toolCallId: call.toolCallId,
							input: call.input,
						},
						tools.executorTools,
						messages,
					);

					this.updateSnapshotIfNeeded(call, executionOutput, trace);

					messages.push({
						role: 'tool',
						content: [
							{
								type: 'tool-result',
								toolCallId: call.toolCallId,
								toolName: call.toolName,
								output: {
									type: 'text',
									value: formatToolMessage(call.toolName, executionOutput),
								},
							},
						],
					});
				}

				continue;
			}

			return extractAssistantReply(responseMessages);
		}
		/* eslint-enable no-await-in-loop */

		throw new Error('Agent loop exceeded maximum iterations');
	}

	private async executeToolCall(
		call: ToolCall,
		executorTools: ExecutorTools,
		messages: ModelMessage[],
	): Promise<unknown> {
		const executor = executorTools[call.toolName];
		if (!executor || typeof executor.execute !== 'function') {
			return {
				content: [
					{
						type: 'text',
						text: `Tool ${call.toolName} is not available.`,
					},
				],
				isError: true,
			};
		}

		try {
			return await executor.execute(call.input, {
				toolCallId: call.toolCallId,
				messages,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				content: [
					{
						type: 'text',
						text: `Tool execution failed: ${message}`,
					},
				],
				isError: true,
			};
		}
	}

	private updateSnapshotIfNeeded(
		call: ToolCall,
		executionOutput: unknown,
		trace: AgentTrace,
	): void {
		if (call.toolName !== 'browser_snapshot') {
			return;
		}

		const snapshotText = extractToolText(executionOutput);
		if (snapshotText) {
			trace.latestSnapshot = snapshotText;
		}
	}

	private async ensureToolCache(): Promise<ToolCache> {
		if (!this.mcpClient) {
			throw new Error('MCP client is not configured');
		}

		if (this.toolCache) {
			return this.toolCache;
		}

		const executorTools = await this.mcpClient.tools();
		const manualTools: ManualToolSet = {};

		for (const name of Object.keys(executorTools)) {
			const manualTool = buildManualTool(name);
			if (manualTool) {
				manualTools[name] = manualTool;
			}
		}

		this.toolCache = {
			manualTools,
			executorTools,
		};

		return this.toolCache;
	}
}

type AnalysisPromptInput = {
	snapshot?: string;
	pageUrl: string;
	features: string;
	personas: string[];
};

export function buildSystemPrompt(
	personas: string[],
	hasTools: boolean,
): string {
	const personaSection =
		personas.length === 0
			? 'Analyze from the perspective of diverse personas, including accessibility needs.'
			: personas
					.map((persona, index) => `Persona ${index + 1}: ${persona}`)
					.join('\n');

	const toolInstructions = hasTools
		? `You have Model Context Protocol Playwright tools available:
- browser_navigate: open the target page URL.
- browser_take_screenshot: capture a visual snapshot (REQUIRED).
- browser_snapshot: capture the accessibility tree (REQUIRED).
Always capture at least one screenshot and accessibility snapshot before finalizing findings.`
		: 'You will receive a pre-collected accessibility tree snapshot.';

	return [
		'You are an AI UX research partner focused on accessibility, usability, performance, and trust.',
		personaSection,
		toolInstructions,
		'For every page, produce structured findings that include severity, category, description, personas affected, and an actionable recommendation.',
		'Use WCAG and UX heuristics terminology. Prefer concise, high-signal language.',
	].join('\n\n');
}

export function buildAnalysisPrompt(
	input: AnalysisPromptInput,
	hasTools: boolean,
): string {
	if (!hasTools && !input.snapshot) {
		throw new Error('Snapshot is required when MCP tools are not available');
	}

	const baseSections = [
		`Page URL: ${input.pageUrl}`,
		`Key Features: ${input.features}`,
		`Personas of interest: ${input.personas.join(', ')}`,
	];

	if (hasTools) {
		baseSections.push(
			'Instructions:',
			'1. Navigate to the page URL.',
			'2. Take at least one screenshot for visual context.',
			'3. Capture an accessibility tree snapshot.',
			'4. Analyze the experience for the provided personas.',
			'5. Return a markdown summary plus detailed findings.',
		);

		return baseSections.join('\n\n');
	}

	return [
		...baseSections,
		'Accessibility Tree Snapshot:',
		'```json',
		input.snapshot ?? '',
		'```',
		'Use the snapshot and feature notes to infer UX issues.',
	].join('\n');
}

export function extractSummary(response: string): string {
	const summaryRegex = /##\s*summary([\s\S]*?)(?=^##\s|$)/im;
	const summaryMatch = summaryRegex.exec(response);
	if (summaryMatch) {
		const summaryText = summaryMatch[1]?.trim();
		if (summaryText && summaryText.length > 0) {
			return summaryText;
		}
	}

	return 'Summary not provided. Prioritize the listed findings.';
}

export function parseAnalysisResponse(
	response: string,
	pageUrl: string,
): {findings: UxFinding[]; summary: string} {
	const findings: UxFinding[] = [];
	const findingRegex = /##\s*finding\s+\d+([\s\S]*?)(?=^##\s|$)/gim;

	for (;;) {
		const matchResult = findingRegex.exec(response);
		if (!matchResult) {
			break;
		}

		const section = matchResult[1] ?? '';
		const severityValue = matchField(section, 'Severity');
		const categoryValue = matchField(section, 'Category');
		const descriptionValue = matchField(section, 'Description');
		const personasValue = matchField(section, 'Personas Affected');
		const recommendationValue = matchField(section, 'Recommendation');

		const finding: UxFinding = {
			severity: normalizeSeverity(severityValue),
			category: categoryValue || 'General',
			description:
				descriptionValue || 'Describe the UX concern for this finding.',
			personaRelevance: splitList(personasValue),
			recommendation:
				recommendationValue || 'Provide a clear remediation plan.',
			pageUrl,
		};

		findings.push(finding);
	}

	return {
		findings,
		summary: extractSummary(response),
	};
}

function matchField(section: string, label: string): string {
	const fieldRegex = new RegExp(`\\*\\*${label}\\*\\*:\\s*(.*)`, 'i');
	const fieldMatch = fieldRegex.exec(section);
	const matchedField = fieldMatch?.[1]?.trim();
	return matchedField ?? '';
}

function normalizeSeverity(value: string): FindingSeverity {
	const normalized = value.trim().toLowerCase();
	if (
		normalized === 'critical' ||
		normalized === 'high' ||
		normalized === 'medium' ||
		normalized === 'low'
	) {
		return normalized;
	}

	return 'medium';
}

function splitList(value: string): string[] {
	if (!value) {
		return [];
	}

	return value
		.split(',')
		.map(entry => entry.trim())
		.filter(entry => entry.length > 0);
}

function extractAssistantReply(messages: ModelMessage[]): string {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const candidate = messages[index];
		if (!candidate || candidate.role !== 'assistant') {
			continue;
		}

		const message = candidate;
		if (typeof message.content === 'string') {
			const trimmed = message.content.trim();
			if (trimmed.length > 0) {
				return trimmed;
			}

			continue;
		}

		const textParts = message.content
			.filter(part => 'type' in part && part.type === 'text')
			.map(part => ('text' in part ? part.text : ''))
			.filter(part => part.length > 0);

		if (textParts.length > 0) {
			return textParts.join('\n').trim();
		}
	}

	return '';
}

function extractToolText(result: unknown): string | undefined {
	if (!isRecord(result)) {
		return undefined;
	}

	if ('content' in result && Array.isArray(result['content'])) {
		for (const part of result['content']) {
			if (!isRecord(part) || typeof part['type'] !== 'string') {
				continue;
			}

			if (
				part['type'] === 'text' &&
				'text' in part &&
				typeof part['text'] === 'string'
			) {
				return part['text'];
			}

			if (
				part['type'] === 'resource' &&
				'resource' in part &&
				isRecord(part['resource']) &&
				typeof part['resource']['text'] === 'string'
			) {
				return part['resource']['text'];
			}
		}
	}

	if ('toolResult' in result && typeof result['toolResult'] === 'string') {
		return result['toolResult'];
	}

	return undefined;
}

export function createModelFromEnv(env: EnvConfig): LanguageModel {
	switch (env.provider) {
		case 'anthropic': {
			const client = createAnthropic({apiKey: env.apiKey});
			return client(env.model);
		}

		case 'openai': {
			const client = createOpenAI({apiKey: env.apiKey});
			return client(env.model);
		}

		case 'ollama': {
			const client = createOllama({baseURL: env.baseUrl});
			return client.chat(env.model);
		}

		case 'xai': {
			const client = createXai({apiKey: env.apiKey});
			return client(env.model);
		}

		case 'google': {
			const client = createGoogleGenerativeAI({apiKey: env.apiKey});
			return client.chat(env.model);
		}
	}
}

function buildManualTool(name: string): Tool<any, never> | undefined {
	switch (name) {
		case 'browser_navigate': {
			return tool({
				description:
					'Navigate to an absolute URL and wait for the page to load.',
				inputSchema: zodSchema(
					z.object({
						url: z.url().describe('Absolute URL to open in the browser.'),
						timeout: z
							.number()
							.optional()
							.describe('Optional timeout in milliseconds.'),
						waitFor: z
							.enum(['load', 'domcontentloaded', 'networkidle'])
							.optional()
							.describe('Optional Playwright load state to await.'),
					}),
				),
			});
		}

		case 'browser_take_screenshot': {
			return tool({
				description:
					'Capture a screenshot of the current page for visual inspection.',
				inputSchema: zodSchema(
					z
						.object({
							path: z
								.string()
								.optional()
								.describe(
									'Optional path where the screenshot should be saved.',
								),
							fullPage: z
								.boolean()
								.optional()
								.describe('Capture the full page when true.'),
							mask: z
								.array(z.string())
								.optional()
								.describe(
									'Optional selectors to blur before taking the screenshot.',
								),
						})
						.catchall(z.any()),
				),
			});
		}

		case 'browser_snapshot': {
			return tool({
				description:
					'Capture the accessibility tree JSON for the current page.',
				inputSchema: zodSchema(
					z
						.object({
							format: z
								.enum(['ax-tree', 'accessibility-tree'])
								.optional()
								.describe('Optional snapshot format. Defaults to ax-tree.'),
						})
						.catchall(z.any()),
				),
			});
		}

		default: {
			return undefined;
		}
	}
}

function formatToolMessage(toolName: string, output: unknown): string {
	const text = extractToolText(output);
	if (text && text.length > 0) {
		return text;
	}

	try {
		return JSON.stringify(output);
	} catch {
		return `${toolName} completed with no readable output.`;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
