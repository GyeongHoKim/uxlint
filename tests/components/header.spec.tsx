// Using Jest globals
import {render} from 'ink-testing-library';
import {Header} from '../../source/components/header.js';
import {defaultTheme, fallbackTheme} from '../../source/models/theme.js';

test('Header visual snapshot - default theme', () => {
	const {lastFrame} = render(<Header theme={defaultTheme} />);

	const frame = lastFrame();
	expect(frame).toMatchSnapshot('header-default-theme');
});

test('Header visual snapshot - fallback theme', () => {
	const {lastFrame} = render(<Header theme={fallbackTheme} />);

	const frame = lastFrame();
	expect(frame).toMatchSnapshot('header-fallback-theme');
});

test('Header visual snapshot - custom brand colors', () => {
	const customTheme = {
		...defaultTheme,
		primary: '#ff6b6b',
		secondary: '#4ecdc4',
		accent: '#45b7d1',
		text: {
			primary: '#ffffff',
			secondary: '#f8f9fa',
			muted: '#adb5bd',
		},
	};

	const {lastFrame} = render(<Header theme={customTheme} />);

	const frame = lastFrame();
	expect(frame).toMatchSnapshot('header-custom-brand-colors');
});

test('Header visual snapshot - high contrast theme', () => {
	const highContrastTheme = {
		...defaultTheme,
		primary: '#000000',
		secondary: '#ffffff',
		accent: '#ffff00',
		text: {
			primary: '#ffffff',
			secondary: '#000000',
			muted: '#808080',
		},
	};

	const {lastFrame} = render(<Header theme={highContrastTheme} />);

	const frame = lastFrame();
	expect(frame).toMatchSnapshot('header-high-contrast-theme');
});

test('Header visual snapshot - monochrome theme', () => {
	const monochromeTheme = {
		...defaultTheme,
		primary: '#333333',
		secondary: '#666666',
		accent: '#999999',
		text: {
			primary: '#ffffff',
			secondary: '#cccccc',
			muted: '#888888',
		},
	};

	const {lastFrame} = render(<Header theme={monochromeTheme} />);

	const frame = lastFrame();
	expect(frame).toMatchSnapshot('header-monochrome-theme');
});
