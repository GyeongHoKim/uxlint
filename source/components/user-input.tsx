/**
 * UserInput component - Pure UI component for input interface
 * Provides controlled input with validation states, loading feedback, and keyboard handling
 */

import process from 'node:process';
import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';
import React, {useEffect} from 'react';
import {useKeyboardInput} from '../hooks/use-keyboard-input.js';
import type {ThemeConfig} from '../models/index.js';

/**
 * Base props shared across all variants
 */
export type BaseUserInputProps = {
	readonly placeholder?: string;
	readonly disabled?: boolean;
	readonly loadingText?: string;
	readonly onChange?: (value: string) => void;
	readonly onSubmit?: (value: string) => void;
};

/**
 * Default variant - normal input state
 */
export type DefaultVariant = 'default';

/**
 * Typing variant - active input state with hint
 */
export type TypingVariant = 'typing';

/**
 * Loading variant - spinner with loading text, input disabled
 */
export type LoadingVariant = 'loading';

/**
 * Error variant - error message with input correction capability
 */
export type ErrorVariant = 'error';

/**
 * Discriminated union of all UserInput variants
 */
export type UserInputVariant =
	| DefaultVariant
	| TypingVariant
	| LoadingVariant
	| ErrorVariant;

/**
 * Complete UserInput props combining variant and base props
 */
export type UserInputVariantProps = {
	readonly variant: UserInputVariant;
} & BaseUserInputProps;

/**
 * Type guard to check if variant is interactive (allows input)
 */
export function isInteractive(
	variant: UserInputVariant,
): variant is DefaultVariant | TypingVariant | ErrorVariant {
	return variant !== 'loading';
}

/**
 * Type guard to check if variant shows error state
 */
export function isErrorVariant(
	variant: UserInputVariant,
): variant is ErrorVariant {
	return variant === 'error';
}

/**
 * Type guard to check if variant shows loading state
 */
export function isLoadingVariant(
	variant: UserInputVariant,
): variant is LoadingVariant {
	return variant === 'loading';
}

/**
 * Render default variant - normal input state
 */
function renderDefaultVariant(
	theme: ThemeConfig,
	isTyping: boolean,
	value?: string,
	placeholder?: string,
): React.JSX.Element {
	const displayValue = value ?? '';
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
 * Render typing variant - active input state with hint
 */
function renderTypingVariant(
	theme: ThemeConfig,
	isTyping: boolean,
	value?: string,
	placeholder?: string,
): React.JSX.Element {
	const displayValue = value ?? '';
	const showPlaceholder = !displayValue && !isTyping && placeholder;

	return (
		<Box flexDirection="column" gap={1}>
			<Box>
				<Text color={theme.text.secondary}>{'> '}</Text>
				{showPlaceholder ? (
					<Text color={theme.text.muted}>{placeholder}</Text>
				) : (
					<Text color={theme.text.primary}>{displayValue}</Text>
				)}
			</Box>
			<Text dimColor color={theme.text.muted}>
				Press Enter to submit
			</Text>
		</Box>
	);
}

/**
 * Render loading variant - spinner with loading text, input disabled
 */
function renderLoadingVariant(
	theme: ThemeConfig,
	loadingText?: string,
): React.JSX.Element {
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

/**
 * Render error variant - error message with input correction capability
 */
function renderErrorVariant(
	theme: ThemeConfig,
	isTyping: boolean,
	value?: string,
	placeholder?: string,
	error?: Error,
): React.JSX.Element {
	const displayValue = value ?? '';
	const showPlaceholder = !displayValue && !isTyping && placeholder;
	const displayError = error?.message ?? '';

	return (
		<Box flexDirection="column" gap={1}>
			<Box>
				<Text color={theme.text.secondary}>{'> '}</Text>
				{showPlaceholder ? (
					<Text color={theme.text.muted}>{placeholder}</Text>
				) : (
					<Text color={theme.text.primary}>{displayValue}</Text>
				)}
			</Box>
			<Box>
				<Text color={theme.status.error}>✗ </Text>
				<Text color={theme.status.error}>{displayError}</Text>
			</Box>
		</Box>
	);
}

/**
 * Pure UI component for displaying input interface with variant-based state management
 * Handles visual states and keyboard input without business logic
 */
export function UserInput(
	props: UserInputVariantProps & {readonly theme: ThemeConfig},
) {
	const {
		theme,
		onChange,
		onSubmit,
		disabled,
		variant,
		placeholder,
		loadingText,
	} = props;

	// Always call the hook, but conditionally use its result
	const {isTyping, value} = useKeyboardInput({
		isLoading: variant === 'loading',
		isDisabled: disabled,
		onSubmit,
		onInterrupt() {
			process.exit(0);
		},
	});

	useEffect(() => {
		if (onChange) {
			onChange(value);
		}
	}, [value, onChange]);

	// Switch based on variant type for type-safe rendering
	switch (variant) {
		case 'default': {
			return renderDefaultVariant(theme, isTyping, value, placeholder);
		}

		case 'typing': {
			return renderTypingVariant(theme, isTyping, value, placeholder);
		}

		case 'loading': {
			return renderLoadingVariant(theme, loadingText);
		}

		case 'error': {
			return renderErrorVariant(theme, isTyping, value, placeholder);
		}
	}

	return null;
}
