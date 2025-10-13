import process from 'node:process';
import {config as dotenvConfig} from 'dotenv';
import {Box, Text} from 'ink';
import {useState} from 'react';
import {
	AnalysisRunner,
	ConfigWizard,
	Header,
	UserInput,
	UserInputLabel,
} from './components/index.js';
import {useConfig} from './hooks/index.js';
import type {UxLintConfig} from './models/config.js';
import {defaultTheme} from './models/theme.js';

/**
 * App props
 */
export type AppProps = {
	readonly mode?: 'normal' | 'interactive' | 'analysis';
};

// Load environment variables from .env file
dotenvConfig();

/**
 * Main App component
 */
export default function App({mode = 'normal'}: AppProps) {
	const [inputValue, setInputValue] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);

	const {status: configStatus, config, error: configError} = useConfig();

	// Render analysis mode
	if (mode === 'analysis') {
		// Show loading state while config is being loaded
		if (configStatus === 'loading') {
			return (
				<Box flexDirection="column" gap={1}>
					<Header theme={defaultTheme} />
					<Text color="yellow">Loading configuration...</Text>
				</Box>
			);
		}

		// Show error if config failed to load
		if (configStatus === 'error' || !config) {
			return (
				<Box flexDirection="column" gap={1}>
					<Header theme={defaultTheme} />
					<Text color="red">
						Configuration Error: {configError?.message ?? 'Config not found'}
					</Text>
				</Box>
			);
		}

		// Run analysis with loaded config
		return (
			<Box flexDirection="column" gap={1}>
				<Header theme={defaultTheme} />
				<AnalysisRunner theme={defaultTheme} config={config} />
			</Box>
		);
	}

	// Render interactive wizard mode
	if (mode === 'interactive') {
		return (
			<ConfigWizard
				theme={defaultTheme}
				onComplete={(_config: UxLintConfig) => {
					// Config created successfully
					// In the future, this could automatically start the analysis
					process.exit(0);
				}}
				onCancel={() => {
					process.exit(0);
				}}
			/>
		);
	}

	// Normal mode - existing functionality
	const handleSubmit = (value: string) => {
		if (!value.trim()) {
			setError('URL is required');
			return;
		}

		setError(undefined);
		setIsLoading(true);

		// Simulate async validation
		setTimeout(() => {
			setIsLoading(false);
			if (!value.startsWith('http')) {
				setError('Please enter a valid URL starting with http');
			}
		}, 2000);
	};

	const getInputVariant = () => {
		if (isLoading) {
			return {
				variant: 'loading' as const,
				loadingText: 'Validating URL...',
				value: inputValue,
			};
		}

		if (error) {
			return {
				variant: 'error' as const,
				error: new Error(error),
				value: inputValue,
				placeholder: 'Enter a URL',
			};
		}

		return {
			variant: 'default' as const,
			value: inputValue,
			placeholder: 'Enter a URL',
		};
	};

	return (
		<Box flexDirection="column" gap={1}>
			<Header theme={defaultTheme} />

			{/* Configuration Status */}
			{configStatus === 'loading' && (
				<Box>
					<Text color="yellow">Loading configuration...</Text>
				</Box>
			)}

			{configStatus === 'error' && Boolean(configError) && (
				<Box>
					<Text color="red">Configuration Error: {configError.message}</Text>
				</Box>
			)}

			{configStatus === 'success' && Boolean(config) && (
				<Box flexDirection="column" gap={0}>
					<Text color="green">✓ Configuration loaded successfully</Text>
					<Text dimColor>Main Page: {config.mainPageUrl}</Text>
					<Text dimColor>
						Pages: {config.pages.length} | Personas: {config.personas.length}
					</Text>
				</Box>
			)}

			{/* URL Input */}
			<UserInputLabel
				text="Website URL"
				variant="required"
				theme={defaultTheme}
			/>
			<UserInput
				{...getInputVariant()}
				theme={defaultTheme}
				onChange={setInputValue}
				onSubmit={handleSubmit}
			/>
			{/** 옵션 목록들 보여줘야 함 */}
		</Box>
	);
}
