// Using Jest globals
import {
	defaultTheme,
	fallbackTheme,
	themeEngine,
} from '../../source/models/index.js';

// Theme Constants Tests
test('defaultTheme has all required properties', () => {
	// Primary colors
	expect(typeof defaultTheme.primary).toBe('string');
	expect(typeof defaultTheme.secondary).toBe('string');
	expect(typeof defaultTheme.accent).toBe('string');

	// Gradient colors
	expect(typeof defaultTheme.gradient.start).toBe('string');
	expect(typeof defaultTheme.gradient.end).toBe('string');

	// Text colors
	expect(typeof defaultTheme.text.primary).toBe('string');
	expect(typeof defaultTheme.text.secondary).toBe('string');
	expect(typeof defaultTheme.text.muted).toBe('string');

	// Status colors
	expect(typeof defaultTheme.status.success).toBe('string');
	expect(typeof defaultTheme.status.error).toBe('string');
	expect(typeof defaultTheme.status.warning).toBe('string');
});

test('defaultTheme uses hex color format', () => {
	expect(defaultTheme.primary).toMatch(/^#[\da-f]{6}$/i);
	expect(defaultTheme.secondary).toMatch(/^#[\da-f]{6}$/i);
	expect(defaultTheme.accent).toMatch(/^#[\da-f]{6}$/i);

	expect(defaultTheme.gradient.start).toMatch(/^#[\da-f]{6}$/i);
	expect(defaultTheme.gradient.end).toMatch(/^#[\da-f]{6}$/i);

	expect(defaultTheme.text.primary).toMatch(/^#[\da-f]{6}$/i);
	expect(defaultTheme.text.secondary).toMatch(/^#[\da-f]{6}$/i);
	expect(defaultTheme.text.muted).toMatch(/^#[\da-f]{6}$/i);

	expect(defaultTheme.status.success).toMatch(/^#[\da-f]{6}$/i);
	expect(defaultTheme.status.error).toMatch(/^#[\da-f]{6}$/i);
	expect(defaultTheme.status.warning).toMatch(/^#[\da-f]{6}$/i);
});

test('defaultTheme has expected brand colors', () => {
	expect(defaultTheme.primary).toBe('#6366f1');
	expect(defaultTheme.secondary).toBe('#8b5cf6');
	expect(defaultTheme.accent).toBe('#06b6d4');

	expect(defaultTheme.gradient.start).toBe('#6366f1');
	expect(defaultTheme.gradient.end).toBe('#8b5cf6');
});

test('fallbackTheme has all required properties', () => {
	expect(typeof fallbackTheme.primary).toBe('string');
	expect(typeof fallbackTheme.secondary).toBe('string');
	expect(typeof fallbackTheme.accent).toBe('string');
	expect(typeof fallbackTheme.gradient.start).toBe('string');
	expect(typeof fallbackTheme.gradient.end).toBe('string');
	expect(typeof fallbackTheme.text.primary).toBe('string');
	expect(typeof fallbackTheme.text.secondary).toBe('string');
	expect(typeof fallbackTheme.text.muted).toBe('string');
	expect(typeof fallbackTheme.status.success).toBe('string');
	expect(typeof fallbackTheme.status.error).toBe('string');
	expect(typeof fallbackTheme.status.warning).toBe('string');
});

test('fallbackTheme uses named colors', () => {
	expect(fallbackTheme.primary).toBe('blue');
	expect(fallbackTheme.secondary).toBe('magenta');
	expect(fallbackTheme.accent).toBe('cyan');
	expect(fallbackTheme.status.success).toBe('green');
	expect(fallbackTheme.status.error).toBe('red');
	expect(fallbackTheme.status.warning).toBe('yellow');
});

// ThemeEngine.getTheme Tests
test('themeEngine.getTheme returns correct theme based on color support', () => {
	const modernTheme = themeEngine.getTheme(true);
	const fallbackThemeResult = themeEngine.getTheme(false);

	expect(modernTheme).toEqual(defaultTheme);
	expect(fallbackThemeResult).toEqual(fallbackTheme);
});

test('themeEngine.getTheme defaults to defaultTheme when no parameter provided', () => {
	const theme = themeEngine.getTheme();
	expect(theme).toEqual(defaultTheme);
});

// Color Interpolation Tests
test('themeEngine.interpolateColor interpolates between hex colors correctly', () => {
	const startColor = '#ff0000';
	const endColor = '#0000ff';

	expect(themeEngine.interpolateColor(startColor, endColor, 0)).toBe(
		startColor,
	);
	expect(themeEngine.interpolateColor(startColor, endColor, 1)).toBe(endColor);

	const midColor = themeEngine.interpolateColor(startColor, endColor, 0.5);
	expect(midColor).toBe('#800080');
});

test('themeEngine.interpolateColor handles brand colors correctly', () => {
	const startColor = '#6366f1';
	const endColor = '#8b5cf6';

	const quarter = themeEngine.interpolateColor(startColor, endColor, 0.25);
	const half = themeEngine.interpolateColor(startColor, endColor, 0.5);
	const threeQuarter = themeEngine.interpolateColor(startColor, endColor, 0.75);

	// Results should be valid hex colors
	expect(quarter).toMatch(/^#[\da-f]{6}$/i);
	expect(half).toMatch(/^#[\da-f]{6}$/i);
	expect(threeQuarter).toMatch(/^#[\da-f]{6}$/i);

	// Should be different colors
	expect(quarter).not.toBe(startColor);
	expect(half).not.toBe(startColor);
	expect(threeQuarter).not.toBe(startColor);
});

test('themeEngine.interpolateColor handles named colors by returning closest', () => {
	expect(themeEngine.interpolateColor('red', 'blue', 0.3)).toBe('red');
	expect(themeEngine.interpolateColor('red', 'blue', 0.7)).toBe('blue');
});

test('themeEngine.interpolateColor handles invalid hex colors gracefully', () => {
	expect(themeEngine.interpolateColor('#invalid', '#6366f1', 0.5)).toBe(
		'#invalid',
	);
	expect(themeEngine.interpolateColor('#6366f1', '#invalid', 0.5)).toBe(
		'#6366f1',
	);
});

// Gradient Creation Tests
test('themeEngine.createGradient creates gradient for text', () => {
	const result = themeEngine.createGradient('hello', '#ff0000', '#0000ff');

	expect(result.length).toBe(5);
	expect(result[0]?.char).toBe('h');
	expect(result[4]?.char).toBe('o');
	expect(result[0]?.color).toBe('#ff0000');
	expect(result[4]?.color).toBe('#0000ff');
});

test('themeEngine.createGradient creates gradient for single character', () => {
	const result = themeEngine.createGradient('a', '#ff0000', '#0000ff');

	expect(result.length).toBe(1);
	expect(result[0]?.char).toBe('a');
	expect(result[0]?.color).toBe('#ff0000');
});

test('themeEngine.createGradient handles empty string', () => {
	const result = themeEngine.createGradient('', '#ff0000', '#0000ff');
	expect(result.length).toBe(0);
});

test('themeEngine.createGradient works with brand colors', () => {
	const result = themeEngine.createGradient(
		'uxlint',
		defaultTheme.gradient.start,
		defaultTheme.gradient.end,
	);

	expect(result.length).toBe(6);

	// Check that all colors are valid hex
	for (const coloredChar of result) {
		expect(coloredChar.color).toMatch(/^#[\da-f]{6}$/i);
	}

	// First and last should match gradient start/end
	expect(result[0]?.color).toBe(defaultTheme.gradient.start);
	expect(result[5]?.color).toBe(defaultTheme.gradient.end);
});

// Color Support Detection Tests
test('themeEngine.detectColorSupport returns ColorCapabilities object', () => {
	const capabilities = themeEngine.detectColorSupport();

	expect(typeof capabilities.level).toBe('number');
	expect(typeof capabilities.hasColor).toBe('boolean');
	expect(typeof capabilities.supportsRgb).toBe('boolean');

	// Level should be reasonable (0-3 for chalk levels)
	expect(capabilities.level >= 0).toBeTruthy();
	expect(capabilities.level <= 3).toBeTruthy();

	// HasColor should match level > 0
	expect(capabilities.hasColor).toBe(capabilities.level > 0);

	// SupportsRgb should match level >= 3
	expect(capabilities.supportsRgb).toBe(capabilities.level >= 3);
});

test('themeEngine.detectColorSupport provides consistent results', () => {
	const capabilities1 = themeEngine.detectColorSupport();
	const capabilities2 = themeEngine.detectColorSupport();

	expect(capabilities1).toEqual(capabilities2);
});
