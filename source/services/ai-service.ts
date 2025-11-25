/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import {type experimental_MCPClient as McpClient} from '@ai-sdk/mcp';
import {anthropic} from '@ai-sdk/anthropic';
import {openai} from '@ai-sdk/openai';
import {xai} from '@ai-sdk/xai';
import {google} from '@ai-sdk/google';
import {
	type ModelMessage,
	streamText,
	generateObject,
	type LanguageModel,
} from 'ai';
import {ollama} from 'ollama-ai-provider-v2';
import {z} from 'zod';
import {type PageAnalysis, type UxFinding} from '../models/analysis.js';
import {type Page} from '../models/config.js';
import {
	loadEnvConfig,
	type EnvConfig,
} from '../infrastructure/config/env-config.js';

export class AIService {
	constructor(private readonly mcpClient: McpClient) {}

	async analyzePage(
		page: Page,
		personas: string[] = [],
	): Promise<PageAnalysis> {
		const envConfig = loadEnvConfig();
		const model = this.createModel(envConfig);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const tools = (await this.mcpClient.tools()) as any;

		const messages: ModelMessage[] = [
			{
				role: 'system',
				content: `You are a UX expert analyzing a web page.
Target Personas: ${personas.length > 0 ? personas.join(', ') : 'General User'}
Features to Analyze: ${page.features}

Your goal is to identify usability and accessibility issues.
1. Navigate to the page using the provided tools.
2. Get the accessibility tree or snapshot of the page to understand the structure.
3. Analyze the page content and structure for UX issues.
4. When you have gathered enough information to form a comprehensive report, stop using tools.`,
			},
			{
				role: 'user',
				content: `Analyze the page at ${page.url}. Focus on ${page.features}.`,
			},
		];

		let snapshot = '';
		const maxSteps = 10;
		let step = 0;

		// Manual Agent Loop
		// eslint-disable-next-line no-await-in-loop
		while (step < maxSteps) {
			step++;

			const result = streamText({
				model,
				messages,
				tools,
			});

			for await (const chunk of result.fullStream) {
				// Consume stream
				if (chunk.type === 'text-delta') {
					// Noop
				}
			}

			// eslint-disable-next-line no-await-in-loop
			const {messages: responseMessages} = await result.response;
			messages.push(...responseMessages);

			// eslint-disable-next-line no-await-in-loop
			const toolCalls = await result.toolCalls;

			if (toolCalls.length === 0) {
				// No more tools, agent is done
				break;
			}

			// eslint-disable-next-line no-await-in-loop
			snapshot = await this.processToolCalls(
				toolCalls,
				tools,
				messages,
				snapshot,
			);
		}

		// Generate structured report from the conversation history
		// We append a user message to request structured output instead of using prompt parameter
		messages.push({
			role: 'user',
			content:
				'Based on the analysis, generate a structured report of UX findings.',
		});

		const {object: analysisResult} = await generateObject({
			model,
			schema: z.object({
				findings: z.array(
					z.object({
						severity: z.enum(['critical', 'high', 'medium', 'low']),
						category: z.string(),
						description: z.string(),
						personaRelevance: z.array(z.string()),
						recommendation: z.string(),
					}),
				),
			}),
			messages,
		});

		const findings: UxFinding[] = analysisResult.findings.map(f => ({
			...f,
			pageUrl: page.url,
		}));

		return {
			pageUrl: page.url,
			features: page.features,
			snapshot: snapshot || 'No snapshot captured',
			findings,
			analysisTimestamp: Date.now(),
			status: 'complete',
		};
	}

	private async processToolCalls(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		toolCalls: any[],
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		tools: any,
		messages: ModelMessage[],
		currentSnapshot: string,
	): Promise<string> {
		let newSnapshot = currentSnapshot;

		// eslint-disable-next-line no-await-in-loop
		for (const toolCall of toolCalls) {
			const result = await this.executeSingleTool(toolCall, tools, messages);

			if (
				typeof result === 'string' &&
				(toolCall.toolName.includes('accessibility') ||
					toolCall.toolName.includes('snapshot'))
			) {
				newSnapshot = result;
			} else if (typeof result === 'object' && result !== null) {
				const stringResult = JSON.stringify(result);
				if (
					toolCall.toolName.includes('accessibility') ||
					toolCall.toolName.includes('snapshot')
				) {
					newSnapshot = stringResult;
				}
			}
		}

		return newSnapshot;
	}

	private async executeSingleTool(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		toolCall: any,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		tools: any,
		messages: ModelMessage[],
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	): Promise<any> {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const tool = tools[toolCall.toolName];

		if (!tool) {
			messages.push({
				role: 'tool',
				content: [
					{
						type: 'tool-result',
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
						toolCallId: toolCall.toolCallId,
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
						toolName: toolCall.toolName,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						...({result: 'Tool not found', isError: true} as any),
					},
				],
			});
			return undefined;
		}

		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const {args} = toolCall;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const result = await tool.execute?.(args, {
				messages,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				toolCallId: toolCall.toolCallId,
			});

			messages.push({
				role: 'tool',
				content: [
					{
						type: 'tool-result',
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
						toolCallId: toolCall.toolCallId,
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
						toolName: toolCall.toolName,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						...({result} as any),
					},
				],
			});

			return result;
		} catch (error) {
			messages.push({
				role: 'tool',
				content: [
					{
						type: 'tool-result',
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
						toolCallId: toolCall.toolCallId,
						// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
						toolName: toolCall.toolName,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						...({
							result: `Error: ${
								error instanceof Error ? error.message : String(error)
							}`,
							isError: true,
						} as any),
					},
				],
			});
			return undefined;
		}
	}

	private createModel(config: EnvConfig): LanguageModel {
		switch (config.provider) {
			case 'anthropic': {
				return anthropic(config.model);
			}

			case 'openai': {
				return openai(config.model);
			}

			case 'ollama': {
				return ollama(config.model);
			}

			case 'xai': {
				return xai(config.model);
			}

			case 'google': {
				return google(config.model);
			}
		}
	}
}
