import {createRequire} from 'node:module';
import process from 'node:process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
	createMCPClient,
	type experimental_MCPClient as MCPClient,
} from '@ai-sdk/mcp';
// No non-experimental alias exists for the stdio transport: the subpath's
// only export is `StdioMCPTransport as Experimental_StdioMCPTransport`.
import {Experimental_StdioMCPTransport as StdioMCPTransport} from '@ai-sdk/mcp/mcp-stdio';
import {logger} from '../infrastructure/logger.js';
import {
	defaultAcceptInsecureCerts,
	defaultAllowExternalData,
	type BrowserSettings,
} from '../models/browser.js';
import {requiredBrowserTools} from '../models/analysis-stage.js';
import type {PreflightVerdict} from '../models/browser-preflight.js';
import type {Redactor} from '../models/secret-redaction.js';
import {requiredSignInTools} from '../models/sign-in.js';

/**
 * Package that provides the browser server.
 *
 * Resolved from this project's own dependencies rather than fetched at run
 * time. `npx chrome-devtools-mcp@latest` would reintroduce three problems at
 * once: a report generated on an unknown toolset, an unreviewed version
 * executed on every run, and a registry round-trip in the cold start path.
 */
const serverPackage = 'chrome-devtools-mcp';

/**
 * Identity of the browser tooling behind a run, for the report's provenance.
 *
 * The version is read from the installed package rather than restated here,
 * so a dependency bump cannot leave reports claiming a version that no longer
 * ran.
 */
export function browserServerIdentity(): {name: string; version: string} {
	const require = createRequire(import.meta.url);
	const {version} = require(`${serverPackage}/package.json`) as {
		version: string;
	};

	return {name: serverPackage, version};
}

/**
 * Everything needed to start the browser server.
 */
export type McpLaunchSpec = {
	/** Executable that runs the server -- the current Node binary */
	command: string;

	/** Resolved entry point of the pinned server package */
	serverEntryPoint: string;

	/** Full argument vector, entry point first */
	args: string[];

	/** Environment for the server process */
	env: Record<string, string>;

	/**
	 * Where the server's stderr goes.
	 *
	 * Set explicitly because the transport's default is `inherit`, and the
	 * server writes a five-line banner on every start. Inherited, those lines
	 * land in the middle of an Ink render and in a stream this project
	 * reserves for the MCP protocol.
	 *
	 * Discarded rather than piped. `@ai-sdk/mcp` sets the child's stdio and
	 * then never attaches a reader to `child.stderr`, so a pipe fills and the
	 * child blocks on write once the OS buffer is full -- the analysis would
	 * hang with no error, and the server has hundreds of `console.error`
	 * sites feeding it. Capturing the banner into the log would be nicer, but
	 * not at the cost of a deadlock that only appears on chatty runs.
	 */
	stderr: 'ignore' | 'pipe';
};

/**
 * Browser settings with the defaults already applied.
 */
export type BrowserLaunchSettings = {
	executablePath?: string;
	acceptInsecureCerts: boolean;
	allowExternalData: boolean;
};

/**
 * Apply the documented defaults to a possibly absent settings block.
 */
export function resolveBrowserSettings(
	settings: BrowserSettings | undefined,
): BrowserLaunchSettings {
	return {
		executablePath: settings?.executablePath,
		acceptInsecureCerts:
			settings?.acceptInsecureCerts ?? defaultAcceptInsecureCerts,
		allowExternalData: settings?.allowExternalData ?? defaultAllowExternalData,
	};
}

/**
 * Build the launch specification for a preflight verdict.
 *
 * Kept pure and separate from the spawning so the argument vector -- which is
 * where the privacy and sandbox decisions actually live -- can be asserted
 * without starting a browser.
 */
