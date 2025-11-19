/**
 * Wizard State Contracts
 * Type definitions for the configuration wizard state management
 *
 * These are CONTRACTS - they define the public API and must remain stable.
 * Implementation details should be hidden behind these interfaces.
 */

import type {Page, Persona} from './config.js';

/**
 * Configuration data accumulated during wizard flow
 * This is a flattened version of UxLintConfig for easier wizard state management
 */
export type ConfigurationData = {
	readonly mainPageUrl: string;
	readonly subPageUrls: readonly string[];
	readonly pages: readonly Page[];
	readonly personas: readonly Persona[];
	readonly reportOutput: string;
};

/**
 * Partial configuration data during wizard flow
 */
export type PartialConfigurationData = {
	readonly mainPageUrl?: string;
	readonly subPageUrls?: readonly string[];
	readonly pages?: readonly Page[];
	readonly personas?: readonly Persona[];
	readonly reportOutput?: string;
};

/**
 * All possible wizard phases
 */
export const wizardPhases = [
	'intro',
	'main-url',
	'sub-urls',
	'pages',
	'personas',
	'report',
	'summary',
	'save',
	'complete',
] as const;
export type WizardPhase = (typeof wizardPhases)[number];

/**
 * Wizard state discriminated union
 * Each phase has appropriate data available
 */
export type WizardState =
	| {phase: 'intro'; data: undefined}
	| {phase: 'main-url'; data: {mainPageUrl?: string}}
	| {
			phase: 'sub-urls';
			data: {mainPageUrl: string; subPageUrls: readonly string[]};
	  }
	| {
			phase: 'pages';
			data: {
				mainPageUrl: string;
				subPageUrls: readonly string[];
				pages: readonly Page[];
			};
	  }
	| {
			phase: 'personas';
			data: {
				mainPageUrl: string;
				subPageUrls: readonly string[];
				pages: readonly Page[];
				personas: readonly Persona[];
			};
	  }
	| {
			phase: 'report';
			data: {
				mainPageUrl: string;
				subPageUrls: readonly string[];
				pages: readonly Page[];
				personas: readonly Persona[];
			};
	  }
	| {phase: 'summary'; data: ConfigurationData}
	| {phase: 'save'; data: ConfigurationData}
	| {
			phase: 'complete';
			data: ConfigurationData;
			saveOptions?: SaveOptions;
	  };

/**
 * Options for saving configuration to file
 */
export type SaveOptions = {
	readonly shouldSave: boolean;
	readonly format?: 'yaml' | 'json';
	readonly filePath?: string;
};

/**
 * Type of prompt to display
 */
export type PromptType = 'text' | 'select' | 'confirm' | 'multiline';

/**
 * Configuration for a single prompt step
 */
export type PromptConfig = {
	readonly type: PromptType;
	readonly label: string;
	readonly placeholder?: string;
	readonly required?: boolean;
	readonly validator?: (value: string) => string; // Validator from validation-engine
	readonly defaultValue?: string;
	readonly options?: readonly string[]; // For 'select' type
};

/**
 * Wizard actions that can be dispatched
 */
export type WizardAction =
	| {type: 'START_WIZARD'}
	| {type: 'SET_MAIN_URL'; payload: string}
	| {type: 'ADD_SUB_URL'; payload: string}
	| {type: 'REMOVE_SUB_URL'; payload: string}
	| {type: 'DONE_SUB_URLS'}
	| {type: 'ADD_PAGE'; payload: Page}
	| {type: 'DONE_PAGES'}
	| {type: 'ADD_PERSONA'; payload: Persona}
	| {type: 'REMOVE_PERSONA'; payload: number}
	| {type: 'DONE_PERSONAS'}
	| {type: 'SET_REPORT_OUTPUT'; payload: string}
	| {type: 'PROCEED_TO_SUMMARY'}
	| {type: 'CONFIRM_SUMMARY'}
	| {type: 'SET_SAVE_OPTIONS'; payload: SaveOptions}
	| {type: 'COMPLETE_WIZARD'}
	| {type: 'GO_BACK'}
	| {type: 'CANCEL_WIZARD'};

/**
 * Type guard to check if configuration data is complete
 */
export function isCompleteConfigurationData(
	data: PartialConfigurationData | undefined,
): data is ConfigurationData {
	return (
		data !== undefined &&
		typeof data.mainPageUrl === 'string' &&
		data.mainPageUrl.length > 0 &&
		Array.isArray(data.subPageUrls) &&
		Array.isArray(data.pages) &&
		data.pages.length > 0 &&
		Array.isArray(data.personas) &&
		data.personas.length > 0 &&
		typeof data.reportOutput === 'string' &&
		data.reportOutput.length > 0
	);
}

/**
 * Type guard to check if wizard is at intro phase
 */
export function isIntroPhase(
	state: WizardState,
): state is Extract<WizardState, {phase: 'intro'}> {
	return state.phase === 'intro';
}

/**
 * Type guard to check if wizard is at main-url phase
 */
export function isMainUrlPhase(
	state: WizardState,
): state is Extract<WizardState, {phase: 'main-url'}> {
	return state.phase === 'main-url';
}

/**
 * Type guard to check if wizard is at sub-urls phase
 */
export function isSubUrlsPhase(
	state: WizardState,
): state is Extract<WizardState, {phase: 'sub-urls'}> {
	return state.phase === 'sub-urls';
}

/**
 * Type guard to check if wizard is at pages phase
 */
export function isPagesPhase(
	state: WizardState,
): state is Extract<WizardState, {phase: 'pages'}> {
	return state.phase === 'pages';
}

/**
 * Type guard to check if wizard is at personas phase
 */
export function isPersonasPhase(
	state: WizardState,
): state is Extract<WizardState, {phase: 'personas'}> {
	return state.phase === 'personas';
}

/**
 * Type guard to check if wizard is at report phase
 */
export function isReportPhase(
	state: WizardState,
): state is Extract<WizardState, {phase: 'report'}> {
	return state.phase === 'report';
}

/**
 * Type guard to check if wizard is at summary phase
 */
export function isSummaryPhase(
	state: WizardState,
): state is Extract<WizardState, {phase: 'summary'}> {
	return state.phase === 'summary';
}

/**
 * Type guard to check if wizard is at save phase
 */
export function isSavePhase(
	state: WizardState,
): state is Extract<WizardState, {phase: 'save'}> {
	return state.phase === 'save';
}

/**
 * Type guard to check if wizard is at complete phase
 */
export function isCompletePhase(
	state: WizardState,
): state is Extract<WizardState, {phase: 'complete'}> {
	return state.phase === 'complete';
}
