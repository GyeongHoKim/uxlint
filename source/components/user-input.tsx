/**
 * UserInput component - Pure UI component for input interface
 * Provides controlled input with validation states, loading feedback, and keyboard handling
 */

import {Text, Box} from 'ink';
import Spinner from 'ink-spinner';
import type {ThemeConfig} from '../models/index.js';
import {useKeyboardInput} from '../hooks/use-keyboard-input.js';

export type UserInputProps = {
	readonly value: string;
	readonly prompt?: string;
	readonly placeholder?: string;
	readonly error?: string;
	readonly isLoading?: boolean;
	readonly loadingText?: string;
	readonly theme: ThemeConfig;
	readonly onChange: (value: string) => void;
	readonly onSubmit: () => void;
};

/**
 * Render the input field
 */
function InputField({
	value,
	placeholder,
	isTyping,
	theme,
}: {
	readonly value: string;
	readonly placeholder?: string;
	readonly isTyping: boolean;
	readonly theme: ThemeConfig;
}) {
	const displayValue = value || '';
	const showPlaceholder = !displayValue && !isTyping && placeholder;

	return (
		<Box>
			<Text color={theme.text.secondary}>{'> '}</Text>
			{showPlaceholder ? (
				<Text color={theme.text.muted}>{placeholder}</Text>
			) : (
				<Text color={theme.text.primary}>{displayValue}</Text>
			)}
		</Box>
	);
}

/**
 * Render status messages (loading, error, typing hint)
 */
function StatusMessages({
	isLoading,
	loadingText,
	error,
	isTyping,
	theme,
}: {
	readonly isLoading: boolean;
	readonly loadingText: string;
	readonly error?: string;
	readonly isTyping: boolean;
	readonly theme: ThemeConfig;
}) {
	if (isLoading) {
		return (
			<Box>
				<Text color={theme.accent}>
					<Spinner type="dots" />
				</Text>
				<Text> </Text>
				<Text color={theme.text.secondary}>{loadingText}</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box>
				<Text color={theme.status.error}>✗ </Text>
				<Text color={theme.status.error}>{error}</Text>
			</Box>
		);
	}

	if (isTyping) {
		return (
			<Text dimColor color={theme.text.muted}>
				Press Enter to submit
			</Text>
		);
	}

	return null;
}

/**
 * Pure UI component for displaying input interface
 * Handles visual states and keyboard input without business logic
 */
export function UserInput({
	value,
	prompt = 'Enter URL to analyze:',
	placeholder = 'https://example.com',
	error,
	isLoading = false,
	loadingText = 'Validating...',
	theme,
	onChange,
	onSubmit,
}: UserInputProps) {
	const {isTyping} = useKeyboardInput({isLoading, value, onChange, onSubmit});

	return (
		<Box flexDirection="column" gap={1}>
			<Text bold color={theme.primary}>
				{prompt}
			</Text>

			<InputField
				isTyping={isTyping}
				placeholder={placeholder}
				theme={theme}
				value={value}
			/>

			<StatusMessages
				error={error}
				isLoading={isLoading}
				isTyping={Boolean(isTyping && !isLoading && !error)}
				loadingText={loadingText}
				theme={theme}
			/>
		</Box>
	);
}
