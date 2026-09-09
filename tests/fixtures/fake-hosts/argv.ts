/**
 * How each host agent CLI reads its command line, per its documentation.
 *
 * Documentation consulted on 2026-09-09. Claude Code:
 * https://code.claude.com/docs/en/cli-reference,
 * https://code.claude.com/docs/en/headless,
 * https://code.claude.com/docs/en/permission-modes and
 * https://code.claude.com/docs/en/mcp. Codex:
 * https://developers.openai.com/codex/cli/reference,
 * https://developers.openai.com/codex/noninteractive,
 * https://developers.openai.com/codex/mcp and
 * https://developers.openai.com/codex/config-advanced. Cursor:
 * https://cursor.com/docs/cli/reference/parameters,
 * https://cursor.com/docs/cli/headless, https://cursor.com/docs/cli/mcp and
 * https://cursor.com/docs/context/mcp.
 *
 * A rule marked "assumed" is not in those pages. It is what uxlint relies on,
 * stated so that a reader knows which parts of these fakes a real run has to
 * confirm.
 */

import fs from 'node:fs';
import path from 'node:path';
import {parse as parseToml} from 'smol-toml';
import type {DelegateHostId} from '../../../source/models/delegate.js';

/**
 * A stdio MCP server, as the CLI resolved it.
 */
export type ResolvedServer = {
	command: string;
	args: string[];
	env: Record<string, string>;

	/** Where the CLI found it */
	source: string;

	/**
	 * Whether the server also receives the CLI's own environment.
	 *
	 * Assumed for Cursor: its documented registration file for uxlint carries
	 * no `env`, so the session can only reach the server by inheritance.
	 * Withheld for the other two, which makes the `env` in the injected
	 * configuration load-bearing.
	 */
	inheritsEnvironment: boolean;
};

/**
 * What the fake learned from the command line.
 */
export type ParsedLaunch = {
	host: DelegateHostId;
	promptSource: 'stdin' | 'argument' | 'none';
	prompt: string;
	server?: ResolvedServer;

	/** Whether the documented CLI would let this launch change files */
	writable: boolean;

	/** Why no tools will be called, when the launch is valid but toothless */
	skipped?: string;

	/** Whether the launch pre-approved a tool of the judgement server */
	permitsTool(name: string): boolean;

	/** Set when the command line was a probe, not a run */
	probe?: {exitCode: number; stdout?: string; stderr?: string};
};

/**
 * What the parser needs from the process.
 */
export type ParseContext = {
	home: string;
	cwd: string;
	readStdin(): string;
	codexSignedIn: boolean;
};

/**
 * The stdio server block every CLI's JSON configuration uses.
 */
type StdioServerJson = {
	command: string;
	args?: string[];
	env?: Record<string, string>;
};

/**
 * A `mcpServers` file or string.
 */
type McpServersJson = {mcpServers?: Record<string, StdioServerJson>};

/**
 * A cursor over the argument vector.
 *
 * Handlers pull their values through it, so a flag that takes one is written
 * next to the flag rather than as arithmetic on a loop index.
 */
class Arguments {
	private index = 0;

	constructor(
		private readonly argv: string[],
		start = 0,
	) {
		this.index = start;
	}

	/** Whether anything is left */
	get exhausted(): boolean {
		return this.index >= this.argv.length;
	}

	/** The next token, consumed */
	next(): string {
		return this.argv[this.index++]!;
	}

	/** The next token, not consumed */
	peek(): string | undefined {
		return this.argv[this.index];
	}

	/**
	 * The value a flag requires, or the failure a CLI reports without it.
	 *
	 * @param flag - The flag that needs it, for the message
	 * @returns The value
	 */
	valueFor(flag: string): string {
		const value = this.peek();
		if (value === undefined || value.startsWith('-')) {
			throw new Error(`option '${flag}' argument missing`);
		}

		return this.next();
	}
}

/**
 * What a flag does when it is seen.
 */
type FlagHandler = (args: Arguments, flag: string) => void;

/**
 * Walk the arguments, dispatching flags and collecting positionals.
 *
 * @param args - The cursor
 * @param handlers - Flag handlers, keyed by flag
 * @returns The positional arguments, in order
 */
function walk(
	args: Arguments,
	handlers: Record<string, FlagHandler>,
): string[] {
	const positional: string[] = [];

	while (!args.exhausted) {
		const token = args.next();
		const handler = handlers[token];

		if (handler) {
			handler(args, token);
		} else if (token.startsWith('-') && token !== '-') {
			throw new Error(`unknown option '${token}'`);
		} else {
			positional.push(token);
		}
	}

	return positional;
}

