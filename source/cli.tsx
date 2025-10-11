#!/usr/bin/env node
import process from 'node:process';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';
import {findConfigFile} from './models/config-io.js';

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

// Determine if we should use interactive mode
// Use interactive if: explicitly requested OR no config file exists
const useInteractive = cli.flags.interactive || !configExists;

render(<App mode={useInteractive ? 'interactive' : 'normal'} />);
