import {useState} from 'react';
import {Box} from 'ink';
import {Header, UserInput, UserInputLabel} from './components/index.js';
import {defaultTheme} from './models/theme.js';

export default function App() {
	const [inputValue, setInputValue] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);

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
