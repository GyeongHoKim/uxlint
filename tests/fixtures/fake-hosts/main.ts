/**
 * A host agent CLI, as its documentation describes it.
 *
 * One executable standing in for `claude` and `codex`. It
 * parses the argument vector the way the documented CLI does, finds the
 * judgement server the way the documented CLI finds it, starts that server as
 * its own child over stdio, and calls the tools a script tells it to. There
 * is no model anywhere in it.
 *
 * Every rule in `argv.ts` cites the page it came from. A rule with no citation
 * is uxlint's own assumption, and is marked as one.
 *
 * Started as `node main.js <host-id> ...argv`. stdout is the fake's own
 * stdout, which the adapters discard; the trace file is how anything is
 * reported back.
 */

import fs from 'node:fs';
import process from 'node:process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {
	isLaunchableHostId,
	type LaunchableHostId,
} from '../../../source/models/delegate.js';
import {runSequentially} from '../../../source/utils/run-sequentially.js';
import {parseArgv, type ParsedLaunch} from './argv.js';
import {
	fakeHostEnvironment,
	type FakeHostPageScript,
	type FakeHostScript,
	type FakeHostTrace,
} from './contract.js';

/**
 * What a `listPages` reply carries, as far as the fake needs.
 */
type ListedPage = {pageUrl: string};

/**
 * Read a tool reply's text.
 *
 * @param result - What `callTool` returned
 * @returns The text of its first content block
 */
function textOf(result: unknown): string {
	const {content} = result as {content?: Array<{text?: string}>};
	return content?.[0]?.text ?? '';
}

/**
 * Whether a tool reply was an error.
 *
 * @param result - What `callTool` returned
 * @returns Its `isError` flag
 */
function isErrorReply(result: unknown): boolean {
	return (result as {isError?: boolean}).isError === true;
}

/**
 * A client that keeps every protocol error it sees.
 *
 * The SDK skips a line on the server's stdout that is not JSON-RPC and
 * carries on. Keeping the error is what turns that leniency into something a
 * test can assert against, because not every client is as forgiving.
 */
class RecordingClient extends Client {
	override onerror = (error: Error) => {
		this.errors.push(error.message);
	};

	constructor(
		name: string,
		private readonly errors: string[],
	) {
		super({name, version: '0.0.0'});
	}
}

/**
 * Judge every page the server lists, according to the script.
 *
 * @param parsed - The launch, with its server resolved
 * @param script - What to do per page
 * @param trace - Where calls are recorded
 */
async function judge(
	parsed: ParsedLaunch,
	script: FakeHostScript,
	trace: FakeHostTrace,
): Promise<void> {
	const {server} = parsed;
	if (!server) {
		return;
	}

	const transport = new StdioClientTransport({
		command: server.command,
		args: server.args,
		env: server.inheritsEnvironment
			? {...(process.env as Record<string, string>), ...server.env}
			: server.env,
	});
	const client = new RecordingClient(
		`fake-${parsed.host}`,
		trace.protocolErrors,
	);
	await client.connect(transport);

	try {
		const listed = await client.listTools();
		trace.tools = listed.tools.map(tool => tool.name);

		const permitted = (name: string) => parsed.permitsTool(name);
		const call = async (name: string, args: Record<string, unknown>) => {
			if (!permitted(name)) {
				trace.denied.push(name);
				return undefined;
			}

			const result = await client.callTool({name, arguments: args});
			trace.calls.push({name, arguments: args, isError: isErrorReply(result)});
			return result;
		};

		const pagesReply = await call('listPages', {});
		if (!pagesReply) {
			return;
		}

		const pages = JSON.parse(textOf(pagesReply)) as ListedPage[];
		const calls: Array<[string, Record<string, unknown>]> = [];

		for (const [index, page] of pages.entries()) {
			const step: FakeHostPageScript | undefined =
				script.pages?.[index] ?? script.default;
			if (!step) {
				continue;
			}

			calls.push(['getPageEvidence', {pageUrl: page.pageUrl}]);

			for (let n = 0; n < (step.findings ?? 0); n++) {
				calls.push([
					'addFinding',
					{
						severity: 'medium',
						category: 'Navigation',
						description: `Judgement ${n + 1} on ${page.pageUrl}`,
						personaRelevance: ['first-time visitor'],
						recommendation: 'Make it clearer.',
						pageUrl: page.pageUrl,
					},
				]);
			}

			if (step.note) {
				calls.push([
					'noteOnMeasuredIssues',
					{
						pageUrl: page.pageUrl,
						note: `What the measurements mean on ${page.pageUrl}`,
					},
				]);
			}

			if (step.complete) {
				calls.push(['completePageAnalysis', {pageUrl: page.pageUrl}]);
			}
		}

		// A host agent works one page at a time, and its submissions arrive in
		// the order it made them.
		await runSequentially(calls, async ([name, args]) => call(name, args));
	} finally {
		await client.close();
	}
}

