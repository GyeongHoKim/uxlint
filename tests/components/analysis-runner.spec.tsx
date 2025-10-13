/**
 * AnalysisRunner Component Tests
 * Tests for analysis orchestration component
 */

import {render} from 'ink-testing-library';
import {AnalysisRunner} from '../../source/components/analysis-runner.js';
import {defaultTheme} from '../../source/models/theme.js';
import type {UxLintConfig} from '../../source/models/config.js';

describe('AnalysisRunner', () => {
	const mockConfig: UxLintConfig = {
		mainPageUrl: 'https://example.com',
		subPageUrls: ['https://example.com/about'],
		pages: [
			{url: 'https://example.com', features: 'Homepage features'},
			{url: 'https://example.com/about', features: 'About page features'},
		],
		personas: ['Tech-savvy user', 'Screen reader user'],
		report: {output: './report.md'},
	};

	describe('initialization', () => {
		test('displays idle state initially', () => {
			const {lastFrame} = render(
				<AnalysisRunner theme={defaultTheme} config={mockConfig} />,
			);

			const frame = lastFrame();
			// Should show idle or start analyzing immediately
			expect(frame).toBeTruthy();
		});
	});

	describe('progress display', () => {
		test('renders AnalysisProgress component', () => {
			const {lastFrame} = render(
				<AnalysisRunner theme={defaultTheme} config={mockConfig} />,
			);

			const frame = lastFrame();
			// Should show analysis progress UI
			expect(frame).toBeTruthy();
		});
	});

	describe('configuration', () => {
		test('displays page count from config', () => {
			const {lastFrame} = render(
				<AnalysisRunner theme={defaultTheme} config={mockConfig} />,
			);

			const frame = lastFrame();
			// Should indicate analyzing 2 pages
			expect(frame).toContain('2');
		});
	});

	describe('visual snapshots', () => {
		test('initial state snapshot', () => {
			const {lastFrame} = render(
				<AnalysisRunner theme={defaultTheme} config={mockConfig} />,
			);

			expect(lastFrame()).toMatchSnapshot('analysis-runner-initial');
		});

		test('single page config snapshot', () => {
			const singlePageConfig: UxLintConfig = {
				...mockConfig,
				subPageUrls: [],
				pages: [{url: 'https://example.com', features: 'Homepage features'}],
			};

			const {lastFrame} = render(
				<AnalysisRunner theme={defaultTheme} config={singlePageConfig} />,
			);

			expect(lastFrame()).toMatchSnapshot('analysis-runner-single-page');
		});
	});
});