export function buildLaunchSpec(
	verdict: PreflightVerdict,
	settings: BrowserLaunchSettings,
): McpLaunchSpec {
	const serverEntryPoint = resolveServerEntryPoint();

	const args = [
		serverEntryPoint,
		// The server's own default is a visible browser window, which is wrong
		// on a developer machine and fatal in a container.
		'--headless',
		// A throwaway profile per run, so nothing leaks between runs and
		// nothing touches the user's everyday browsing state.
		'--isolated',
	];

	if (!settings.allowExternalData) {
		// Both default to on upstream. The usage-statistics one is suppressed
		// automatically when CI is set, which means the interactive run on a
		// developer laptop is precisely the case that would otherwise leak.
		args.push('--no-performance-crux', '--no-usage-statistics');
	}

	if (settings.acceptInsecureCerts) {
		args.push('--acceptInsecureCerts');
	}

	if (verdict.kind === 'ready-without-sandbox') {
		args.push('--chromeArg=--no-sandbox');
	}

	if (settings.executablePath) {
		args.push('--executablePath', settings.executablePath);
	}

	return {
		command: process.execPath,
		serverEntryPoint,
		args,
		env: {
			// Only what the server and the browser it launches actually need.
			// Forwarding all of process.env would hand this project's model
			// credentials and cloud tokens to a third-party subprocess tree,
			// which is a wider exposure than the transport's own default of
			// HOME/LOGNAME/PATH/SHELL/TERM/USER -- and a strange thing to do
			// in the feature whose subject is what leaves the machine.
			...forwardedEnvironment(),
			// The server otherwise spawns a detached child that fetches
			// registry.npmjs.org on startup. Pinning our own dependency does
			// not stop it, so an offline run would still reach for the
			// network -- from inside the dependency rather than from us.
			CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1',
		},
		stderr: 'ignore',
	};
}

/**
 * Environment variables the browser server is given.
 *
 * Chrome needs a home directory, a PATH and display-related variables to
 * launch; nothing here carries a credential.
 */
const forwardedEnvironmentKeys = [
	'HOME',
	'LOGNAME',
	'PATH',
	'SHELL',
	'TERM',
	'USER',
	'TMPDIR',
	'LANG',
	'DISPLAY',
	'XAUTHORITY',
	'XDG_RUNTIME_DIR',
	'SYSTEMROOT',
	'PROGRAMFILES',
	'PROGRAMFILES(X86)',
	'LOCALAPPDATA',
	'APPDATA',
	'USERPROFILE',
];

/**
 * Build the subprocess environment from the allowed keys that are set.
 */
function forwardedEnvironment(): Record<string, string> {
	const forwarded: Record<string, string> = {};

	for (const key of forwardedEnvironmentKeys) {
		const value = process.env[key];
		if (value !== undefined) {
			forwarded[key] = value;
		}
	}

	return forwarded;
}

/**
 * Resolve a package-relative entry point to a filesystem path.
 *
 * Goes through `fileURLToPath` rather than reading `URL.pathname`. A URL's
 * pathname is percent-encoded, so an install under a directory with a space
 * yields `/home/user/my%20projects/...` and Node cannot load it; on Windows
 * the same property returns `/C:/Users/...`, a leading-slash string that is
 * not a valid path at all. Both forms fail at server startup with an error
 * about a missing module rather than about the real cause.
 *
 * @param packageJsonPath - Absolute path to the package's package.json
 * @param relativeEntry - Entry point as declared in that package's `bin`
 * @returns Absolute filesystem path to the entry point
 */
export function entryPointPath(
	packageJsonPath: string,
	relativeEntry: string,
): string {
	return fileURLToPath(new URL(relativeEntry, pathToFileURL(packageJsonPath)));
}

/**
 * Locate the pinned server's executable entry point.
 */
function resolveServerEntryPoint(): string {
	const require = createRequire(import.meta.url);
	const packageJsonPath = require.resolve(`${serverPackage}/package.json`);
	const packageJson = require(packageJsonPath) as {
		bin?: Record<string, string> | string;
	};

	const binaries = packageJson.bin;
	const relativeEntry =
		typeof binaries === 'string' ? binaries : binaries?.[serverPackage];

	if (!relativeEntry) {
		throw new Error(
			`${serverPackage} does not declare a ${serverPackage} binary; the installed package may be corrupt`,
		);
	}

	return entryPointPath(packageJsonPath, relativeEntry);
}

/**
 * Singleton instance of MCP client
 */
let mcpClientInstance: MCPClient | undefined;

/**
 * Create the browser MCP client for a preflight verdict.
 */
