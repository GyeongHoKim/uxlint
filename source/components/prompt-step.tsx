/**
 * PromptStep component - Reusable wrapper for individual prompt steps
 * Provides progress indicator and consistent layout for wizard steps
 */

import {Box, Text} from 'ink';
import type {ThemeConfig} from '../models/index.js';
import {UserInputLabel} from './user-input-label.js';

/**
 * Props for the PromptStep component
 */
export type PromptStepProps = {
	readonly stepNumber: number;
	readonly totalSteps: number;
	readonly label: string;
	readonly isRequired?: boolean;
	readonly theme: ThemeConfig;
	readonly children: React.ReactNode;
};

/**
 * PromptStep component that wraps wizard steps with progress indicator
 *
 * @example
 * ```tsx
 * <PromptStep
 *   stepNumber={1}
 *   totalSteps={7}
 *   label="Enter main page URL"
 *   required={true}
 *   theme={theme}
 * >
 *   <UserInput ... />
 * </PromptStep>
 * ```
 */
export function PromptStep({
	stepNumber,
	totalSteps,
	label,
	isRequired = true,
	theme,
	children,
}: PromptStepProps) {
	return (
		<Box flexDirection="column" gap={1}>
			{/* Progress indicator */}
			<Text dimColor color={theme.text.muted}>
				Step {stepNumber} of {totalSteps}
			</Text>

			{/* Label */}
			<UserInputLabel
				text={label}
				variant={isRequired ? 'required' : 'optional'}
				theme={theme}
			/>

			{/* Input component (passed as children) */}
			<Box marginTop={1}>{children}</Box>
		</Box>
	);
}
