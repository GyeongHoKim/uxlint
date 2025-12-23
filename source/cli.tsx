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
import {configIO} from './infrastructure/config/config-io.js';
import {logger} from './infrastructure/logger.js';
import {isUxLintConfig} from './models/config.js';
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
const configExists = configPath !== undefined;

// Log application startup
logger.info('UXLint started', {
	interactive: cli.flags.interactive,
	cwd: process.cwd(),
	configExists,
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

	// CI mode - no config file = error
	if (!configExists || !configPath) {
		logger.error('Configuration file not found in CI mode', {
			cwd: process.cwd(),
			searchedFiles: ['.uxlintrc.json', '.uxlintrc.yml', '.uxlintrc.yaml'],
		});
		process.exit(1);
	}

	// Load and validate config
	try {
		logger.debug('Reading config file', {configPath});
		const configContent = configIO.readConfigFile(configPath);
		const format = getConfigFormat(configPath);
		const parsed = configIO.parseConfigFile(configContent, format);

		if (!isUxLintConfig(parsed)) {
			logger.error('Invalid configuration file format', {configPath});
			process.exit(1);
		}

		logger.info('Config loaded successfully', {
			configPath,
			mainPageUrl: parsed.mainPageUrl,
			pagesCount: parsed.pages.length,
		});

		// Run CI analysis without UI
		void runCIAnalysis(parsed);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error';
		logger.error('Failed to load config in CI mode', {
			error: errorMessage,
			configPath,
		});
		process.exit(1);
	}
}
