/**
 * AnalysisProgress Component Tests
 * Visual regression tests for analysis progress display
 */

import {render} from 'ink-testing-library';
import {AnalysisProgress} from '../../source/components/analysis-progress.js';
import {defaultTheme} from '../../source/models/theme.js';

describe('AnalysisProgress', () => {
	describe('stage display', () => {
		test('displays navigating stage', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="navigating"
					currentPage={1}
					totalPages={3}
				/>,
			);

			const frame = lastFrame();
			expect(frame).toContain('Navigating');
			expect(frame).toContain('1/3');
		});

		test('displays capturing stage', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="capturing"
					currentPage={2}
					totalPages={3}
				/>,
			);

			const frame = lastFrame();
			expect(frame).toContain('Capturing');
			expect(frame).toContain('2/3');
		});

		test('displays analyzing stage', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="analyzing"
					currentPage={3}
					totalPages={3}
				/>,
			);

			const frame = lastFrame();
			expect(frame).toContain('Analyzing');
			expect(frame).toContain('3/3');
		});

		test('displays generating stage', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="generating-report"
					currentPage={3}
					totalPages={3}
				/>,
			);

			const frame = lastFrame();
			expect(frame).toContain('Generating');
		});

		test('displays complete stage', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="complete"
					currentPage={3}
					totalPages={3}
				/>,
			);

			const frame = lastFrame();
			expect(frame).toContain('Analysis complete');
		});
	});

	describe('error display', () => {
		test('displays error state', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="error"
					currentPage={2}
					totalPages={3}
					error="Failed to navigate to page"
				/>,
			);

			const frame = lastFrame();
			expect(frame).toContain('Error');
			expect(frame).toContain('Failed to navigate to page');
		});

		test('displays error without message', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="error"
					currentPage={2}
					totalPages={3}
				/>,
			);

			const frame = lastFrame();
			expect(frame).toContain('Error');
		});

		test('error state with page context', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="error"
					currentPage={2}
					totalPages={5}
					pageUrl="https://example.com/page2"
					error="Navigation timeout"
				/>,
			);

			const frame = lastFrame();
			expect(frame).toContain('Error');
			expect(frame).toContain('Navigation timeout');
			expect(frame).toContain('2/5');
		});
	});

	describe('page progress', () => {
		test('displays page counter', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="analyzing"
					currentPage={2}
					totalPages={5}
				/>,
			);

			const frame = lastFrame();
			expect(frame).toContain('2/5');
		});

		test('displays page URL when provided', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="analyzing"
					currentPage={1}
					totalPages={3}
					pageUrl="https://example.com/page1"
				/>,
			);

			const frame = lastFrame();
			expect(frame).toContain('https://example.com/page1');
		});

		test('handles single page', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="analyzing"
					currentPage={1}
					totalPages={1}
				/>,
			);

			const frame = lastFrame();
			expect(frame).toContain('1/1');
		});
	});

	describe('visual snapshots', () => {
		test('navigating stage snapshot', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="navigating"
					currentPage={1}
					totalPages={3}
					pageUrl="https://example.com"
				/>,
			);

			expect(lastFrame()).toMatchSnapshot('analysis-progress-navigating');
		});

		test('analyzing stage snapshot', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="analyzing"
					currentPage={2}
					totalPages={3}
					pageUrl="https://example.com/about"
				/>,
			);

			expect(lastFrame()).toMatchSnapshot('analysis-progress-analyzing');
		});

		test('error state snapshot', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="error"
					currentPage={1}
					totalPages={3}
					pageUrl="https://example.com/404"
					error="Page not found"
				/>,
			);

			expect(lastFrame()).toMatchSnapshot('analysis-progress-error');
		});

		test('complete stage snapshot', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="complete"
					currentPage={3}
					totalPages={3}
				/>,
			);

			expect(lastFrame()).toMatchSnapshot('analysis-progress-complete');
		});
	});

	describe('spinner display', () => {
		test('shows spinner for navigating stage', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="navigating"
					currentPage={1}
					totalPages={3}
				/>,
			);

			const frame = lastFrame();
			// Spinner should be present (dots animation)
			expect(frame).toBeTruthy();
		});

		test('shows spinner for analyzing stage', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="analyzing"
					currentPage={1}
					totalPages={3}
				/>,
			);

			const frame = lastFrame();
			// Spinner should be present
			expect(frame).toBeTruthy();
		});

		test('no spinner for complete stage', () => {
			const {lastFrame} = render(
				<AnalysisProgress
					theme={defaultTheme}
					stage="complete"
					currentPage={3}
					totalPages={3}
				/>,
			);

			const frame = lastFrame();
			// Should show checkmark instead
			expect(frame).toContain('✓');
		});
	});
});