/** A handler for a flag whose value the fake does not need. */
const takesValue: FlagHandler = (args, flag) => {
	args.valueFor(flag);
};

/** A handler for a flag the fake acknowledges and ignores. */
const ignored: FlagHandler = () => undefined;

/**
 * Fail the way a CLI without a usable terminal does.
 *
 * @param print - Whether print mode was requested
 */
function requirePrintMode(print: boolean): void {
	if (!print) {
		throw new Error('interactive mode is not available to a fake');
	}
}

/**
 * Pull the `uxlint` server out of an `mcpServers` document.
 *
 * @param document - Parsed JSON
 * @param source - Where it came from, for the trace
 * @param inheritsEnvironment - See `ResolvedServer`
 * @returns The server, or undefined when the document names none
 */
function serverFromJson(
	document: McpServersJson,
	source: string,
	inheritsEnvironment: boolean,
): ResolvedServer | undefined {
	const entry = document.mcpServers?.['uxlint'];
	if (!entry) {
		return undefined;
	}

	return {
		command: entry.command,
		args: entry.args ?? [],
		env: entry.env ?? {},
		source,
		inheritsEnvironment,
	};
}

/**
 * Claude Code.
 *
 * @param argv - Arguments after the executable
 * @param context - Process facts
 * @returns The parsed launch
 */
