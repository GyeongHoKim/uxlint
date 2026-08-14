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
import {logger} from './infrastructure/logger.js';
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

	Options
	  --interactive, -i  Use interactive mode to create configuration
	  --version, -v      Show version
	  --help, -h         Show help

	Examples
	  $ uxlint --interactive
	  $ uxlint
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

// Auth Commands
const authCommand = cli.input[0];
if (authCommand === 'auth') {
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
} else if (cli.flags.interactive) {
	logger.info('Interactive mode selected');
	render(
		<UXLintMachineProvider>
			<App />
		</UXLintMachineProvider>,
	);
} else {
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
	if (!hasConfig || !configPath) {
		logger.error('Configuration file not found in CI mode', {
			cwd: process.cwd(),
			searchedFiles: ['.uxlintrc.json', '.uxlintrc.yml', '.uxlintrc.yaml'],
		});
		writeTerminalMessage(
			'uxlint: no .uxlintrc.json, .uxlintrc.yml or .uxlintrc.yaml found in this directory',
		);
		process.exitCode = 1;
	} else {
		// Load and validate config
		try {
			logger.debug('Reading config file', {configPath});
			const configContent = configIO.readConfigFile(configPath);
			const format = getConfigFormat(configPath);
			const raw = configIO.parseConfigFile(configContent, format);

			// Use validateConfig, not the isUxLintConfig type guard. The guard is
			// structural and knows nothing about thresholds, so a misspelled key
			// would sail through it and leave the user with a gate they think
			// exists but does not. validateConfig also names the offending field,
			// which is what makes a rejection actionable.
			const parsed = configIO.validateConfig(raw, configPath);

			logger.info('Config loaded successfully', {
				configPath,
				mainPageUrl: parsed.mainPageUrl,
				pagesCount: parsed.pages.length,
				hasThresholds: parsed.thresholds !== undefined,
			});

			process.exitCode = await runCIAnalysis(parsed);
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
