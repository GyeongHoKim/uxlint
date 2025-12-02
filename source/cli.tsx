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

// Load config if it exists
let preloadedConfig: UxLintConfig | undefined;
if (configExists && configPath) {
	try {
		// Validate environment for analysis mode (only in non-interactive mode)
		if (!cli.flags.interactive) {
			loadEnvConfig();
		}

		const configContent = readConfigFile(configPath);
		const format = getConfigFormat(configPath);
		const parsed = parseConfigFile(configContent, format);

		if (isUxLintConfig(parsed)) {
			preloadedConfig = parsed;
		} else {
			render(<Text color="red">Error: Invalid configuration file format</Text>);
			process.exit(1);
		}
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error';
		render(<Text color="red">Error: {errorMessage}</Text>);
		process.exit(1);
	}
}

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

// Render App with XState machine context
render(
	<UxlintMachineContext.Provider
		options={{
			input: {
				interactive: cli.flags.interactive,
				configExists,
				config: preloadedConfig,
			},
		}}
	>
		<App />
	</UxlintMachineContext.Provider>,
);
