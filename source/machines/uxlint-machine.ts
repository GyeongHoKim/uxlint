/**
 * XState machine for uxlint CLI state management
 * Implements the state machine defined in README.md
 */
import {setup, assign} from 'xstate';
import type {UxLintConfig} from '../models/config.js';
import {MissingConfigError} from '../models/errors.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Analysis result structure
 */
export type UxReport = {
	pages: PageAnalysis[];
	summary: string;
	recommendations: string[];
};

export type PageAnalysis = {
	url: string;
	findings: string[];
	score: number;
};

/**
 * Machine context - runtime state data
 */
export type UxlintMachineContext = {
	/** Whether --interactive flag was provided */
	interactive: boolean;
	/** Whether uxlintrc file exists in CWD */
	configExists: boolean;
	/** Loaded configuration (from file or wizard) */
	config: UxLintConfig | undefined;
	/** Configuration created by wizard */
	wizardConfig: UxLintConfig | undefined;
	/** Analysis result from AI */
	analysisResult: UxReport | undefined;
	/** Error that occurred during execution */
	error: Error | undefined;
	/** Process exit code (0 = success, 1 = error) */
	exitCode: number;
};

/**
 * Machine input - provided when creating the actor
 */
export type UxlintMachineInput = {
	interactive: boolean;
	configExists: boolean;
	config?: UxLintConfig;
};

/**
 * Machine events
 */
export type UxlintMachineEvent =
	| {type: 'WIZARD_COMPLETE'; config: UxLintConfig}
	| {type: 'WIZARD_CANCEL'}
	| {type: 'ANALYSIS_COMPLETE'; result: UxReport}
	| {type: 'ANALYSIS_ERROR'; error: Error}
	| {type: 'REPORT_COMPLETE'}
	| {type: 'REPORT_ERROR'; error: Error};

// =============================================================================
// Machine Definition
// =============================================================================

// Type helper for XState setup - XState v5 uses this pattern for type inference
const machineTypes: {
	context: UxlintMachineContext;
	events: UxlintMachineEvent;
	input: UxlintMachineInput;
} = {
	context: undefined as unknown as UxlintMachineContext,
	events: undefined as unknown as UxlintMachineEvent,
	input: undefined as unknown as UxlintMachineInput,
};

export const uxlintMachine = setup({
	types: machineTypes,
	guards: {
		isInteractive: ({context}) => context.interactive,
		isCI: ({context}) => !context.interactive,
		hasConfig: ({context}) => context.configExists,
		noConfig: ({context}) => !context.configExists,
	},
	actions: {
		assignConfig: assign({
			config({context, event}) {
				if (event.type === 'WIZARD_COMPLETE') {
					return event.config;
				}

				return context.config;
			},
		}),
		assignWizardConfig: assign({
			wizardConfig({event}) {
				if (event.type === 'WIZARD_COMPLETE') {
					return event.config;
				}

				return undefined;
			},
			config({event}) {
				if (event.type === 'WIZARD_COMPLETE') {
					return event.config;
				}

				return undefined;
			},
		}),
		assignAnalysisResult: assign({
			analysisResult({event}) {
				if (event.type === 'ANALYSIS_COMPLETE') {
					return event.result;
				}

				return undefined;
			},
		}),
		assignError: assign({
			error({event}) {
				if (event.type === 'ANALYSIS_ERROR' || event.type === 'REPORT_ERROR') {
					return event.error;
				}

				return undefined;
			},
		}),
		setExitCodeZero: assign({
			exitCode: 0,
		}),
		setExitCodeOne: assign({
			exitCode: 1,
		}),
		createMissingConfigError: assign({
			error: () => new MissingConfigError(),
			exitCode: 1,
		}),
	},
}).createMachine({
	id: 'uxlint',
	initial: 'idle',
	context: ({input}) => ({
		interactive: input.interactive,
		configExists: input.configExists,
		config: input.config,
		wizardConfig: undefined,
		analysisResult: undefined,
		error: undefined,
		exitCode: 0,
	}),
	states: {
		idle: {
			always: [
				{target: 'tty', guard: 'isInteractive'},
				{target: 'ci', guard: 'isCI'},
			],
		},
		tty: {
			initial: 'checking',
			states: {
				checking: {
					always: [
						{target: 'analyzeWithUI', guard: 'hasConfig'},
						{target: 'wizard', guard: 'noConfig'},
					],
				},
				wizard: {
					on: {
						WIZARD_COMPLETE: {
							target: 'analyzeWithUI',
							actions: ['assignWizardConfig'],
						},
						WIZARD_CANCEL: {
							target: '#uxlint.done',
							actions: ['setExitCodeZero'],
						},
					},
				},
				analyzeWithUI: {
					on: {
						ANALYSIS_COMPLETE: {
							target: '#uxlint.reportBuilder',
							actions: ['assignAnalysisResult'],
						},
						ANALYSIS_ERROR: {
							target: '#uxlint.done',
							actions: ['assignError', 'setExitCodeOne'],
						},
					},
				},
			},
		},
		ci: {
			initial: 'checking',
			states: {
				checking: {
					always: [
						{target: 'analyzeWithoutUI', guard: 'hasConfig'},
						{target: 'error', guard: 'noConfig'},
					],
				},
				analyzeWithoutUI: {
					on: {
						ANALYSIS_COMPLETE: {
							target: '#uxlint.reportBuilder',
							actions: ['assignAnalysisResult'],
						},
						ANALYSIS_ERROR: {
							target: '#uxlint.done',
							actions: ['assignError', 'setExitCodeOne'],
						},
					},
				},
				error: {
					entry: ['createMissingConfigError'],
				},
			},
		},
		reportBuilder: {
			on: {
				REPORT_COMPLETE: {
					target: 'done',
					actions: ['setExitCodeZero'],
				},
				REPORT_ERROR: {
					target: 'done',
					actions: ['assignError', 'setExitCodeOne'],
				},
			},
		},
		done: {
			type: 'final',
		},
	},
});
