/**
 * Wizard State Tests
 * Unit tests for wizard state type guards and utilities
 */

import {describe, it, expect} from '@jest/globals';
import type {Page, Persona} from '../../source/models/config.js';
import {
	isCompleteConfigurationData,
	isIntroPhase,
	isMainUrlPhase,
	isSubUrlsPhase,
	isPagesPhase,
	isPersonasPhase,
	isReportPhase,
	isSummaryPhase,
	isSavePhase,
	isCompletePhase,
	type ConfigurationData,
	type PartialConfigurationData,
	type WizardState,
} from '../../source/models/wizard-state.js';

describe('isCompleteConfigurationData', () => {
	it('should return true for complete configuration data', () => {
		const pages: Page[] = [{url: 'https://example.com', features: 'Test page'}];
		const personas: Persona[] = [
			'Developer with accessibility needs and keyboard navigation preference',
		];

		const completeData: ConfigurationData = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages,
			personas,
			reportOutput: './ux-report.md',
		};

		expect(isCompleteConfigurationData(completeData)).toBe(true);
	});

	it('should return false for undefined data', () => {
		expect(isCompleteConfigurationData(undefined)).toBe(false);
	});

	it('should return false for partial data with missing mainPageUrl', () => {
		const partialData: PartialConfigurationData = {
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Test'}],
			personas: ['Test persona with valid length requirements'],
			reportOutput: './ux-report.md',
		};

		expect(isCompleteConfigurationData(partialData)).toBe(false);
	});

	it('should return false for empty mainPageUrl', () => {
		const partialData: PartialConfigurationData = {
			mainPageUrl: '',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Test'}],
			personas: ['Test persona with valid length requirements'],
			reportOutput: './ux-report.md',
		};

		expect(isCompleteConfigurationData(partialData)).toBe(false);
	});

	it('should return false for missing pages array', () => {
		const partialData: PartialConfigurationData = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			personas: ['Test persona with valid length requirements'],
			reportOutput: './ux-report.md',
		};

		expect(isCompleteConfigurationData(partialData)).toBe(false);
	});

	it('should return false for empty pages array', () => {
		const partialData: PartialConfigurationData = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [],
			personas: ['Test persona with valid length requirements'],
			reportOutput: './ux-report.md',
		};

		expect(isCompleteConfigurationData(partialData)).toBe(false);
	});

	it('should return false for missing personas array', () => {
		const partialData: PartialConfigurationData = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Test'}],
			reportOutput: './ux-report.md',
		};

		expect(isCompleteConfigurationData(partialData)).toBe(false);
	});

	it('should return false for empty personas array', () => {
		const partialData: PartialConfigurationData = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Test'}],
			personas: [],
			reportOutput: './ux-report.md',
		};

		expect(isCompleteConfigurationData(partialData)).toBe(false);
	});

	it('should return false for missing reportOutput', () => {
		const partialData: PartialConfigurationData = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Test'}],
			personas: ['Test persona with valid length requirements'],
		};

		expect(isCompleteConfigurationData(partialData)).toBe(false);
	});

	it('should return false for empty reportOutput', () => {
		const partialData: PartialConfigurationData = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Test'}],
			personas: ['Test persona with valid length requirements'],
			reportOutput: '',
		};

		expect(isCompleteConfigurationData(partialData)).toBe(false);
	});
});

describe('Wizard Phase Type Guards', () => {
	it('isIntroPhase should return true for intro phase', () => {
		const state: WizardState = {phase: 'intro', data: undefined};
		expect(isIntroPhase(state)).toBe(true);
		expect(isMainUrlPhase(state)).toBe(false);
	});

	it('isMainUrlPhase should return true for main-url phase', () => {
		const state: WizardState = {phase: 'main-url', data: {}};
		expect(isMainUrlPhase(state)).toBe(true);
		expect(isIntroPhase(state)).toBe(false);
	});

	it('isSubUrlsPhase should return true for sub-urls phase', () => {
		const state: WizardState = {
			phase: 'sub-urls',
			data: {mainPageUrl: 'https://example.com', subPageUrls: []},
		};
		expect(isSubUrlsPhase(state)).toBe(true);
		expect(isMainUrlPhase(state)).toBe(false);
	});

	it('isPagesPhase should return true for pages phase', () => {
		const state: WizardState = {
			phase: 'pages',
			data: {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [],
			},
		};
		expect(isPagesPhase(state)).toBe(true);
		expect(isSubUrlsPhase(state)).toBe(false);
	});

	it('isPersonasPhase should return true for personas phase', () => {
		const state: WizardState = {
			phase: 'personas',
			data: {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [{url: 'https://example.com', features: 'Test'}],
				personas: [],
			},
		};
		expect(isPersonasPhase(state)).toBe(true);
		expect(isPagesPhase(state)).toBe(false);
	});

	it('isReportPhase should return true for report phase', () => {
		const state: WizardState = {
			phase: 'report',
			data: {
				mainPageUrl: 'https://example.com',
				subPageUrls: [],
				pages: [{url: 'https://example.com', features: 'Test'}],
				personas: ['Test persona with valid length requirements'],
			},
		};
		expect(isReportPhase(state)).toBe(true);
		expect(isPersonasPhase(state)).toBe(false);
	});

	it('isSummaryPhase should return true for summary phase', () => {
		const completeData: ConfigurationData = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Test'}],
			personas: ['Test persona with valid length requirements'],
			reportOutput: './ux-report.md',
		};
		const state: WizardState = {phase: 'summary', data: completeData};
		expect(isSummaryPhase(state)).toBe(true);
		expect(isReportPhase(state)).toBe(false);
	});

	it('isSavePhase should return true for save phase', () => {
		const completeData: ConfigurationData = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Test'}],
			personas: ['Test persona with valid length requirements'],
			reportOutput: './ux-report.md',
		};
		const state: WizardState = {phase: 'save', data: completeData};
		expect(isSavePhase(state)).toBe(true);
		expect(isSummaryPhase(state)).toBe(false);
	});

	it('isCompletePhase should return true for complete phase', () => {
		const completeData: ConfigurationData = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Test'}],
			personas: ['Test persona with valid length requirements'],
			reportOutput: './ux-report.md',
		};
		const state: WizardState = {
			phase: 'complete',
			data: completeData,
			saveOptions: {shouldSave: false},
		};
		expect(isCompletePhase(state)).toBe(true);
		expect(isSavePhase(state)).toBe(false);
	});
});
