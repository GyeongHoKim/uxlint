import test from 'ava';
import {
	themeEngine,
	defaultTheme,
	fallbackTheme,
} from '../../source/models/index.js';

// Theme Constants Tests
test('defaultTheme has all required properties', t => {
	// Primary colors
	t.is(typeof defaultTheme.primary, 'string');
	t.is(typeof defaultTheme.secondary, 'string');
	t.is(typeof defaultTheme.accent, 'string');

	// Gradient colors
	t.is(typeof defaultTheme.gradient.start, 'string');
	t.is(typeof defaultTheme.gradient.end, 'string');

	// Text colors
	t.is(typeof defaultTheme.text.primary, 'string');
	t.is(typeof defaultTheme.text.secondary, 'string');
	t.is(typeof defaultTheme.text.muted, 'string');

	// Status colors
	t.is(typeof defaultTheme.status.success, 'string');
	t.is(typeof defaultTheme.status.error, 'string');
	t.is(typeof defaultTheme.status.warning, 'string');
});

test('defaultTheme uses hex color format', t => {
	t.regex(defaultTheme.primary, /^#[\da-f]{6}$/i);
	t.regex(defaultTheme.secondary, /^#[\da-f]{6}$/i);
	t.regex(defaultTheme.accent, /^#[\da-f]{6}$/i);

	t.regex(defaultTheme.gradient.start, /^#[\da-f]{6}$/i);
	t.regex(defaultTheme.gradient.end, /^#[\da-f]{6}$/i);

	t.regex(defaultTheme.text.primary, /^#[\da-f]{6}$/i);
	t.regex(defaultTheme.text.secondary, /^#[\da-f]{6}$/i);
	t.regex(defaultTheme.text.muted, /^#[\da-f]{6}$/i);

	t.regex(defaultTheme.status.success, /^#[\da-f]{6}$/i);
	t.regex(defaultTheme.status.error, /^#[\da-f]{6}$/i);
	t.regex(defaultTheme.status.warning, /^#[\da-f]{6}$/i);
});

test('defaultTheme has expected brand colors', t => {
	t.is(defaultTheme.primary, '#6366f1');
	t.is(defaultTheme.secondary, '#8b5cf6');
	t.is(defaultTheme.accent, '#06b6d4');

	t.is(defaultTheme.gradient.start, '#6366f1');
	t.is(defaultTheme.gradient.end, '#8b5cf6');
});

test('fallbackTheme has all required properties', t => {
	t.is(typeof fallbackTheme.primary, 'string');
	t.is(typeof fallbackTheme.secondary, 'string');
	t.is(typeof fallbackTheme.accent, 'string');
	t.is(typeof fallbackTheme.gradient.start, 'string');
	t.is(typeof fallbackTheme.gradient.end, 'string');
	t.is(typeof fallbackTheme.text.primary, 'string');
	t.is(typeof fallbackTheme.text.secondary, 'string');
	t.is(typeof fallbackTheme.text.muted, 'string');
	t.is(typeof fallbackTheme.status.success, 'string');
	t.is(typeof fallbackTheme.status.error, 'string');
	t.is(typeof fallbackTheme.status.warning, 'string');
});

test('fallbackTheme uses named colors', t => {
	t.is(fallbackTheme.primary, 'blue');
	t.is(fallbackTheme.secondary, 'magenta');
	t.is(fallbackTheme.accent, 'cyan');
	t.is(fallbackTheme.status.success, 'green');
	t.is(fallbackTheme.status.error, 'red');
	t.is(fallbackTheme.status.warning, 'yellow');
});

// ThemeEngine.getTheme Tests
test('themeEngine.getTheme returns correct theme based on color support', t => {
	const modernTheme = themeEngine.getTheme(true);
	const fallbackThemeResult = themeEngine.getTheme(false);

	t.deepEqual(modernTheme, defaultTheme);
	t.deepEqual(fallbackThemeResult, fallbackTheme);
});

test('themeEngine.getTheme defaults to defaultTheme when no parameter provided', t => {
	const theme = themeEngine.getTheme();
	t.deepEqual(theme, defaultTheme);
});

// Color Interpolation Tests
test('themeEngine.interpolateColor interpolates between hex colors correctly', t => {
	const startColor = '#ff0000';
	const endColor = '#0000ff';

	t.is(themeEngine.interpolateColor(startColor, endColor, 0), startColor);
	t.is(themeEngine.interpolateColor(startColor, endColor, 1), endColor);

	const midColor = themeEngine.interpolateColor(startColor, endColor, 0.5);
	t.is(midColor, '#800080'); // Should be purple (mix of red and blue)
});

test('themeEngine.interpolateColor handles brand colors correctly', t => {
	const startColor = '#6366f1';
	const endColor = '#8b5cf6';

	const quarter = themeEngine.interpolateColor(startColor, endColor, 0.25);
	const half = themeEngine.interpolateColor(startColor, endColor, 0.5);
	const threeQuarter = themeEngine.interpolateColor(startColor, endColor, 0.75);

	// Results should be valid hex colors
	t.regex(quarter, /^#[\da-f]{6}$/i);
	t.regex(half, /^#[\da-f]{6}$/i);
	t.regex(threeQuarter, /^#[\da-f]{6}$/i);

	// Should be different colors
	t.not(quarter, startColor);
	t.not(half, startColor);
	t.not(threeQuarter, startColor);
});

test('themeEngine.interpolateColor handles named colors by returning closest', t => {
	t.is(themeEngine.interpolateColor('red', 'blue', 0.3), 'red');
	t.is(themeEngine.interpolateColor('red', 'blue', 0.7), 'blue');
});

test('themeEngine.interpolateColor handles invalid hex colors gracefully', t => {
	t.is(themeEngine.interpolateColor('#invalid', '#6366f1', 0.5), '#invalid');
	t.is(themeEngine.interpolateColor('#6366f1', '#invalid', 0.5), '#6366f1');
});

// Gradient Creation Tests
test('themeEngine.createGradient creates gradient for text', t => {
	const result = themeEngine.createGradient('hello', '#ff0000', '#0000ff');

	t.is(result.length, 5);
	t.is(result[0]?.char, 'h');
	t.is(result[4]?.char, 'o');
	t.is(result[0]?.color, '#ff0000');
	t.is(result[4]?.color, '#0000ff');
});

test('themeEngine.createGradient creates gradient for single character', t => {
	const result = themeEngine.createGradient('a', '#ff0000', '#0000ff');

	t.is(result.length, 1);
	t.is(result[0]?.char, 'a');
	t.is(result[0]?.color, '#ff0000');
});

test('themeEngine.createGradient handles empty string', t => {
	const result = themeEngine.createGradient('', '#ff0000', '#0000ff');
	t.is(result.length, 0);
});

test('themeEngine.createGradient works with brand colors', t => {
	const result = themeEngine.createGradient(
		'uxlint',
		defaultTheme.gradient.start,
		defaultTheme.gradient.end,
	);

	t.is(result.length, 6);

	// Check that all colors are valid hex
	for (const coloredChar of result) {
		t.regex(coloredChar.color, /^#[\da-f]{6}$/i);
	}

	// First and last should match gradient start/end
	t.is(result[0]?.color, defaultTheme.gradient.start);
	t.is(result[5]?.color, defaultTheme.gradient.end);
});

// Color Support Detection Tests
test('themeEngine.detectColorSupport returns ColorCapabilities object', t => {
	const capabilities = themeEngine.detectColorSupport();

	t.is(typeof capabilities.level, 'number');
	t.is(typeof capabilities.hasColor, 'boolean');
	t.is(typeof capabilities.supportsRgb, 'boolean');

	// Level should be reasonable (0-3 for chalk levels)
	t.true(capabilities.level >= 0);
	t.true(capabilities.level <= 3);

	// HasColor should match level > 0
	t.is(capabilities.hasColor, capabilities.level > 0);

	// SupportsRgb should match level >= 3
	t.is(capabilities.supportsRgb, capabilities.level >= 3);
});

test('themeEngine.detectColorSupport provides consistent results', t => {
	const capabilities1 = themeEngine.detectColorSupport();
	const capabilities2 = themeEngine.detectColorSupport();

	t.deepEqual(capabilities1, capabilities2);
});
