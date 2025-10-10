import {Box, Text} from 'ink';
import {useState} from 'react';
import {Header, UserInput, UserInputLabel} from './components/index.js';
import {useConfig} from './hooks/index.js';
import {defaultTheme} from './models/theme.js';

export default function App() {
	const [inputValue, setInputValue] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);

	const {status: configStatus, config, error: configError} = useConfig();

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
