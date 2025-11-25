/**
 * UseWizard Hook
 * React hook for managing wizard state with useReducer
 */

import {useReducer, type Reducer} from 'react';
import type {
	ConfigurationData,
	SaveOptions,
	WizardAction,
	WizardState,
} from '../models/wizard-state.js';

/**
 * Extended wizard state with save options and report output tracking
 */
type ExtendedWizardState = WizardState & {
	pendingSaveOptions?: SaveOptions;
	pendingReportOutput?: string;
};

/**
 * Initial wizard state
 */
const initialState: ExtendedWizardState = {
	phase: 'intro',
	data: undefined,
};

/**
 * Handle URL-related actions
 */
function handleUrlActions(
	state: ExtendedWizardState,
	action: Extract<
		WizardAction,
		| {type: 'START_WIZARD'}
		| {type: 'SET_MAIN_URL'}
		| {type: 'ADD_SUB_URL'}
		| {type: 'REMOVE_SUB_URL'}
		| {type: 'DONE_SUB_URLS'}
	>,
): ExtendedWizardState {
	switch (action.type) {
		case 'START_WIZARD': {
			return {
				phase: 'main-url',
				data: {},
			};
		}

		case 'SET_MAIN_URL': {
			return {
				phase: 'sub-urls',
				data: {
					mainPageUrl: action.payload,
					subPageUrls: [],
				},
			};
		}

		case 'ADD_SUB_URL': {
			if (state.phase !== 'sub-urls') {
				return state;
			}

			return {
				phase: 'sub-urls',
				data: {
					...state.data,
					subPageUrls: [...state.data.subPageUrls, action.payload],
				},
			};
		}

		case 'REMOVE_SUB_URL': {
			if (state.phase !== 'sub-urls') {
				return state;
			}

			return {
				phase: 'sub-urls',
				data: {
					...state.data,
					subPageUrls: state.data.subPageUrls.filter(
						url => url !== action.payload,
					),
				},
			};
		}

		case 'DONE_SUB_URLS': {
			if (state.phase !== 'sub-urls') {
				return state;
			}

			return {
				phase: 'pages',
				data: {
					...state.data,
					pages: [],
				},
			};
		}
	}
}

/**
 * Handle page-related actions
 */
function handlePageActions(
	state: ExtendedWizardState,
	action: Extract<WizardAction, {type: 'ADD_PAGE'} | {type: 'DONE_PAGES'}>,
): ExtendedWizardState {
	switch (action.type) {
		case 'ADD_PAGE': {
			if (state.phase !== 'pages') {
				return state;
			}

			return {
				phase: 'pages',
				data: {
					...state.data,
					pages: [...state.data.pages, action.payload],
				},
			};
		}

		case 'DONE_PAGES': {
			if (state.phase !== 'pages') {
				return state;
			}

			return {
				phase: 'persona',
				data: {
					...state.data,
					persona: '',
				},
			};
		}
	}
}

/**
 * Handle persona-related actions
 */
function handlePersonaActions(
	state: ExtendedWizardState,
	action: Extract<WizardAction, {type: 'SET_PERSONA'}>,
): ExtendedWizardState {
	switch (action.type) {
		case 'SET_PERSONA': {
			if (state.phase !== 'persona') {
				return state;
			}

			return {
				phase: 'report',
				data: {
					...state.data,
					persona: action.payload,
				},
			};
		}
	}
}

/**
 * Handle completion-related actions
 */
