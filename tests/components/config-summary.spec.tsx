import {render} from 'ink-testing-library';
import {ConfigSummary} from '../../source/components/config-summary.js';
import {defaultTheme} from '../../source/models/theme.js';
import type {ConfigurationData} from '../../source/models/wizard-state.js';

test('ConfigSummary visual snapshot - minimal config', () => {
	const minimalData: ConfigurationData = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [
			{
				url: 'https://example.com',
				features: 'Homepage with hero section and CTA button',
			},
		],
		personas: ['Product manager, 30-40 years old, needs quick insights'],
		reportOutput: './ux-report.md',
	};

	const {lastFrame} = render(
		<ConfigSummary data={minimalData} theme={defaultTheme} />,
	);

	const frame = lastFrame();
	expect(frame).toMatchSnapshot('config-summary-minimal');
});

test('ConfigSummary visual snapshot - full config with multiple pages', () => {
	const fullData: ConfigurationData = {
		mainPageUrl: 'https://example.com',
		subPageUrls: ['https://example.com/about', 'https://example.com/contact'],
		pages: [
			{
				url: 'https://example.com',
				features: 'Homepage with hero section and call-to-action',
			},
			{
				url: 'https://example.com/about',
				features: 'About page with company information and team profiles',
			},
			{
				url: 'https://example.com/contact',
				features: 'Contact page with form validation and location map',
			},
		],
		personas: [
			'Marketing manager, 35-45 years old, needs quick insights into campaign performance',
			'Product designer, 25-35 years old, focuses on user experience and design consistency',
		],
		reportOutput: './reports/ux-analysis.md',
	};

	const {lastFrame} = render(
		<ConfigSummary data={fullData} theme={defaultTheme} />,
	);

	const frame = lastFrame();
	expect(frame).toMatchSnapshot('config-summary-full');
});

test('ConfigSummary visual snapshot - long text truncation', () => {
	const longTextData: ConfigurationData = {
		mainPageUrl: 'https://example.com',
		subPageUrls: [],
		pages: [
			{
				url: 'https://example.com',
				features:
					'This is a very long description that exceeds 100 characters and should be truncated with an ellipsis to keep the display clean and readable for users reviewing the configuration summary',
			},
		],
		personas: [
			'This is a very long persona description that exceeds 80 characters and should be truncated with an ellipsis to ensure the summary display remains compact and scannable',
		],
		reportOutput: './ux-report.md',
	};

	const {lastFrame} = render(
		<ConfigSummary data={longTextData} theme={defaultTheme} />,
	);

	const frame = lastFrame();
	expect(frame).toMatchSnapshot('config-summary-truncated');
});
