import {type experimental_MCPClient as McpClient} from '@ai-sdk/mcp';
import {type ReportBuilder} from './report-builder.js';
import {type PageAnalysis} from '@/models/analysis.js';
import {type Page} from '@/models/config.js';

export class AIService {
	constructor(
		private readonly mcpClient: McpClient,
		private readonly reportBuilder: ReportBuilder,
	) {
		throw new Error('Not implemented');
	}

	async analyzePage(page: Page): Promise<PageAnalysis> {
		throw new Error('Not implemented');
	}
}
