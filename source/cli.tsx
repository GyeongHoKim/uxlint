#!/usr/bin/env node
import process from 'node:process';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';
import {runCIAnalysis} from './ci-runner.js';
import {AuthFlow} from './components/auth/auth-flow.js';
import {UXLintClientProvider} from './components/providers/uxlint-client-provider.js';
import {UXLintMachineProvider} from './components/providers/uxlint-machine-provider.js';
import {uxlintClient} from './infrastructure/auth/uxlint-client-base.js';
import {writeTerminalMessage} from './infrastructure/console-output.js';
import {configIO} from './infrastructure/config/config-io.js';
import {serveJudgement} from './delegate/mcp-server.js';
import {runDrivenCommand} from './delegate/driven/command.js';
import {runDelegatedAnalysis} from './delegate/runner.js';
import {selectHostAgent} from './delegate/host/index.js';
import {logger} from './infrastructure/logger.js';
import type {UxLintConfig} from './models/config.js';
import {getConfigFormat} from './utils/get-config-format.js';

const cli = meow(
	`
	Usage
	  $ uxlint [options]
	  $ uxlint auth <command>

	Auth Commands
	  login              Authenticate with UXLint Cloud
	  logout             Log out from UXLint Cloud
	  status             Show current authentication status

	Agent Commands
	  delegate capture   Open, capture and measure every configured page, then
	                     print the run identity and page list
	  delegate evidence  Print a run's captured evidence, all pages or one
	  delegate submit    Record an agent's judgement, write the report and
	                     report the gate verdict
	  delegate runs      List runs that exist and how far each got
	  delegate discard   Delete one run

	Internal Commands
	  mcp-serve          Serve judgement tools to a host agent during a
	                     delegated run. Started by uxlint, not by hand.

	Options
	  --interactive, -i  Use interactive mode to create configuration
	  --delegate         Hand the UX judgement to a coding agent CLI you
	                     already run, so uxlint needs no model API key
	  --host-agent       Which agent judges a delegated run
	                     (claude-code, codex)
	  --run              Which run an agent command acts on
	  --page             Limit delegate evidence to one page URL
	  --file             Judgement document to submit; omit or - for stdin
	  --version, -v      Show version
	  --help, -h         Show help

	Examples
	  $ uxlint --interactive
	  $ uxlint
	  $ uxlint --delegate
	  $ uxlint delegate capture
	  $ uxlint auth login
	  $ uxlint auth status
	  $ uxlint auth logout
`,
	{
		importMeta: import.meta,
		flags: {
			interactive: {
				type: 'boolean',
				shortFlag: 'i',
				default: false,
			},
			// Deliberately a flag rather than a configuration key. `.uxlintrc.yml`
			// is committed and read by continuous integration, so putting delegate
			// mode there would make one developer's local choice everybody's
			// pipeline behaviour.
			delegate: {
				type: 'boolean',
				default: false,
			},
			hostAgent: {
				type: 'string',
			},
			// The agent-driven route's arguments. `--run` is the handle `delegate
			// capture` prints and every later verb requires: without it a command
			// would have to guess which review it belongs to, and a command that
			// guesses writes findings into somebody else's report.
			run: {
				type: 'string',
			},
			page: {
				type: 'string',
			},
			file: {
				type: 'string',
			},
		},
	},
);

// Check for existing config file
const configPath = configIO.findConfigFile(process.cwd());
const hasConfig = configPath !== undefined;

// Log application startup
logger.info('UXLint started', {
	interactive: cli.flags.interactive,
	cwd: process.cwd(),
	configExists: hasConfig,
});

// Register exit handlers for logging shutdown
process.on('exit', code => {
	logger.info('UXLint exiting', {
		exitCode: code,
		interactive: cli.flags.interactive,
	});
});

// Handle uncaught errors
process.on('uncaughtException', error => {
	logger.error('Uncaught exception', {
		error: error.message,
		stack: error.stack,
	});
	process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
	logger.error('Unhandled rejection', {
		reason: reason instanceof Error ? reason.message : String(reason),
	});
	process.exit(1);
});

/**
 * Run a review whose judgement a host agent performs.
 *
 * Selection happens before anything else, so a missing or unprepared agent
 * costs no capture pass. Both messages below are written before any MCP
 * transport exists -- see console-output.ts.
 *
 * @param config - Validated configuration for this run
 * @param requested - The agent named on the command line, if any
 * @returns The exit code for the run
 */
async function delegate(
	config: UxLintConfig,
	requested: string | undefined,
): Promise<number> {
	const selection = await selectHostAgent(requested);

	if (selection.kind === 'unavailable') {
		writeTerminalMessage(selection.message);
		return 1;
	}

	writeTerminalMessage(selection.message);

	return runDelegatedAnalysis(config, {adapter: selection.adapter});
}

/**
 * Read, parse and validate the configuration for this directory.
 *
 * Shared by the CI path and by the agent-driven commands, which both need a
 * validated configuration and must reject the same files for the same reasons.
 *
 * @returns The validated configuration
 * @throws Error when no configuration exists or it does not validate
 */
