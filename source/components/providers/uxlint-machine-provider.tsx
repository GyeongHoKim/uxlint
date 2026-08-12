import process from 'node:process';
import type {ReactNode} from 'react';
import {Text} from 'ink';
import {configIO} from '../../infrastructure/config/config-io.js';
import {logger} from '../../infrastructure/logger.js';
import {isUxLintConfig, type UxLintConfig} from '../../models/config.js';
import {getConfigFormat} from '../../utils/get-config-format.js';
import {UxlintMachineContext} from './uxlint-machine-context.js';

export function UXLintMachineProvider({
	children,
}: {
	readonly children: ReactNode;
}) {
	const configPath = configIO.findConfigFile(process.cwd());
	const isConfigExists = configPath !== undefined;
	let preloadedConfig: UxLintConfig | undefined;
	// Resolved inside the try/catch, rendered outside it: JSX constructed within
	// a try/catch is misleading, because React renders later and the catch would
	// never see a rendering error.
	let configError: string | undefined;

	if (isConfigExists) {
		logger.info('Parse config file', {configPath});
		try {
			const configContent = configIO.readConfigFile(configPath);
			const format = getConfigFormat(configPath);
			const parsed = configIO.parseConfigFile(configContent, format);

			if (isUxLintConfig(parsed)) {
				preloadedConfig = parsed;
				logger.info('Config parsed successfully', {
					configPath,
					mainPageUrl: parsed.mainPageUrl,
					pagesCount: parsed.pages.length,
				});
			} else {
				logger.error('Invalid config file', {configPath});
				configError = 'Invalid config file';
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';
			logger.error('Error parsing config file', {
				configPath,
				error: errorMessage,
			});
			configError = `Error parsing config file: ${errorMessage}`;
		}
	} else {
		logger.info('No config file found, starting wizard', {cwd: process.cwd()});
	}

	if (configError) {
		setTimeout(() => process.exit(1), 1000);
		return <Text color="red">{configError}</Text>;
	}

	return (
		<UxlintMachineContext.Provider
			options={{
				input: {
					interactive: true,
					configExists: isConfigExists,
					config: preloadedConfig,
				},
			}}
		>
			{children}
		</UxlintMachineContext.Provider>
	);
}
