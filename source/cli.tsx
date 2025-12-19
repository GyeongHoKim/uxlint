#!/usr/bin/env node
import process from 'node:process';
import {config as dotenvConfig} from 'dotenv';
import {Box, render, Text} from 'ink';
import meow from 'meow';
import App from './app.js';
import {runCIAnalysis} from './ci-runner.js';
import {AuthStatus, LoginFlow} from './components/auth/index.js';
import {UxlintMachineContext} from './contexts/uxlint-context.js';
import {getUXLintClient} from './infrastructure/auth/uxlint-client.js';
import {configIO} from './infrastructure/config/config-io.js';
import {logger} from './infrastructure/logger.js';
import {isUxLintConfig, type UxLintConfig} from './models/config.js';

dotenvConfig({quiet: true});

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

	// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
	switch (subcommand) {
		case 'login': {
			render(
				<LoginFlow
					onComplete={profile => {
						logger.info('Login successful', {
							email: profile.email,
							name: profile.name,
						});
						process.exit(0);
					}}
					onError={error => {
						logger.error('Login failed', {
							error: error.message,
						});
						process.exit(1);
					}}
				/>,
			);
			break;
		}

		case 'status': {
			render(
				<AuthStatus
					onComplete={() => {
						process.exit(0);
					}}
				/>,
			);
			break;
		}

		case 'logout': {
			const handleLogout = async () => {
				try {
					const client = getUXLintClient();
					await client.logout();
					render(
						<Box>
							<Text color="green">✓ Logged out successfully</Text>
						</Box>,
					);
					logger.info('Logout successful');
					setTimeout(() => process.exit(0), 100);
				} catch (error_: unknown) {
					const errorMessage =
						error_ instanceof Error ? error_.message : 'Unknown error';
					render(
						<Box>
							<Text color="red">✗ Logout failed: {errorMessage}</Text>
						</Box>,
					);
					logger.error('Logout failed', {error: errorMessage});
					setTimeout(() => process.exit(1), 100);
				}
			};

			void handleLogout();
			break;
		}

		default: {
			render(
				<Box flexDirection="column">
					<Text color="red">
						Unknown auth command: {subcommand ?? '(none)'}
					</Text>
					<Text>Available commands: login, logout, status</Text>
				</Box>,
			);
			process.exit(1);
		}
	}
} else if (cli.flags.interactive) {
	// Interactive Mode: Use Ink UI
	logger.info('Interactive mode selected');
	let preloadedConfig: UxLintConfig | undefined;

	if (configExists && configPath) {
		logger.debug('Loading existing config for interactive mode', {configPath});
		try {
			const configContent = configIO.readConfigFile(configPath);
			const format = getConfigFormat(configPath);
			const parsed = configIO.parseConfigFile(configContent, format);

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