/**
 * Print what the documented CLI prints at the end of a run.
 *
 * @param host - Which CLI
 * @param succeeded - Whether the run is reported as a success
 */
function printResult(host: LaunchableHostId, succeeded: boolean): void {
	const result = 'Review submitted through the judgement tools.';

	switch (host) {
		case 'claude-code': {
			// https://code.claude.com/docs/en/headless.md
			console.log(
				JSON.stringify({
					type: 'result',
					subtype: succeeded ? 'success' : 'error_during_execution',
					is_error: !succeeded,
					duration_ms: 1234,
					num_turns: 1,
					result,
					session_id: '00000000-0000-4000-8000-000000000000',
					total_cost_usd: 0,
					usage: {input_tokens: 0, output_tokens: 0},
				}),
			);
			break;
		}

		case 'codex': {
			// https://developers.openai.com/codex/noninteractive
			console.log(JSON.stringify({type: 'thread.started', thread_id: 't'}));
			console.log(
				JSON.stringify({
					type: 'item.completed',
					item: {id: 'item_1', type: 'agent_message', text: result},
				}),
			);
			console.log(
				JSON.stringify({
					type: succeeded ? 'turn.completed' : 'turn.failed',
					usage: {input_tokens: 0, cached_input_tokens: 0, output_tokens: 0},
				}),
			);
			break;
		}
	}
}

/**
 * Run one launch end to end.
 *
 * @param host - Which CLI this process is standing in for
 * @param argv - Its arguments
 * @returns The exit code
 */
async function main(host: LaunchableHostId, argv: string[]): Promise<number> {
	const trace: FakeHostTrace = {
		host,
		argv,
		promptSource: 'none',
		prompt: '',
		tools: [],
		calls: [],
		denied: [],
		protocolErrors: [],
		wroteCanary: false,
		exitCode: 0,
	};
	let leaveTrace = true;

	try {
		const parsed = parseArgv(host, argv, {
			home: process.env['HOME'] ?? '',
			cwd: process.cwd(),
			readStdin: () => fs.readFileSync(0, 'utf8'),
			codexSignedIn: process.env[fakeHostEnvironment.codexSignedIn] === '1',
		});

		if (parsed.probe) {
			// A version or sign-in probe. It answers and leaves no trace: the
			// trace describes a launch, and the next launch would overwrite it.
			leaveTrace = false;
			if (parsed.probe.stdout) {
				console.log(parsed.probe.stdout);
			}

			if (parsed.probe.stderr) {
				console.error(parsed.probe.stderr);
			}

			return parsed.probe.exitCode;
		}

		trace.promptSource = parsed.promptSource;
		trace.prompt = parsed.prompt;
		trace.skipped = parsed.skipped;
		if (parsed.server) {
			trace.server = {
				command: parsed.server.command,
				args: parsed.server.args,
				env: parsed.server.env,
				source: parsed.server.source,
			};
		}

		if (parsed.writable) {
			const canary = process.env[fakeHostEnvironment.canary];
			if (canary) {
				fs.writeFileSync(canary, `${host} was launched writable\n`);
			}

			trace.wroteCanary = true;
		}

		const script = JSON.parse(
			process.env[fakeHostEnvironment.script] ?? '{}',
		) as FakeHostScript;

		await judge(parsed, script, trace);
		printResult(host, true);
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		trace.failure = message;
		console.error(`${host}: ${message}`);
		return 1;
	} finally {
		const tracePath = process.env[fakeHostEnvironment.trace];
		if (tracePath && leaveTrace) {
			trace.exitCode = trace.failure === undefined ? 0 : 1;
			fs.writeFileSync(tracePath, JSON.stringify(trace, null, '\t'));
		}
	}
}

const [host, ...argv] = process.argv.slice(2);

if (host === undefined || !isLaunchableHostId(host)) {
	console.error(`fake host: unknown host ${host ?? '(none)'}`);
	process.exit(2);
}

process.exitCode = await main(host, argv);
