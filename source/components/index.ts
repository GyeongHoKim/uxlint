/**
 * Components module exports
 * Centralized exports for all UI components
 */

export {Header} from './header.js';
export {UserInput} from './user-input.js';
export {UserInputLabel} from './user-input-label.js';

// Export UserInput variant types
export type {
	BaseUserInputProps,
	DefaultVariant,
	TypingVariant,
	LoadingVariant,
	ErrorVariant,
	UserInputVariant,
	UserInputVariantProps,
} from './user-input.js';

// Export UserInputLabel types
export type {
	UserInputLabelVariant,
	UserInputLabelProps,
} from './user-input-label.js';

// Export type guards
export {
	hasValue,
	hasPlaceholder,
	isInteractive,
	isErrorVariant,
	isLoadingVariant,
} from './user-input.js';

export {isRequiredLabel, isOptionalLabel} from './user-input-label.js';
