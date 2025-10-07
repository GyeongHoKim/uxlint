/**
 * UserInputLabel component - Separated label component for UserInput
 * Provides flexible label display with variant support
 */

import {Text} from 'ink';
import type {ThemeConfig} from '../models/index.js';

/**
 * Label variant types for different display styles
 */
export type UserInputLabelVariant = 'default' | 'required' | 'optional';

/**
 * Props for the UserInputLabel component
 */
export type UserInputLabelProps = {
	readonly text: string;
	readonly variant?: UserInputLabelVariant;
	readonly theme: ThemeConfig;
};

/**
 * Type guard to check if label variant is required
 */
export function isRequiredLabel(variant?: UserInputLabelVariant): boolean {
	return variant === 'required';
}

/**
 * Type guard to check if label variant is optional
 */
export function isOptionalLabel(variant?: UserInputLabelVariant): boolean {
	return variant === 'optional';
}

/**
 * UserInputLabel component for displaying input labels with variants
 */
export function UserInputLabel({
	text,
	variant = 'default',
	theme,
}: UserInputLabelProps) {
	const getVariantText = () => {
		switch (variant) {
			case 'required': {
				return `${text} *`;
			}

			case 'optional': {
				return `${text} (optional)`;
			}

			case 'default': {
				return text;
			}
		}
	};

	const getVariantColor = () => {
		switch (variant) {
			case 'required': {
				return theme.status.error;
			}

			case 'optional': {
				return theme.text.muted;
			}

			case 'default': {
				return theme.primary;
			}
		}
	};

	return (
		<Text bold color={getVariantColor()}>
			{getVariantText()}
		</Text>
	);
}
