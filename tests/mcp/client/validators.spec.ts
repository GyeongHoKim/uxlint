/**
 * Unit tests for MCP client validators (T032)
 *
 * Tests URL, CSS selector, JavaScript, and timeout validation
 * per User Story 4 requirements.
 */

import {describe, it, expect} from '@jest/globals';
import {
	isValidUrl,
	isValidSelector,
	isScriptSafe,
	isValidTimeout,
	getUrlValidationError,
	getSelectorValidationError,
	getScriptValidationError,
	getTimeoutValidationError,
} from '../../../source/mcp/client/validators.js';

describe('T032: Parameter Validation', () => {
	describe('URL validation (WHATWG URL Standard)', () => {
		it('accepts valid HTTP URLs', () => {
			expect(isValidUrl('http://example.com')).toBe(true);
			expect(isValidUrl('http://example.com/path')).toBe(true);
			expect(isValidUrl('http://example.com:8080')).toBe(true);
		});

		it('accepts valid HTTPS URLs', () => {
			expect(isValidUrl('https://example.com')).toBe(true);
			expect(isValidUrl('https://example.com/path')).toBe(true);
			expect(isValidUrl('https://example.com?query=value')).toBe(true);
		});

		it('rejects non-http(s) protocols', () => {
			expect(isValidUrl('ftp://example.com')).toBe(false);
			expect(isValidUrl('file:///path/to/file')).toBe(false);
			// eslint-disable-next-line no-script-url
			expect(isValidUrl('javascript:alert(1)')).toBe(false);
		});

		it('rejects malformed URLs', () => {
			expect(isValidUrl('not-a-url')).toBe(false);
			expect(isValidUrl('htp://missing-t')).toBe(false);
			expect(isValidUrl('')).toBe(false);
			expect(isValidUrl('   ')).toBe(false);
		});

		it('provides clear error messages', () => {
			expect(getUrlValidationError('')).toBe('URL must be a non-empty string');
			expect(getUrlValidationError('not-a-url')).toBe('Invalid URL format');
			expect(getUrlValidationError('ftp://example.com')).toBe(
				'URL must use http or https protocol',
			);
			expect(getUrlValidationError('https://example.com')).toBe('');
		});
	});

	describe('CSS selector validation', () => {
		it('accepts valid CSS selectors', () => {
			expect(isValidSelector('.class-name')).toBe(true);
			expect(isValidSelector('#id-name')).toBe(true);
			expect(isValidSelector('div')).toBe(true);
			expect(isValidSelector('div.class')).toBe(true);
			expect(isValidSelector('div > p')).toBe(true);
			expect(isValidSelector('[data-test="value"]')).toBe(true);
			expect(isValidSelector(':hover')).toBe(true);
		});

		it('rejects XPath selectors', () => {
			expect(isValidSelector('//div')).toBe(false);
			expect(isValidSelector('//div[@id="test"]')).toBe(false);
			expect(isValidSelector('/html/body/div')).toBe(false);
		});

		it('rejects empty or invalid selectors', () => {
			expect(isValidSelector('')).toBe(false);
			expect(isValidSelector('   ')).toBe(false);
		});

		it('provides clear error messages', () => {
			expect(getSelectorValidationError('')).toBe(
				'Selector must be a non-empty string',
			);
			expect(getSelectorValidationError('   ')).toBe(
				'Selector cannot be empty or whitespace only',
			);
			expect(getSelectorValidationError('//div')).toBe(
				'XPath selectors are not supported. Use CSS selectors instead.',
			);
			expect(getSelectorValidationError('.my-class')).toBe('');
		});
	});

	describe('JavaScript safety validation', () => {
		it('accepts safe scripts', () => {
			expect(isScriptSafe('document.title')).toBe(true);
			expect(isScriptSafe('window.location.href')).toBe(true);
			expect(isScriptSafe('() => document.querySelector(".test")')).toBe(true);
			expect(isScriptSafe('document.querySelectorAll("div").length')).toBe(
				true,
			);
		});

		it('rejects scripts with require', () => {
			expect(isScriptSafe("require('fs')")).toBe(false);
			expect(isScriptSafe('const fs = require("fs")')).toBe(false);
		});

		it('rejects scripts with import', () => {
			expect(isScriptSafe('import fs from "fs"')).toBe(false);
			expect(isScriptSafe('import * as fs from "fs"')).toBe(false);
		});

		it('rejects scripts with eval', () => {
			expect(isScriptSafe('eval("malicious code")')).toBe(false);
			expect(isScriptSafe('window.eval("code")')).toBe(false);
		});

		it('rejects scripts with function constructor', () => {
			expect(isScriptSafe('function() { return 1; }')).toBe(false);
			expect(isScriptSafe('new function() { }')).toBe(false);
		});

		it('rejects scripts exceeding length limit', () => {
			const longScript = 'a'.repeat(10_001);
			expect(isScriptSafe(longScript)).toBe(false);
		});

		it('provides clear error messages', () => {
			expect(getScriptValidationError('')).toBe(
				'Script must be a non-empty string',
			);
			expect(getScriptValidationError("require('fs')")).toBe(
				'Script cannot use require()',
			);
			expect(getScriptValidationError('import fs from "fs"')).toBe(
				'Script cannot use import statements',
			);
			expect(getScriptValidationError('eval("code")')).toBe(
				'Script cannot use eval()',
			);
			expect(getScriptValidationError('document.title')).toBe('');
		});
	});

	describe('Timeout validation (1000-300000ms range)', () => {
		it('accepts valid timeouts', () => {
			expect(isValidTimeout(1000)).toBe(true); // 1 second
			expect(isValidTimeout(30_000)).toBe(true); // 30 seconds
			expect(isValidTimeout(300_000)).toBe(true); // 5 minutes
			expect(isValidTimeout(5000)).toBe(true);
		});

		it('rejects timeouts below minimum', () => {
			expect(isValidTimeout(999)).toBe(false);
			expect(isValidTimeout(0)).toBe(false);
			expect(isValidTimeout(500)).toBe(false);
		});

		it('rejects timeouts above maximum', () => {
			expect(isValidTimeout(300_001)).toBe(false);
			expect(isValidTimeout(600_000)).toBe(false);
		});

		it('rejects invalid timeout values', () => {
			expect(isValidTimeout(Number.NaN)).toBe(false);
			expect(isValidTimeout(Number.POSITIVE_INFINITY)).toBe(false);
			expect(isValidTimeout(Number.NEGATIVE_INFINITY)).toBe(false);
		});

		it('provides clear error messages', () => {
			expect(getTimeoutValidationError(Number.NaN)).toBe(
				'Timeout must be a valid number',
			);
			expect(getTimeoutValidationError(500)).toBe(
				'Timeout must be at least 1000ms (1 second)',
			);
			expect(getTimeoutValidationError(400_000)).toBe(
				'Timeout cannot exceed 300000ms (5 minutes)',
			);
			expect(getTimeoutValidationError(30_000)).toBe('');
		});
	});

	describe('Edge cases', () => {
		it('handles null and undefined gracefully', () => {
			// @ts-expect-error Testing invalid input
			expect(isValidUrl(null)).toBe(false);
			// @ts-expect-error Testing invalid input
			expect(isValidUrl(undefined)).toBe(false);
			// @ts-expect-error Testing invalid input
			expect(isValidSelector(null)).toBe(false);
			// @ts-expect-error Testing invalid input
			expect(isScriptSafe(null)).toBe(false);
			// @ts-expect-error Testing invalid input
			expect(isValidTimeout(null)).toBe(false);
		});

		it('handles special characters in URLs', () => {
			expect(isValidUrl('https://example.com/path?a=1&b=2')).toBe(true);
			expect(isValidUrl('https://example.com/path#fragment')).toBe(true);
			expect(isValidUrl('https://user:pass@example.com')).toBe(true);
		});

		it('handles complex CSS selectors', () => {
			expect(isValidSelector('div.class1.class2')).toBe(true);
			expect(isValidSelector('div > p + span')).toBe(true);
			expect(isValidSelector('[attr^="value"]')).toBe(true);
			expect(isValidSelector(':not(.excluded)')).toBe(true);
		});
	});
});
