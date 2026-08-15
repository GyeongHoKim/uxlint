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
import type {PreflightVerdict} from '../models/browser-preflight.js';

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
 */
export async function getMCPClient(
	verdict: PreflightVerdict,
	settings: BrowserSettings | undefined,
): Promise<MCPClient> {
	logger.debug('Getting MCP client instance', {
		exists: mcpClientInstance !== undefined,
	});

	if (!mcpClientInstance) {
		mcpClientInstance = await createBrowserMCPClient(
			verdict,
			resolveBrowserSettings(settings),
		);
		logger.info('MCP client initialized (lazy)');
	}

	return mcpClientInstance;
}

/**
 * Reset MCP client instance (useful for testing)
 */
export function resetMCPClient(): void {
	mcpClientInstance = undefined;
	logger.debug('MCP client instance reset');
}