function parseClaude(argv: string[], context: ParseContext): ParsedLaunch {
	// Per cli-reference, `claude --version` prints the version. Format observed.
	if (argv[0] === '--version') {
		return probe('claude-code', {exitCode: 0, stdout: '2.1.300 (Claude Code)'});
	}

	let print = false;
	let restricted = false;
	let bypass = false;
	let permissionMode: string | undefined;
	let server: ResolvedServer | undefined;
	const allowed: string[] = [];

	const setPrint: FlagHandler = () => {
		print = true;
	};

	// Per cli-reference: "Load MCP servers from JSON files or strings".
	const loadMcpConfig: FlagHandler = (args, flag) => {
		const value = args.valueFor(flag);
		const document = JSON.parse(
			value.trimStart().startsWith('{')
				? value
				: fs.readFileSync(path.resolve(context.cwd, value), 'utf8'),
		) as McpServersJson;
		server = serverFromJson(document, '--mcp-config', false);
	};

	// Variadic. Every following token that does not look like an option is
	// read as another tool name, comma-separated lists included. This is what
	// swallows a trailing prompt.
	const allowTools: FlagHandler = args => {
		while (args.peek() !== undefined && !args.peek()!.startsWith('-')) {
			allowed.push(...args.next().split(','));
		}
	};

	const positional = walk(new Arguments(argv), {
		'-p': setPrint,
		'--print': setPrint,
		'--output-format': takesValue,
		'--mcp-config': loadMcpConfig,
		'--strict-mcp-config': ignored,
		'--verbose': ignored,
		'--allowedTools': allowTools,
		'--allowed-tools': allowTools,
		'--restricted'() {
			restricted = true;
		},
		'--dangerously-skip-permissions'() {
			bypass = true;
		},
		'--permission-mode'(args, flag) {
			permissionMode = args.valueFor(flag);
		},
	});

	requirePrintMode(print);

	// Per headless, the prompt is "an argument or piped on stdin".
	const promptSource = positional.length > 0 ? 'argument' : 'stdin';
	const prompt =
		positional.length > 0 ? positional.join(' ') : context.readStdin();
	if (prompt.trim() === '') {
		// Message observed rather than documented.
		throw new Error(
			'Input must be provided either through stdin or as a prompt argument when using --print',
		);
	}

	// Per permission-modes and cli-reference, a restricted session refuses
	// bypassPermissions.
	if (restricted && (bypass || permissionMode === 'bypassPermissions')) {
		throw new Error(
			'bypassPermissions is not available in a restricted session',
		);
	}

	// Per cli-reference, restricted mode "loads only managed settings and
	// --settings", so the developer's own allow rules apply only without it.
	const settingsAllowWrites =
		!restricted &&
		readClaudeSettingsAllow(context.home).some(rule =>
			/^(?:Edit|Write|MultiEdit|NotebookEdit|Bash)(?:\(|$)/.test(rule),
		);

	// Per permission-modes, with -p and nothing configured the session starts
	// in `default`, where edits and commands need an allow rule or a prompt no
	// one is there to answer.
	const writable =
		bypass || permissionMode === 'bypassPermissions' || settingsAllowWrites;

	// Per mcp, tools are named mcp__<server>__<tool>; mcp__<server>__* covers
	// all of them.
	const permitsTool = (name: string) =>
		allowed.includes(`mcp__uxlint__${name}`) ||
		allowed.includes('mcp__uxlint__*');

	return {
		host: 'claude-code',
		promptSource,
		prompt,
		server,
		writable,
		skipped: server ? undefined : 'no MCP server was configured',
		permitsTool,
	};
}

/**
 * The developer's Claude Code allow rules.
 *
 * @param home - Their home directory
 * @returns `permissions.allow` from `~/.claude/settings.json`, or nothing
 */
function readClaudeSettingsAllow(home: string): string[] {
	const file = path.join(home, '.claude', 'settings.json');
	if (!fs.existsSync(file)) {
		return [];
	}

	const settings = JSON.parse(fs.readFileSync(file, 'utf8')) as {
		permissions?: {allow?: string[]};
	};
	return settings.permissions?.allow ?? [];
}

/**
 * Codex.
 *
 * @param argv - Arguments after the executable
 * @param context - Process facts
 * @returns The parsed launch
 */
function parseCodex(argv: string[], context: ParseContext): ParsedLaunch {
	// Per troubleshooting, `codex --version`. Format observed.
	if (argv[0] === '--version') {
		return probe('codex', {exitCode: 0, stdout: 'codex-cli 0.160.0'});
	}

	// Per cli/reference, `codex login status` exits 0 when logged in. The
	// logged-out exit code is not documented; non-zero is assumed.
	if (argv[0] === 'login' && argv[1] === 'status') {
		return probe(
			'codex',
			context.codexSignedIn
				? {exitCode: 0, stdout: 'Logged in using ChatGPT'}
				: {exitCode: 1, stderr: 'Not logged in'},
		);
	}

	// Per cli/reference, `-p` is `--profile` at the top level too, and there
	// is no print flag. Non-interactive execution is the `exec` subcommand.
	if (argv[0] !== 'exec') {
		throw new Error(
			`unexpected argument '${argv[0] ?? ''}': the fake supports \`codex exec\` only`,
		);
	}

	let sandbox: string | undefined;
	let bypassSandbox = false;
	let server: ResolvedServer | undefined;

	const setSandbox: FlagHandler = (args, flag) => {
		sandbox = args.valueFor(flag);
		if (
			!['read-only', 'workspace-write', 'danger-full-access'].includes(sandbox)
		) {
			throw new Error(`invalid value '${sandbox}' for '--sandbox'`);
		}
	};

	// Per config-advanced, "--config values are parsed as TOML"; a value that
	// will not parse is taken as a string.
	const applyOverride: FlagHandler = (args, flag) => {
		const parsed = parseTomlOverride(args.valueFor(flag));
		const servers = parsed['mcp_servers'] as
			Record<string, StdioServerJson> | undefined;
		const entry = servers?.['uxlint'];
		if (entry) {
			server = {
				command: entry.command,
				args: entry.args ?? [],
				env: entry.env ?? {},
				source: '--config',
				inheritsEnvironment: false,
			};
		}
	};

	// Per cli/reference, a profile layers `$CODEX_HOME/<name>.config.toml`.
	// What happens when it does not exist is not documented; failing is
	// assumed, since the alternative is silently running with no profile.
	const requireProfile: FlagHandler = (args, flag) => {
		const name = args.valueFor(flag);
		const file = path.join(context.home, '.codex', `${name}.config.toml`);
		if (!fs.existsSync(file)) {
			throw new Error(`config profile \`${name}\` not found`);
		}
	};

	const bypassEverything: FlagHandler = () => {
		bypassSandbox = true;
	};

	const positional = walk(new Arguments(argv, 1), {
		'-s': setSandbox,
		'--sandbox': setSandbox,
		'--json': ignored,
		'--full-auto': ignored,
		'--skip-git-repo-check': ignored,
		'-c': applyOverride,
		'--config': applyOverride,
		'-p': requireProfile,
		'--profile': requireProfile,
		'-a': takesValue,
		'--ask-for-approval': takesValue,
		'-o': takesValue,
		'--output-last-message': takesValue,
		'-m': takesValue,
		'--model': takesValue,
		'--dangerously-bypass-approvals-and-sandbox': bypassEverything,
		'--yolo': bypassEverything,
	});

	// Per noninteractive, a prompt argument, or stdin when it is omitted or
	// `-`.
	const fromStdin = positional.length === 0 || positional[0] === '-';
	const prompt = fromStdin ? context.readStdin() : positional.join(' ');
	if (prompt.trim() === '') {
		throw new Error('no prompt was provided');
	}

	// Per sandboxing, read-only "can't edit files or run commands without
	// approval"; workspace-write is the documented default for local work.
	const writable =
		bypassSandbox || (sandbox ?? 'workspace-write') !== 'read-only';

	return {
		host: 'codex',
		promptSource: fromStdin ? 'stdin' : 'argument',
		prompt,
		server,
		writable,
		skipped: server ? undefined : 'no MCP server was configured',
		// Codex has no per-tool allow list on the command line; tool naming
		// as the model sees it is not documented.
		permitsTool: () => true,
	};
}

/**
 * Parse one `-c key=value` the way Codex does.
 *
 * @param override - The `key=value` text
 * @returns The document it produces
 */
function parseTomlOverride(override: string): Record<string, unknown> {
	try {
		return parseToml(override);
	} catch {
		const separator = override.indexOf('=');
		return {[override.slice(0, separator)]: override.slice(separator + 1)};
	}
}

/**
 * Cursor Agent.
 *
 * @param argv - Arguments after the executable
 * @param context - Process facts
 * @returns The parsed launch
 */
function parseCursor(argv: string[], context: ParseContext): ParsedLaunch {
	// Per reference/parameters, `-v, --version`. Format observed.
	if (argv[0] === '--version' || argv[0] === '-v') {
		return probe('cursor-agent', {exitCode: 0, stdout: '2026.09.01-abc1234'});
	}

	let print = false;
	let approveMcps = false;
	let force = false;

	const setPrint: FlagHandler = () => {
		print = true;
	};

	// Per headless, "--force allows the agent to make direct file changes
	// without confirmation"; --yolo is its alias.
	const setForce: FlagHandler = () => {
		force = true;
	};

	const positional = walk(new Arguments(argv), {
		'-p': setPrint,
		'--print': setPrint,
		'--output-format': takesValue,
		'--api-key': takesValue,
		'-m': takesValue,
		'--model': takesValue,
		'--workspace': takesValue,
		'--approve-mcps'() {
			approveMcps = true;
		},
		'-f': setForce,
		'--force': setForce,
		'--yolo': setForce,
		'--trust': ignored,
	});

	requirePrintMode(print);

	// Per reference/parameters, `agent [prompt...]`. Reading the prompt from
	// stdin is not documented, so the fake does not.
	if (positional.length === 0) {
		throw new Error('no prompt was provided');
	}

	// Per cli/mcp, servers come from `.cursor/mcp.json` in the project or in
	// the home directory; there is no flag to pass one inline.
	const candidates = [
		[path.join(context.cwd, '.cursor', 'mcp.json'), 'project .cursor/mcp.json'],
		[path.join(context.home, '.cursor', 'mcp.json'), 'home .cursor/mcp.json'],
	] as const;
	let server: ResolvedServer | undefined;
	for (const [file, source] of candidates) {
		if (!server && fs.existsSync(file)) {
			server = serverFromJson(
				JSON.parse(fs.readFileSync(file, 'utf8')) as McpServersJson,
				source,
				true,
			);
		}
	}

	// Per cli/mcp, `--approve-mcps` auto-approves configured servers; without
	// it a headless run has no one to answer the approval prompt.
	let skipped: string | undefined;
	if (!server) {
		skipped = 'no MCP server is registered in .cursor/mcp.json';
	} else if (!approveMcps) {
		skipped = 'the uxlint server was not approved; pass --approve-mcps';
		server = undefined;
	}

	return {
		host: 'cursor-agent',
		promptSource: 'argument',
		prompt: positional.join(' '),
		server,
		// Per headless, without --force the agent proposes changes and applies
		// none.
		writable: force,
		skipped,
		permitsTool: () => true,
	};
}

/**
 * A launch that is only a probe.
 *
 * @param host - Which CLI
 * @param result - What it answers
 * @returns A parsed launch carrying nothing but the probe
 */
function probe(
	host: DelegateHostId,
	result: NonNullable<ParsedLaunch['probe']>,
): ParsedLaunch {
	return {
		host,
		promptSource: 'none',
		prompt: '',
		writable: false,
		permitsTool: () => false,
		probe: result,
	};
}

/**
 * Parse a command line the way the named CLI's documentation says it is read.
 *
 * @param host - Which CLI
 * @param argv - Arguments after the executable
 * @param context - Process facts
 * @returns The parsed launch
 */
export function parseArgv(
	host: DelegateHostId,
	argv: string[],
	context: ParseContext,
): ParsedLaunch {
	switch (host) {
		case 'claude-code': {
			return parseClaude(argv, context);
		}

		case 'codex': {
			return parseCodex(argv, context);
		}

		case 'cursor-agent': {
			return parseCursor(argv, context);
		}
	}
}
