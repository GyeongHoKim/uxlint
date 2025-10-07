/**
 * Components module exports
 * Centralized exports for all UI components
 */

export {Header} from './header.js';
export {UserInputLabel} from './user-input-label.js';
export {UserInput} from './user-input.js';

// Export UserInput variant types
export type {
	BaseUserInputProps,
	DefaultVariant,
	ErrorVariant,
	LoadingVariant,
	TypingVariant,
	UserInputVariant,
	UserInputVariantProps,
} from './user-input.js';

// Export UserInputLabel types
export type {
	UserInputLabelProps,
	UserInputLabelVariant,
} from './user-input-label.js';

export {isOptionalLabel, isRequiredLabel} from './user-input-label.js';