async function createBrowserMCPClient(
	verdict: PreflightVerdict,
	settings: BrowserLaunchSettings,
): Promise<MCPClient> {
	const spec = buildLaunchSpec(verdict, settings);

	try {
		logger.info('Creating browser MCP client', {
			server: serverPackage,
			args: spec.args,
			sandboxRelaxed: verdict.kind === 'ready-without-sandbox',
		});

		const transport = new StdioMCPTransport({
			command: spec.command,
			args: spec.args,
			env: spec.env,
			stderr: spec.stderr,
		});

		const client = await createMCPClient({transport});

		logger.info('Browser MCP client created successfully');

		return client;
	} catch (error) {
		logger.error('Failed to create MCP client', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		throw error;
	}
}

/**
 * Get or create MCP client instance (lazy initialization)
 *
 * Takes the preflight verdict rather than reading it from anywhere global:
 * the same value that decides whether the sandbox is relaxed is the value the
 * disclosure is rendered from, so the two cannot drift apart.
 *
 * **Invariant: preflight runs once per process.** The cache below is keyed on
 * nothing, so a second call with a different verdict would silently reuse the
 * first launch -- including its sandbox decision. Both entry points honour
 * this today (one preflight, then one run, then exit). A retry path in the
 * interactive UI would break it, and should key the cache on the verdict
 * rather than assume. The per-config service cache this comment once warned
 * about is gone: 008 replaced it with explicit per-run instances
 * (`createAIService`), leaving only this transport memoised -- and a run that
 * closes its client releases the memo with it (`resetMCPClient`), so the
 * cache can hold a live connection but never a closed one.
 */
export async function getMCPClient(
	verdict: PreflightVerdict,
	settings: BrowserSettings | undefined,
	createClient: (
		verdict: PreflightVerdict,
		settings: BrowserLaunchSettings,
	) => Promise<MCPClient> = createBrowserMCPClient,
): Promise<MCPClient> {
	logger.debug('Getting MCP client instance', {
		exists: mcpClientInstance !== undefined,
	});

	if (!mcpClientInstance) {
		mcpClientInstance = await createClient(
			verdict,
			resolveBrowserSettings(settings),
		);
		logger.info('MCP client initialized (lazy)');
	}

	return mcpClientInstance;
}

/**
 * Keep only the browser tools the analysis uses.
 *
 * The server re-sends every tool definition -- name, description and full JSON
 * schema -- on every request, so an unused tool is not a one-off cost but one
 * paid per turn, per page, per run. Narrowing here rather than in the prompt
 * is what makes the saving real: a tool merely left unmentioned is still sent.
 *
 * A required tool the server does not offer is a startup failure. The prompt
 * instructs the model to call it, so proceeding would produce a run that fails
 * later for a reason that points somewhere else.
 *
 * @param tools - Everything the server offers
 * @returns Only the required tools
 * @throws Error when a required tool is missing
 */
export function narrowBrowserTools<T extends Record<string, unknown>>(
	tools: T,
): Pick<T, (typeof requiredBrowserTools)[number] & keyof T> {
	const missing = requiredBrowserTools.filter(
		name => !Object.hasOwn(tools, name),
	);

	if (missing.length > 0) {
		throw new Error(
			`The browser server does not offer ${missing.join(' or ')}, which the analysis requires. The server may be a different version than expected.`,
		);
	}

	// Typed as a Pick rather than a Partial: past the throw above every
	// required key is present, and saying so spares each caller a cast that
	// existed only because the signature was looser than the guarantee. The
	// single assertion sits here, where the throw has just established it.
	const narrowed: Record<string, unknown> = {};
	for (const name of requiredBrowserTools) {
		narrowed[name] = tools[name];
	}

	return narrowed as Pick<T, (typeof requiredBrowserTools)[number] & keyof T>;
}

/**
 * Drop the memoised transport.
 *
 * Called by a run that has just closed its client: the memo is process-wide,
 * so a closed handle left in it is handed straight to the next run, which
 * then fails on a transport it never opened. Passing the client makes the
 * release identity-checked -- a run holding an injected transport of its own
 * must not evict the one the process is caching for everyone else. Called
 * without an argument it clears unconditionally, which is what test teardown
 * wants.
 *
 * @param client - The client being released; omit to clear whatever is cached
 */
export function resetMCPClient(client?: MCPClient): void {
	// A redacting client stands for the client it wraps: releasing one
	// releases the other.
	const released = client && (wrappedClients.get(client) ?? client);
	if (released && mcpClientInstance !== released) {
		return;
	}

	mcpClientInstance = undefined;
	logger.debug('MCP client instance reset');
}

/**
 * Fail at startup when the browser server cannot carry out a sign-in.
 *
 * Checked only for a run that signs in, so that a server without these tools
 * goes on serving every run that never needed them.
 *
 * @param tools - Everything the browser server offers
 * @throws When `fill` or `click` is missing, naming each one that is
 */
export function requireSignInTools(tools: Record<string, unknown>): void {
	const missing = requiredSignInTools.filter(
		name => !Object.hasOwn(tools, name),
	);

	if (missing.length > 0) {
		throw new Error(
			`The browser server does not offer ${missing.join(
				' or ',
			)}, which sign-in requires. The server may be a different version than expected.`,
		);
	}
}

/**
 * Wrap a browser client so that nothing it returns carries a secret.
 *
 * @param client - The browser client
 * @param redact - Replaces every secret value in a text
 * @returns A client whose tool results have been redacted
 */
export function redactingClient(
	client: MCPClient,
	redact: Redactor,
): MCPClient {
	const callTool = async (...args: unknown[]): Promise<unknown> => {
		const raw = client as unknown as {
			callTool(...args: unknown[]): Promise<unknown>;
		};
		return redactDeep(
			await redactingRejection(raw.callTool(...args), redact),
			redact,
		);
	};

	const tools = async (...args: unknown[]): Promise<unknown> => {
		const raw = client as unknown as {
			tools(...args: unknown[]): Promise<Record<string, unknown>>;
		};
		const offered = await raw.tools(...args);

		return Object.fromEntries(
			Object.entries(offered).map(([name, tool]) => [
				name,
				redactingTool(tool, redact),
			]),
		);
	};

	const wrapped = new Proxy(client, {
		get(target, property) {
			if (property === 'callTool') {
				return callTool;
			}

			if (property === 'tools') {
				return tools;
			}

			// Everything else is the client's own, called on the client: a
			// method handed over unbound would lose the transport it closes.
			const member: unknown = Reflect.get(target, property, target);
			return typeof member === 'function'
				? (member as (...args: unknown[]) => unknown).bind(target)
				: member;
		},
	});

	wrappedClients.set(wrapped, client);
	return wrapped;
}

/** Each redacting client, and the client it wraps. */
const wrappedClients = new WeakMap<MCPClient, MCPClient>();

/**
 * A tool whose result has been redacted. Its arguments are passed on as they
 * are: signing in has to type the secret.
 *
 * @param tool - A tool the browser server offers
 * @param redact - Replaces every secret value in a text
 * @returns The tool, or what was given when it cannot be executed
 */
function redactingTool(tool: unknown, redact: Redactor): unknown {
	if (!tool || typeof tool !== 'object' || !('execute' in tool)) {
		return tool;
	}

	const {execute} = tool as {
		execute?: (...args: unknown[]) => Promise<unknown>;
	};
	if (typeof execute !== 'function') {
		return tool;
	}

	return {
		...tool,
		execute: async (...args: unknown[]) =>
			redactDeep(await redactingRejection(execute(...args), redact), redact),
	};
}

/**
 * Await a call, and if it is rejected, reject with a redacted message.
 *
 * A server's error can quote what it was asked to type. The original error is
 * not kept as a cause: it is the thing being kept out.
 *
 * @param call - The call in flight
 * @param redact - Replaces every secret value in a text
 * @returns What the call resolved to
 * @throws Error carrying the redacted message
 */
async function redactingRejection(
	call: Promise<unknown>,
	redact: Redactor,
): Promise<unknown> {
	const settled = await Promise.allSettled([call]);
	const [outcome] = settled;

	if (outcome?.status === 'fulfilled') {
		return outcome.value;
	}

	const reason: unknown = outcome?.reason;
	throw new Error(
		redact(reason instanceof Error ? reason.message : String(reason)),
	);
}

/**
 * Redact every string inside a value, keeping its shape.
 *
 * A tool result is walked rather than read by its documented fields: a part
 * of a kind this code has not met must not be the one that carries a secret
 * through.
 *
 * @param value - Anything a tool returned
 * @param redact - Replaces every secret value in a text
 * @returns The same shape with its strings redacted
 */
function redactDeep(value: unknown, redact: Redactor): unknown {
	if (typeof value === 'string') {
		return redact(value);
	}

	if (Array.isArray(value)) {
		return value.map(item => redactDeep(item, redact));
	}

	if (value && typeof value === 'object') {
		// The bytes of a picture or a recording are not text a secret can be
		// read from, and base64 spells short words by accident: replacing one
		// would corrupt the payload.
		const binary =
			'type' in value && (value.type === 'image' || value.type === 'audio');

		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				binary && key === 'data' ? item : redactDeep(item, redact),
			]),
		);
	}

	return value;
}