function handleCompletionActions(
	state: ExtendedWizardState,
	action: Extract<
		WizardAction,
		| {type: 'SET_REPORT_OUTPUT'}
		| {type: 'PROCEED_TO_SUMMARY'}
		| {type: 'CONFIRM_SUMMARY'}
		| {type: 'SET_SAVE_OPTIONS'}
		| {type: 'COMPLETE_WIZARD'}
		| {type: 'CANCEL_WIZARD'}
		| {type: 'GO_BACK'}
	>,
): ExtendedWizardState {
	switch (action.type) {
		case 'SET_REPORT_OUTPUT': {
			if (state.phase !== 'report') {
				return state;
			}

			return {
				...state,
				phase: 'report',
				data: state.data,
				pendingReportOutput: action.payload,
			};
		}

		case 'PROCEED_TO_SUMMARY': {
			if (state.phase !== 'report') {
				return state;
			}

			const configData: ConfigurationData = {
				mainPageUrl: state.data.mainPageUrl,
				subPageUrls: state.data.subPageUrls,
				pages: state.data.pages,
				persona: state.data.persona,
				reportOutput: state.pendingReportOutput ?? '',
			};

			return {
				phase: 'summary',
				data: configData,
			};
		}

		case 'CONFIRM_SUMMARY': {
			if (state.phase !== 'summary') {
				return state;
			}

			return {
				phase: 'save',
				data: state.data,
			};
		}

		case 'SET_SAVE_OPTIONS': {
			if (state.phase !== 'save') {
				return state;
			}

			return {
				...state,
				phase: 'save',
				data: state.data,
				pendingSaveOptions: action.payload,
			};
		}

		case 'COMPLETE_WIZARD': {
			if (state.phase !== 'save') {
				return state;
			}

			return {
				phase: 'complete',
				data: state.data,
				saveOptions: state.pendingSaveOptions,
			};
		}

		case 'CANCEL_WIZARD': {
			return initialState;
		}

		case 'GO_BACK': {
			return state;
		}
	}
}

/**
 * Wizard reducer function
 * Handles all wizard state transitions and data updates
 *
 * @param state - Current wizard state
 * @param action - Action to process
 * @returns New wizard state
 */
export function wizardReducer(
	state: ExtendedWizardState,
	action: WizardAction,
): ExtendedWizardState {
	// Delegate to appropriate handler based on action type
	const urlActions = [
		'START_WIZARD',
		'SET_MAIN_URL',
		'ADD_SUB_URL',
		'REMOVE_SUB_URL',
		'DONE_SUB_URLS',
	];
	const pageActions = ['ADD_PAGE', 'DONE_PAGES'];
	const personaActions = ['SET_PERSONA'];

	if (urlActions.includes(action.type)) {
		return handleUrlActions(
			state,
			action as Parameters<typeof handleUrlActions>[1],
		);
	}

	if (pageActions.includes(action.type)) {
		return handlePageActions(
			state,
			action as Parameters<typeof handlePageActions>[1],
		);
	}

	if (personaActions.includes(action.type)) {
		return handlePersonaActions(
			state,
			action as Parameters<typeof handlePersonaActions>[1],
		);
	}

	return handleCompletionActions(
		state,
		action as Parameters<typeof handleCompletionActions>[1],
	);
}

/**
 * Hook return type
 */
export type UseWizardResult = {
	state: ExtendedWizardState;
	dispatch: (action: WizardAction) => void;
};

/**
 * Use wizard hook
 * Manages wizard state with reducer pattern
 *
 * @returns Wizard state and dispatch function
 *
 * @example
 * ```tsx
 * function ConfigWizard() {
 *   const {state, dispatch} = useWizard();
 *
 *   if (state.phase === 'intro') {
 *     return <IntroScreen onStart={() => dispatch({type: 'START_WIZARD'})} />;
 *   }
 *
 *   if (state.phase === 'main-url') {
 *     return <MainUrlInput onSubmit={(url) => dispatch({type: 'SET_MAIN_URL', payload: url})} />;
 *   }
 *
 *   // ... other phases
 * }
 * ```
 */
export function useWizard(): UseWizardResult {
	const [state, dispatch] = useReducer<
		Reducer<ExtendedWizardState, WizardAction>
	>(wizardReducer, initialState);

	return {
		state,
		dispatch,
	};
}
