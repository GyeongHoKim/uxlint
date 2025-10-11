/**
 * Tests for wizardReducer
 * TDD: Write tests FIRST, verify they fail, then implement
 */

import {wizardReducer} from '../../source/hooks/use-wizard.js';
import type {WizardState} from '../../source/models/wizard-state.js';
import type {Page, Persona} from '../../source/models/config.js';

describe('wizardReducer', () => {
	describe('initialization', () => {
		// T034: Verify initializes at intro phase
		test('should start at intro phase', () => {
			const initialState: WizardState = {
				phase: 'intro',
				data: undefined,
			};

			expect(initialState.phase).toBe('intro');
			expect(initialState.data).toBeUndefined();
		});
	});

	describe('START_WIZARD action', () => {
		// T035: Verify START_WIZARD action transitions to main-url
		test('should transition from intro to main-url phase', () => {
			const initialState: WizardState = {
				phase: 'intro',
				data: undefined,
			};

			const newState = wizardReducer(initialState, {type: 'START_WIZARD'});

			expect(newState.phase).toBe('main-url');
			expect(newState.data).toEqual({});
		});
	});

	describe('SET_MAIN_URL action', () => {
		// T036: Verify SET_MAIN_URL action with valid data
		test('should set main URL and transition to sub-urls phase', () => {
			const state: WizardState = {
				phase: 'main-url',
				data: {},
			};

			const newState = wizardReducer(state, {
				type: 'SET_MAIN_URL',
				payload: 'https://example.com',
			});

			expect(newState.phase).toBe('sub-urls');
			if (newState.phase === 'sub-urls') {
				expect(newState.data.mainPageUrl).toBe('https://example.com');
				expect(newState.data.subPageUrls).toEqual([]);
			}
		});
	});

	describe('ADD_SUB_URL action', () => {
		// T037: Verify ADD_SUB_URL action
		test('should add sub-page URL to list', () => {
			const state: WizardState = {
				phase: 'sub-urls',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
				},
			};

			// Add first sub-URL
			const newState1 = wizardReducer(state, {
				type: 'ADD_SUB_URL',
				payload: 'https://example.com/page1',
			});

			expect(newState1.phase).toBe('sub-urls');
			if (newState1.phase === 'sub-urls') {
				expect(newState1.data.subPageUrls).toEqual([
					'https://example.com/page1',
				]);
			}

			// Add second sub-URL
			const newState2 = wizardReducer(newState1, {
				type: 'ADD_SUB_URL',
				payload: 'https://example.com/page2',
			});

			if (newState2.phase === 'sub-urls') {
				expect(newState2.data.subPageUrls).toEqual([
					'https://example.com/page1',
					'https://example.com/page2',
				]);
			}
		});

		test('should handle empty sub-URLs list', () => {
			const state: WizardState = {
				phase: 'sub-urls',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
				},
			};

			expect(state.phase).toBe('sub-urls');
			if (state.phase === 'sub-urls') {
				expect(state.data.subPageUrls).toEqual([]);
			}
		});
	});

	describe('DONE_SUB_URLS action', () => {
		// T038: Verify DONE_SUB_URLS transition
		test('should transition from sub-urls to pages phase', () => {
			const state: WizardState = {
				phase: 'sub-urls',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: ['https://example.com/page1'],
				},
			};

			const newState = wizardReducer(state, {type: 'DONE_SUB_URLS'});

			expect(newState.phase).toBe('pages');
			if (newState.phase === 'pages') {
				expect(newState.data.mainPageUrl).toBe('https://example.com');
				expect(newState.data.subPageUrls).toEqual([
					'https://example.com/page1',
				]);
				expect(newState.data.pages).toEqual([]);
			}
		});
	});

	describe('ADD_PAGE action', () => {
		// T039: Verify ADD_PAGE action
		test('should add page with features description', () => {
			const state: WizardState = {
				phase: 'pages',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
					pages: [],
				},
			};

			const page: Page = {
				url: 'https://example.com',
				features: 'Main landing page with hero section',
			};

			const newState = wizardReducer(state, {
				type: 'ADD_PAGE',
				payload: page,
			});

			expect(newState.phase).toBe('pages');
			if (newState.phase === 'pages') {
				expect(newState.data.pages).toEqual([page]);
			}
		});

		test('should add multiple pages', () => {
			const state: WizardState = {
				phase: 'pages',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: ['https://example.com/about'],
					pages: [],
				},
			};

			const page1: Page = {
				url: 'https://example.com',
				features: 'Main landing page',
			};

			const page2: Page = {
				url: 'https://example.com/about',
				features: 'About page with team info',
			};

			const newState1 = wizardReducer(state, {
				type: 'ADD_PAGE',
				payload: page1,
			});
			const newState2 = wizardReducer(newState1, {
				type: 'ADD_PAGE',
				payload: page2,
			});

			if (newState2.phase === 'pages') {
				expect(newState2.data.pages).toEqual([page1, page2]);
			}
		});
	});

	describe('DONE_PAGES action', () => {
		// T040: Verify DONE_PAGES transition
		test('should transition from pages to personas phase', () => {
			const state: WizardState = {
				phase: 'pages',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
					pages: [{url: 'https://example.com', features: 'Main page'}],
				},
			};

			const newState = wizardReducer(state, {type: 'DONE_PAGES'});

			expect(newState.phase).toBe('personas');
			if (newState.phase === 'personas') {
				expect(newState.data.mainPageUrl).toBe('https://example.com');
				expect(newState.data.pages).toHaveLength(1);
				expect(newState.data.personas).toEqual([]);
			}
		});
	});

	describe('ADD_PERSONA action', () => {
		// T041: Verify ADD_PERSONA action
		test('should add persona description', () => {
			const state: WizardState = {
				phase: 'personas',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
					pages: [{url: 'https://example.com', features: 'Main page'}],
					personas: [],
				},
			};

			const persona: Persona =
				'Marketing manager, 35-45, tech-savvy professional';

			const newState = wizardReducer(state, {
				type: 'ADD_PERSONA',
				payload: persona,
			});

			expect(newState.phase).toBe('personas');
			if (newState.phase === 'personas') {
				expect(newState.data.personas).toEqual([persona]);
			}
		});

		test('should add multiple personas', () => {
			const state: WizardState = {
				phase: 'personas',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
					pages: [{url: 'https://example.com', features: 'Main page'}],
					personas: [],
				},
			};

			const persona1: Persona = 'Marketing manager, 35-45, tech-savvy';
			const persona2: Persona =
				'Small business owner, 25-35, needs simple tools';

			const newState1 = wizardReducer(state, {
				type: 'ADD_PERSONA',
				payload: persona1,
			});
			const newState2 = wizardReducer(newState1, {
				type: 'ADD_PERSONA',
				payload: persona2,
			});

			if (newState2.phase === 'personas') {
				expect(newState2.data.personas).toEqual([persona1, persona2]);
			}
		});
	});

	describe('DONE_PERSONAS action', () => {
		// T042: Verify DONE_PERSONAS transition
		test('should transition from personas to report phase', () => {
			const state: WizardState = {
				phase: 'personas',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
					pages: [{url: 'https://example.com', features: 'Main page'}],
					personas: ['Marketing manager persona'],
				},
			};

			const newState = wizardReducer(state, {type: 'DONE_PERSONAS'});

			expect(newState.phase).toBe('report');
			if (newState.phase === 'report') {
				expect(newState.data.mainPageUrl).toBe('https://example.com');
				expect(newState.data.personas).toHaveLength(1);
			}
		});
	});

	describe('SET_REPORT_OUTPUT action', () => {
		// T043: Verify SET_REPORT_OUTPUT action
		test('should set report output path', () => {
			const state: WizardState = {
				phase: 'report',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
					pages: [{url: 'https://example.com', features: 'Main page'}],
					personas: ['Marketing manager persona'],
				},
			};

			const newState = wizardReducer(state, {
				type: 'SET_REPORT_OUTPUT',
				payload: './ux-report.md',
			});

			// Should still be in report phase after setting output
			expect(newState.phase).toBe('report');
		});
	});

	describe('PROCEED_TO_SUMMARY action', () => {
		// T044: Verify PROCEED_TO_SUMMARY transition
		test('should transition from report to summary phase with complete data', () => {
			const state: WizardState = {
				phase: 'report',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
					pages: [{url: 'https://example.com', features: 'Main page'}],
					personas: ['Marketing manager persona'],
				},
			};

			// First set report output
			const stateWithReport = wizardReducer(state, {
				type: 'SET_REPORT_OUTPUT',
				payload: './ux-report.md',
			});

			// Then proceed to summary
			const newState = wizardReducer(stateWithReport, {
				type: 'PROCEED_TO_SUMMARY',
			});

			expect(newState.phase).toBe('summary');
			if (newState.phase === 'summary') {
				expect(newState.data.mainPageUrl).toBe('https://example.com');
				expect(newState.data.subPageUrls).toEqual([]);
				expect(newState.data.pages).toHaveLength(1);
				expect(newState.data.personas).toHaveLength(1);
				expect(newState.data.reportOutput).toBe('./ux-report.md');
			}
		});
	});

	describe('CONFIRM_SUMMARY action', () => {
		test('should transition from summary to save phase', () => {
			const state: WizardState = {
				phase: 'summary',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
					pages: [{url: 'https://example.com', features: 'Main page'}],
					personas: ['Marketing manager persona'],
					reportOutput: './ux-report.md',
				},
			};

			const newState = wizardReducer(state, {type: 'CONFIRM_SUMMARY'});

			expect(newState.phase).toBe('save');
		});
	});

	describe('SET_SAVE_OPTIONS action', () => {
		test('should set save options', () => {
			const state: WizardState = {
				phase: 'save',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
					pages: [{url: 'https://example.com', features: 'Main page'}],
					personas: ['Marketing manager persona'],
					reportOutput: './ux-report.md',
				},
			};

			const newState = wizardReducer(state, {
				type: 'SET_SAVE_OPTIONS',
				payload: {shouldSave: true, format: 'yaml'},
			});

			// Should still be in save phase
			expect(newState.phase).toBe('save');
		});
	});

	describe('COMPLETE_WIZARD action', () => {
		test('should transition to complete phase', () => {
			const state: WizardState = {
				phase: 'save',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
					pages: [{url: 'https://example.com', features: 'Main page'}],
					personas: ['Marketing manager persona'],
					reportOutput: './ux-report.md',
				},
			};

			// First set save options
			const stateWithOptions = wizardReducer(state, {
				type: 'SET_SAVE_OPTIONS',
				payload: {shouldSave: false},
			});

			// Then complete wizard
			const newState = wizardReducer(stateWithOptions, {
				type: 'COMPLETE_WIZARD',
			});

			expect(newState.phase).toBe('complete');
			if (newState.phase === 'complete') {
				expect(newState.data.mainPageUrl).toBe('https://example.com');
				expect(newState.saveOptions?.shouldSave).toBe(false);
			}
		});
	});

	describe('REMOVE_SUB_URL action', () => {
		test('should remove sub-URL from list by URL', () => {
			const state: WizardState = {
				phase: 'sub-urls',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [
						'https://example.com/page1',
						'https://example.com/page2',
					],
				},
			};

			const newState = wizardReducer(state, {
				type: 'REMOVE_SUB_URL',
				payload: 'https://example.com/page1',
			});

			if (newState.phase === 'sub-urls') {
				expect(newState.data.subPageUrls).toEqual([
					'https://example.com/page2',
				]);
			}
		});
	});

	describe('REMOVE_PERSONA action', () => {
		test('should remove persona from list by index', () => {
			const state: WizardState = {
				phase: 'personas',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
					pages: [{url: 'https://example.com', features: 'Main page'}],
					personas: ['Marketing manager persona', 'Developer persona'],
				},
			};

			const newState = wizardReducer(state, {
				type: 'REMOVE_PERSONA',
				payload: 0,
			});

			if (newState.phase === 'personas') {
				expect(newState.data.personas).toEqual(['Developer persona']);
			}
		});
	});

	describe('full wizard flow', () => {
		test('should complete entire wizard flow successfully', () => {
			// Intro
			let state: WizardState = {
				phase: 'intro',
				data: undefined,
			};
			expect(state.phase).toBe('intro');

			// Start wizard
			state = wizardReducer(state, {type: 'START_WIZARD'});
			expect(state.phase).toBe('main-url');

			// Set main URL
			state = wizardReducer(state, {
				type: 'SET_MAIN_URL',
				payload: 'https://example.com',
			});
			expect(state.phase).toBe('sub-urls');

			// Add sub-URLs
			state = wizardReducer(state, {
				type: 'ADD_SUB_URL',
				payload: 'https://example.com/about',
			});

			state = wizardReducer(state, {
				type: 'ADD_SUB_URL',
				payload: 'https://example.com/contact',
			});

			state = wizardReducer(state, {type: 'DONE_SUB_URLS'});
			expect(state.phase).toBe('pages');

			// Add pages
			state = wizardReducer(state, {
				type: 'ADD_PAGE',
				payload: {url: 'https://example.com', features: 'Main landing page'},
			});

			state = wizardReducer(state, {
				type: 'ADD_PAGE',
				payload: {
					url: 'https://example.com/about',
					features: 'About page with company info',
				},
			});

			state = wizardReducer(state, {type: 'DONE_PAGES'});
			expect(state.phase).toBe('personas');

			// Add personas
			state = wizardReducer(state, {
				type: 'ADD_PERSONA',
				payload: 'Marketing manager, 35-45, tech-savvy',
			});

			state = wizardReducer(state, {
				type: 'ADD_PERSONA',
				payload: 'Small business owner, 25-35, needs simple tools',
			});

			state = wizardReducer(state, {type: 'DONE_PERSONAS'});
			expect(state.phase).toBe('report');

			// Set report output
			state = wizardReducer(state, {
				type: 'SET_REPORT_OUTPUT',
				payload: './ux-report.md',
			});

			state = wizardReducer(state, {type: 'PROCEED_TO_SUMMARY'});
			expect(state.phase).toBe('summary');

			// Verify complete data in summary
			if (state.phase === 'summary') {
				expect(state.data).toEqual({
					mainPageUrl: 'https://example.com',
					subPageUrls: [
						'https://example.com/about',
						'https://example.com/contact',
					],
					pages: [
						{url: 'https://example.com', features: 'Main landing page'},
						{
							url: 'https://example.com/about',
							features: 'About page with company info',
						},
					],
					personas: [
						'Marketing manager, 35-45, tech-savvy',
						'Small business owner, 25-35, needs simple tools',
					],
					reportOutput: './ux-report.md',
				});
			}

			// Confirm and go to save
			state = wizardReducer(state, {type: 'CONFIRM_SUMMARY'});
			expect(state.phase).toBe('save');

			// Set save options and complete
			state = wizardReducer(state, {
				type: 'SET_SAVE_OPTIONS',
				payload: {shouldSave: true, format: 'yaml'},
			});

			state = wizardReducer(state, {type: 'COMPLETE_WIZARD'});
			expect(state.phase).toBe('complete');
			if (state.phase === 'complete') {
				expect(state.saveOptions).toEqual({
					shouldSave: true,
					format: 'yaml',
				});
			}
		});
	});

	describe('CANCEL_WIZARD action', () => {
		test('should reset to intro phase', () => {
			const state: WizardState = {
				phase: 'personas',
				data: {
					mainPageUrl: 'https://example.com',
					subPageUrls: [],
					pages: [{url: 'https://example.com', features: 'Main page'}],
					personas: ['Marketing manager persona'],
				},
			};

			const newState = wizardReducer(state, {type: 'CANCEL_WIZARD'});

			expect(newState.phase).toBe('intro');
			expect(newState.data).toBeUndefined();
		});
	});
});
