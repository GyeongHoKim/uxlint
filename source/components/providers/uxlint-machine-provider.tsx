import process from 'node:process';
import type {ReactNode} from 'react';
import {Text} from 'ink';
import {configIO} from '../../infrastructure/config/config-io.js';
import {logger} from '../../infrastructure/logger.js';
import {type UxLintConfig} from '../../models/config.js';
import {getConfigFormat} from '../../utils/get-config-format.js';
import {UxlintMachineContext} from './uxlint-machine-context.js';

export function UXLintMachineProvider({
	children,
}: {
	readonly children: ReactNode;
}) {
	const configPath = configIO.findConfigFile(process.cwd());
	const hasConfig = configPath !== undefined;
	let preloadedConfig: UxLintConfig | undefined;
	// Resolved inside the try/catch, rendered outside it: JSX constructed within
	// a try/catch is misleading, because React renders later and the catch would
	// never see a rendering error.
	let configError: string | undefined;

	if (hasConfig) {
		logger.info('Parse config file', {configPath});
		try {
			const configContent = configIO.readConfigFile(configPath);
			const format = getConfigFormat(configPath);
			const parsed = configIO.parseConfigFile(configContent, format);

			// Use validateConfig, not the isUxLintConfig guard. The guard is
			// structural and knows nothing about thresholds, so a typo'd key
			// would be accepted here and produce a misleading advisory verdict
			// while the same file is rejected outright in CI mode. Both paths
			// have to read a threshold the same way, which is the whole point
			// of showing the verdict in interactive mode at all.
			preloadedConfig = configIO.validateConfig(parsed, configPath);
			logger.info('Config parsed successfully', {
				configPath,
				mainPageUrl: preloadedConfig.mainPageUrl,
				pagesCount: preloadedConfig.pages.length,
				hasThresholds: preloadedConfig.thresholds !== undefined,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';
			logger.error('Invalid config file', {
				configPath,
				error: errorMessage,
			});
			configError = errorMessage;
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
					configExists: hasConfig,
					config: preloadedConfig,
				},
			}}
		>
			{children}
		</UxlintMachineContext.Provider>
	);
}
