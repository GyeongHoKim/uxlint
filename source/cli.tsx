#!/usr/bin/env node
import process from 'node:process';
import {render, Text} from 'ink';
import meow from 'meow';
import App from './app.js';
import {findConfigFile} from './models/config-io.js';
import {loadEnvConfig} from './models/env-config.js';

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

render(<App mode={mode} />);
