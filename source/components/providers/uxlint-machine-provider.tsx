import process from 'node:process';
import {Text} from 'ink';
import {configIO} from '../../infrastructure/config/config-io.js';
import {logger} from '../../infrastructure/logger.js';
import {isUxLintConfig, type UxLintConfig} from '../../models/config.js';
import {getConfigFormat} from '../../utils/get-config-format.js';
import {UxlintMachineContext} from './uxlint-machine-context.js';

export function UXLintMachineProvider({
	children,
}: {
	readonly children: React.ReactNode;
}) {
	const configPath = configIO.findConfigFile(process.cwd());
	const configExists = configPath !== undefined;
	let preloadedConfig: UxLintConfig | undefined;
	if (configExists) {
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
				setTimeout(() => process.exit(1), 1000);
				return <Text color="red">Invalid config file</Text>;
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';
			logger.error('Error parsing config file', {
				configPath,
				error: errorMessage,
			});
			setTimeout(() => process.exit(1), 1000);
			return <Text color="red">Error parsing config file: {errorMessage}</Text>;
		}
	} else {
		logger.info('No config file found, starting wizard', {cwd: process.cwd()});
	}

	return (
		<UxlintMachineContext.Provider
			options={{
				input: {
					interactive: true,
					configExists,
					config: preloadedConfig,
				},
			}}
		>
			{children}
		</UxlintMachineContext.Provider>
	);
}
