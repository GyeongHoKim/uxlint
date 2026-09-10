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
 * https://developers.openai.com/codex/config-advanced.
 *
 * Cursor Agent is deliberately absent. It had a parser here, built from its
 * documentation, and a live run falsified three of the rules that parser
 * encoded -- so keeping it would mean asserting documentation that has been
 * disproved. Cursor is supported through the agent-driven route instead, which
 * launches no binary and therefore needs no fake for one.
 *
 * A rule marked "assumed" is not in those pages. It is what uxlint relies on,
 * stated so that a reader knows which parts of these fakes a real run has to
 * confirm.
 */

import fs from 'node:fs';
import path from 'node:path';
import {parse as parseToml} from 'smol-toml';
import type {LaunchableHostId} from '../../../source/models/delegate.js';

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
	 * Withheld for both remaining hosts, which is what makes the `env` in the
	 * injected configuration load-bearing rather than incidental.
	 */
	inheritsEnvironment: boolean;
};

/**
 * What the fake learned from the command line.
 */
export type ParsedLaunch = {
	host: LaunchableHostId;
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
	let toolsPreApproved = false;

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
			Record<string, StdioServerJson & Record<string, unknown>> | undefined;
		const entry = servers?.['uxlint'];
		if (entry) {
			toolsPreApproved = entry['default_tools_approval_mode'] === 'approve';
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
		// `codex exec` runs with `approval_policy = never`, and under that
		// policy an MCP call is auto-approved only when the sandbox has full
		// disk write access or the server sets
		// `default_tools_approval_mode = "approve"`. So a read-only launch that
		// omits the approval reaches the server, lists its tools, and can call
		// none of them. Observed live against codex-cli 0.153.4, which failed
		// every call with "MCP tool call requires approval, but approval policy
		// is never".
		permitsTool: () => toolsPreApproved || writable,
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
 * A launch that is only a probe.
 *
 * @param host - Which CLI
 * @param result - What it answers
 * @returns A parsed launch carrying nothing but the probe
 */
function probe(
	host: LaunchableHostId,
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
	host: LaunchableHostId,
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
	}
}
