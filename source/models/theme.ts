/**
 * Theme constants and utilities for uxlint CLI interface
 * Provides centralized color management and theme configuration
 */

export type ThemeConfig = {
	primary: string;
	secondary: string;
	accent: string;
	gradient: {
		start: string;
		end: string;
	};
	text: {
		primary: string;
		secondary: string;
		muted: string;
	};
	status: {
		success: string;
		error: string;
		warning: string;
	};
};

export type ColorCapabilities = {
	level: number;
	hasColor: boolean;
	supportsRgb: boolean;
};

export type ColoredChar = {
	char: string;
	color: string;
};

// Default theme constants for modern terminals with full color support
export const defaultTheme: ThemeConfig = {
	primary: '#6366f1',
	secondary: '#8b5cf6',
	accent: '#06b6d4',
	gradient: {
		start: '#6366f1',
		end: '#8b5cf6',
	},
	text: {
		primary: '#ffffff',
		secondary: '#e2e8f0',
		muted: '#94a3b8',
	},
	status: {
		success: '#10b981',
		error: '#ef4444',
		warning: '#f59e0b',
	},
};

// Fallback theme for terminals with limited color support
export const fallbackTheme: ThemeConfig = {
	primary: 'blue',
	secondary: 'magenta',
	accent: 'cyan',
	gradient: {
		start: 'blue',
		end: 'magenta',
	},
	text: {
		primary: 'white',
		secondary: 'gray',
		muted: 'gray',
	},
	status: {
		success: 'green',
		error: 'red',
		warning: 'yellow',
	},
};

/**
 * Convert hex color to RGB object
 */
function hexToRgb(hex: string): {r: number; g: number; b: number} | undefined {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) {
		return undefined;
	}

	return {
		r: Number.parseInt(result[1]!, 16),
		g: Number.parseInt(result[2]!, 16),
		b: Number.parseInt(result[3]!, 16),
	};
}

/**
 * Convert RGB values to hex color
 */
function rgbToHex(r: number, g: number, b: number): string {
	// Convert RGB values to hex format
	const toHex = (value: number) => value.toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Theme utility functions for color management and gradient creation
 */
export const themeEngine = {
	/**
	 * Get appropriate theme based on color support capabilities
	 */
	getTheme(colorSupport = true): ThemeConfig {
		return colorSupport ? defaultTheme : fallbackTheme;
	},

	/**
	 * Interpolate between two hex colors
	 */
	interpolateColor(start: string, end: string, ratio: number): string {
		// Handle named colors by returning start color for simplicity
		if (!start.startsWith('#') || !end.startsWith('#')) {
			return ratio < 0.5 ? start : end;
		}

		// Parse hex colors
		const startRgb = hexToRgb(start);
		const endRgb = hexToRgb(end);

		if (!startRgb || !endRgb) {
			return start;
		}

		// Interpolate RGB values
		const r = Math.round(startRgb.r + (endRgb.r - startRgb.r) * ratio);
		const g = Math.round(startRgb.g + (endRgb.g - startRgb.g) * ratio);
		const b = Math.round(startRgb.b + (endRgb.b - startRgb.b) * ratio);

		return rgbToHex(r, g, b);
	},

	/**
	 * Create gradient color array for text characters
	 */
	createGradient(
		text: string,
		startColor: string,
		endColor: string,
	): ColoredChar[] {
		if (text.length === 0) {
			return [];
		}

		if (text.length === 1) {
			return [{char: text, color: startColor}];
		}

		return [...text].map((char, index) => {
			const ratio = index / (text.length - 1);
			const color = themeEngine.interpolateColor(startColor, endColor, ratio);
			return {char, color};
		});
	},

	/**
	 * Detect color support capabilities (placeholder for chalk integration)
	 */
	detectColorSupport(): ColorCapabilities {
		// This will be enhanced when chalk is integrated
		// For now, assume modern terminal support
		return {
			level: 3,
			hasColor: true,
			supportsRgb: true,
		};
	},
};