function loadConfig(): UxLintConfig {
	if (!hasConfig || !configPath) {
		logger.error('Configuration file not found', {
			cwd: process.cwd(),
			searchedFiles: ['.uxlintrc.json', '.uxlintrc.yml', '.uxlintrc.yaml'],
		});
		throw new Error(
			'no .uxlintrc.json, .uxlintrc.yml or .uxlintrc.yaml found in this directory',
		);
	}

	logger.debug('Reading config file', {configPath});
	const configContent = configIO.readConfigFile(configPath);
	const format = getConfigFormat(configPath);
	const raw = configIO.parseConfigFile(configContent, format);

	// Use validateConfig, not the isUxLintConfig type guard. The guard is
	// structural and knows nothing about thresholds, so a misspelled key would
	// sail through it and leave the user with a gate they think exists but does
	// not. validateConfig also names the offending field, which is what makes a
	// rejection actionable.
	const parsed = configIO.validateConfig(raw, configPath);

	logger.info('Config loaded successfully', {
		configPath,
		mainPageUrl: parsed.mainPageUrl,
		pagesCount: parsed.pages.length,
		hasThresholds: parsed.thresholds !== undefined,
	});

	return parsed;
}

/**
 * The verbs of the agent-driven route.
 *
 * Named here so an unknown one is refused by name rather than falling through
 * to a review the developer did not ask for.
 */
const drivenVerbs = new Set([
	'capture',
	'evidence',
	'submit',
	'runs',
	'discard',
]);

// The command, when one was given. A switch rather than a chain of else-ifs:
// three of the four branches key off this one value, and the fourth is the
// absence of it.
const authCommand = cli.input[0];

switch (authCommand ?? '') {
	case 'mcp-serve': {
		// The judgement server behind delegate mode. A host agent spawns this; it
		// is not meant to be typed at a prompt. Two rules hold for the whole
		// branch: it renders no Ink, and its stdout carries JSON-RPC and nothing
		// else -- so no failure here may reach console-output.ts, however tempting
		// it is to tell somebody what went wrong.
		try {
			await serveJudgement(process.env);
		} catch (error) {
			logger.error('Judgement server could not start', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			process.exitCode = 1;
		}

		break;
	}

	case 'delegate': {
		// The agent-driven route. uxlint launches nothing here: the agent the
		// developer is already working inside runs these commands itself, which is
		// why none of them knows or cares which agent is calling.
		//
		// Ink is deliberately not rendered on any of them. The caller is a program
		// parsing the stream, and a frame in the middle of a payload is a parse
		// error rather than a cosmetic problem.
		const verb = cli.input[1];

		if (verb === undefined || !drivenVerbs.has(verb)) {
			const named = verb === undefined ? 'no command' : `\`${verb}\``;
			writeTerminalMessage(
				`uxlint: ${named} after \`delegate\`. The commands are: ${[...drivenVerbs].join(', ')}.`,
			);
			process.exitCode = 1;
		} else {
			logger.info('Agent-driven command invoked', {verb});
			process.exitCode = await runDrivenCommand(verb, {
				run: cli.flags.run,
				page: cli.flags.page,
				file: cli.flags.file,
				loadConfig,
			});
		}

		break;
	}

	case 'auth': {
		const subcommand = cli.input[1];
		logger.info('Auth command invoked', {subcommand});

		// Handle Ctrl+C (SIGINT) gracefully during auth commands
		const handleAuthInterrupt = () => {
			logger.info('Auth command interrupted by user (Ctrl+C)');
			// Exit with code 130 (128 + 2, where 2 is SIGINT signal number)
			process.exit(130);
		};

		process.once('SIGINT', handleAuthInterrupt);

		render(
			<UXLintClientProvider uxlintClientImpl={uxlintClient}>
				<AuthFlow command={subcommand} onAuthError={handleAuthInterrupt} />
			</UXLintClientProvider>,
		);
		break;
	}

	default: {
		if (cli.flags.interactive && !cli.flags.delegate) {
			logger.info('Interactive mode selected');
			render(
				<UXLintMachineProvider>
					<App />
				</UXLintMachineProvider>,
			);
			break;
		}

		// CI Mode: Run without UI
		logger.info('CI mode selected');

		// CI mode - no config file = error.
		//
		// Every exit below sets process.exitCode rather than calling
		// process.exit. The log file is the only output channel this tool has --
		// stdout belongs to MCP -- and Winston's rotating file transport writes
		// asynchronously, so process.exit killed the process before the entry
		// reached disk. A CI failure then left no trace anywhere. Setting the code
		// and letting Node exit once the loop drains keeps the log intact.
		try {
			const parsed = loadConfig();

			process.exitCode = cli.flags.delegate
				? await delegate(parsed, cli.flags.hostAgent)
				: await runCIAnalysis(parsed);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';
			logger.error('CI mode failed', {
				error: errorMessage,
				stack: error instanceof Error ? error.stack : undefined,
				configPath,
			});

			// Printed as well as logged: in CI the log file is discarded with the
			// container. No MCP transport exists yet -- see console-output.ts.
			writeTerminalMessage(`uxlint: ${errorMessage}`);
			process.exitCode = 1;
		}
	}
}
