import {useState} from 'react';
import {Box} from 'ink';
import {UserInput, UserInputLabel} from './components/index.js';
import {defaultTheme} from './models/theme.js';

type Props = {
	readonly name?: string;
};

export default function App(_props: Props) {
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
			return {variant: 'loading' as const, loadingText: 'Validating URL...'};
		}

		if (error) {
			return {
				variant: 'error' as const,
				error,
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
			<UserInputLabel
				text="Website URL"
				variant="required"
				theme={defaultTheme}
			/>
			<UserInput
				{...getInputVariant()}
				theme={defaultTheme}
				onValueChange={setInputValue}
				onSubmit={handleSubmit}
			/>
		</Box>
	);
}
