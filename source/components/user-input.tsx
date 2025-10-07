/**
 * UserInput component - Pure UI component for input interface
 * Provides controlled input with validation states, loading feedback, and keyboard handling
 */

import React from 'react';
import {Text, Box} from 'ink';
import Spinner from 'ink-spinner';
import type {ThemeConfig} from '../models/index.js';
import {useKeyboardInput} from '../hooks/use-keyboard-input.js';

/**
 * Base props shared across all variants
 */
export type BaseUserInputProps = {
	readonly onValueChange?: (value: string) => void;
	readonly onSubmit?: (value: string) => void;
	readonly disabled?: boolean;
};

/**
 * Default variant - normal input state
 */
export type DefaultVariant = {
	readonly variant: 'default';
	readonly value: string;
	readonly placeholder?: string;
};

/**
 * Typing variant - active input state with hint
 */
export type TypingVariant = {
	readonly variant: 'typing';
	readonly value: string;
	readonly placeholder?: string;
};

/**
 * Loading variant - spinner with loading text, input disabled
 */
export type LoadingVariant = {
	readonly variant: 'loading';
	readonly loadingText: string;
};

/**
 * Error variant - error message with input correction capability
 */
export type ErrorVariant = {
	readonly variant: 'error';
	readonly error: string;
	readonly value: string;
	readonly placeholder?: string;
};

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
export type UserInputVariantProps = UserInputVariant & BaseUserInputProps;

/**
 * Type guard to check if variant has value property
 */
export function hasValue(
	variant: UserInputVariant,
): variant is DefaultVariant | TypingVariant | ErrorVariant {
	return 'value' in variant;
}

/**
 * Type guard to check if variant has placeholder property
 */
export function hasPlaceholder(
	variant: UserInputVariant,
): variant is DefaultVariant | TypingVariant | ErrorVariant {
	return 'placeholder' in variant;
}

/**
 * Type guard to check if variant is interactive (allows input)
 */
export function isInteractive(
	variant: UserInputVariant,
): variant is DefaultVariant | TypingVariant | ErrorVariant {
	return variant.variant !== 'loading';
}

/**
 * Type guard to check if variant shows error state
 */
export function isErrorVariant(
	variant: UserInputVariant,
): variant is ErrorVariant {
	return variant.variant === 'error';
}

/**
 * Type guard to check if variant shows loading state
 */
export function isLoadingVariant(
	variant: UserInputVariant,
): variant is LoadingVariant {
	return variant.variant === 'loading';
}

// Old UserInputProps removed - now using UserInputVariantProps

/**
 * Keyboard state from useKeyboardInput hook
 */
type KeyboardState = {
	readonly isTyping: boolean;
};

/**
 * Render default variant - normal input state
 */
function renderDefaultVariant(
	variant: DefaultVariant,
	theme: ThemeConfig,
	keyboardState: KeyboardState,
): React.JSX.Element {
	const {value, placeholder} = variant;
	const {isTyping} = keyboardState;

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
 * Render typing variant - active input state with hint
 */
function renderTypingVariant(
	variant: TypingVariant,
	theme: ThemeConfig,
	keyboardState: KeyboardState,
): React.JSX.Element {
	const {value, placeholder} = variant;
	const {isTyping} = keyboardState;

	const displayValue = value || '';
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
	variant: LoadingVariant,
	theme: ThemeConfig,
): React.JSX.Element {
	const {loadingText} = variant;

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
	variant: ErrorVariant,
	theme: ThemeConfig,
	keyboardState: KeyboardState,
): React.JSX.Element {
	const {error, value, placeholder} = variant;
	const {isTyping} = keyboardState;

	const displayValue = value || '';
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
			<Box>
				<Text color={theme.status.error}>✗ </Text>
				<Text color={theme.status.error}>{error}</Text>
			</Box>
		</Box>
	);
}

/**
 * Pure UI component for displaying input interface with variant-based state management
 * Handles visual states and keyboard input without business logic
 */
export function UserInput(props: UserInputVariantProps & {theme: ThemeConfig}) {
	const {theme, onValueChange, onSubmit, disabled, ...variant} = props;

	// Always call the hook, but conditionally use its result
	const keyboardState = useKeyboardInput({
		isLoading: variant.variant === 'loading',
		value: hasValue(variant) ? variant.value : '',
		onChange:
			onValueChange ??
			(() => {
				// No-op default handler
			}),
		onSubmit() {
			if (hasValue(variant) && onSubmit) {
				onSubmit(variant.value);
			}
		},
	});

	// For loading variant, ignore keyboard state
	const effectiveKeyboardState =
		variant.variant === 'loading' ? {isTyping: false} : keyboardState;

	// Switch based on variant type for type-safe rendering
	switch (variant.variant) {
		case 'default': {
			return renderDefaultVariant(variant, theme, effectiveKeyboardState);
		}

		case 'typing': {
			return renderTypingVariant(variant, theme, effectiveKeyboardState);
		}

		case 'loading': {
			return renderLoadingVariant(variant, theme);
		}

		case 'error': {
			return renderErrorVariant(variant, theme, effectiveKeyboardState);
		}
	}
}
