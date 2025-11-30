#!/usr/bin/env node
import process from 'node:process';
import {render, Text} from 'ink';
import meow from 'meow';
import App from './app.js';
import {findConfigFile} from './infrastructure/config/config-io.js';
import {loadEnvConfig} from './infrastructure/config/env-config.js';
import {logger} from './infrastructure/logger.js';

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

// Check for existing config file
const configExists = findConfigFile(process.cwd()) !== undefined;

// Determine mode: analysis (config + not interactive) | interactive | normal
let mode: 'analysis' | 'interactive' | 'normal';

if (configExists && !cli.flags.interactive) {
	// Analysis mode: config exists and interactive not requested
	mode = 'analysis';

	// Validate environment for analysis mode
	try {
		loadEnvConfig();
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error';
		render(<Text color="red">Error: {errorMessage}</Text>);
		process.exit(1);
	}
} else if (cli.flags.interactive || !configExists) {
	// Interactive mode: explicitly requested OR no config
	mode = 'interactive';
} else {
	// Normal mode: fallback
	mode = 'normal';
}

// Log application startup
logger.info('UXLint started', {
	mode,
	cwd: process.cwd(),
	configExists,
});

// Register exit handlers for logging shutdown
process.on('exit', code => {
	logger.info('UXLint exiting', {
		exitCode: code,
		mode,
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

render(<App mode={mode} />);
