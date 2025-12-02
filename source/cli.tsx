#!/usr/bin/env node
import process from 'node:process';
import {render, Text} from 'ink';
import meow from 'meow';
import App from './app.js';
import {UxlintMachineContext} from './contexts/uxlint-context.js';
import {
	findConfigFile,
	readConfigFile,
	parseConfigFile,
} from './infrastructure/config/config-io.js';
import {loadEnvConfig} from './infrastructure/config/env-config.js';
import {logger} from './infrastructure/logger.js';
import {isUxLintConfig, type UxLintConfig} from './models/config.js';
import {runCIAnalysis} from './ci-runner.js';

const cli = meow(
	`
	Usage
	  $ uxlint [options]

	Options
	  --interactive, -i  Use interactive mode to create configuration
	  --version, -v      Show version
	  --help, -h         Show help

	Examples
	  $ uxlint --interactive
	  $ uxlint
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

/**
 * Detect config file format from path
 */
function getConfigFormat(path: string): 'json' | 'yaml' | 'yml' {
	if (path.endsWith('.json')) {
		return 'json';
	}

	if (path.endsWith('.yaml')) {
		return 'yaml';
	}

	return 'yml';
}

// Check for existing config file
const configPath = findConfigFile(process.cwd());
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

// Interactive Mode: Use Ink UI
if (cli.flags.interactive) {
	logger.info('Interactive mode selected');
	let preloadedConfig: UxLintConfig | undefined;

	if (configExists && configPath) {
		logger.debug('Loading existing config for interactive mode', {configPath});
		try {
			const configContent = readConfigFile(configPath);
			const format = getConfigFormat(configPath);
			const parsed = parseConfigFile(configContent, format);

			if (isUxLintConfig(parsed)) {
				preloadedConfig = parsed;
				logger.info('Config preloaded for interactive mode', {
					configPath,
					mainPageUrl: parsed.mainPageUrl,
					pagesCount: parsed.pages.length,
				});
			} else {
				logger.error('Invalid configuration file format', {configPath});
				render(
					<Text color="red">Error: Invalid configuration file format</Text>,
				);
				process.exit(1);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';
			logger.error('Failed to load config', {error: errorMessage, configPath});
			render(<Text color="red">Error: {errorMessage}</Text>);
			process.exit(1);
		}
	} else {
		logger.info('No existing config found, starting wizard');
	}

	// Render App with XState machine context (Interactive mode only)
	logger.debug('Rendering interactive UI');
	render(
		<UxlintMachineContext.Provider
			options={{
				input: {
					interactive: true,
					configExists,
					config: preloadedConfig,
				},
			}}
		>
			<App />
		</UxlintMachineContext.Provider>,
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
		console.error(
			'Error: Configuration file not found. Use --interactive flag to create one, or create .uxlintrc.yml or .uxlintrc.json in the current directory.',
		);
		process.exit(1);
	}

	// Load and validate config
	try {
		logger.debug('Loading environment config');
		loadEnvConfig();

		logger.debug('Reading config file', {configPath});
		const configContent = readConfigFile(configPath);
		const format = getConfigFormat(configPath);
		const parsed = parseConfigFile(configContent, format);

		if (!isUxLintConfig(parsed)) {
			logger.error('Invalid configuration file format', {configPath});
			console.error('Error: Invalid configuration file format');
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
		console.error(`Error: ${errorMessage}`);
		process.exit(1);
	}
}
