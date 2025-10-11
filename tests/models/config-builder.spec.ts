/**
 * Config Builder Tests
 * Unit tests for building and serializing UxLintConfig from wizard data
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import type {
	ConfigurationData,
	SaveOptions,
} from '../../source/models/wizard-state.js';
import type {UxLintConfig} from '../../source/models/config.js';
import {
	buildConfig,
	canBuildConfig,
} from '../../source/models/config-builder.js';
import {
	serializeToJson,
	serializeToYaml,
	determineFilePath,
	getDefaultReportPath,
	formatFileSize,
	saveConfigToFile,
	trySaveConfig,
	type SaveResult,
} from '../../source/models/config-io.js';

// Test data
const validConfigData: ConfigurationData = {
	mainPageUrl: 'https://example.com',
	subPageUrls: ['https://example.com/about', 'https://example.com/contact'],
	pages: [
		{url: 'https://example.com', features: 'Home page with hero section'},
		{
			url: 'https://example.com/about',
			features: 'About page with team information',
		},
		{
			url: 'https://example.com/contact',
			features: 'Contact form with validation',
		},
	],
	personas: [
		'Developer with accessibility needs using screen reader and keyboard navigation',
		'Mobile user on slow connection with focus on performance',
	],
	reportOutput: './ux-report.md',
};

describe('buildConfig', () => {
	it('should transform ConfigurationData to UxLintConfig', () => {
		const result: UxLintConfig = buildConfig(validConfigData);

		expect(result.mainPageUrl).toBe('https://example.com');
		expect(result.subPageUrls).toEqual([
			'https://example.com/about',
			'https://example.com/contact',
		]);
		expect(result.pages).toEqual(validConfigData.pages);
		expect(result.personas).toEqual(validConfigData.personas);
		expect(result.report.output).toBe('./ux-report.md');
	});

	it('should create valid UxLintConfig structure', () => {
		const result: UxLintConfig = buildConfig(validConfigData);

		// Verify structure
		expect(result).toHaveProperty('mainPageUrl');
		expect(result).toHaveProperty('subPageUrls');
		expect(result).toHaveProperty('pages');
		expect(result).toHaveProperty('personas');
		expect(result).toHaveProperty('report');
		expect(result.report).toHaveProperty('output');
	});

	it('should handle empty subPageUrls', () => {
		const dataWithoutSubPages: ConfigurationData = {
			...validConfigData,
			subPageUrls: [],
		};

		const result: UxLintConfig = buildConfig(dataWithoutSubPages);

		expect(result.subPageUrls).toEqual([]);
		expect(result.mainPageUrl).toBe('https://example.com');
	});

	it('should preserve all page entries', () => {
		const result: UxLintConfig = buildConfig(validConfigData);

		expect(result.pages.length).toBe(3);
		const firstPage = result.pages[0];
		if (firstPage) {
			expect(firstPage.url).toBe('https://example.com');
			expect(firstPage.features).toBe('Home page with hero section');
		}
	});

	it('should preserve all personas', () => {
		const result: UxLintConfig = buildConfig(validConfigData);

		expect(result.personas.length).toBe(2);
		expect(result.personas[0]).toContain('accessibility');
		expect(result.personas[1]).toContain('Mobile user');
	});
});

describe('serializeToJson', () => {
	it('should serialize UxLintConfig to JSON with 2-space indentation', () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const json = serializeToJson(config);

		// Verify it's valid JSON
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		expect(() => JSON.parse(json)).not.toThrow();

		// Verify 2-space indentation
		expect(json).toContain('  "mainPageUrl"');
		expect(json).toContain('  "subPageUrls"');

		// Verify content
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const parsed: UxLintConfig = JSON.parse(json);
		expect(parsed.mainPageUrl).toBe('https://example.com');
		expect(parsed.report.output).toBe('./ux-report.md');
	});

	it('should produce valid JSON that can be parsed back', () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const json = serializeToJson(config);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const parsed: UxLintConfig = JSON.parse(json);

		expect(parsed.mainPageUrl).toBe(config.mainPageUrl);
		expect(parsed.subPageUrls).toEqual(config.subPageUrls);
		expect(parsed.pages).toEqual(config.pages);
		expect(parsed.personas).toEqual(config.personas);
		expect(parsed.report.output).toBe(config.report.output);
	});

	it('should handle empty arrays correctly', () => {
		const configWithEmptySubPages: UxLintConfig = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Home page'}],
			personas: ['Test persona with minimum required length'],
			report: {output: './ux-report.md'},
		};

		const json = serializeToJson(configWithEmptySubPages);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const parsed: UxLintConfig = JSON.parse(json);

		expect(Array.isArray(parsed.subPageUrls)).toBe(true);
		expect(parsed.subPageUrls.length).toBe(0);
	});
});

describe('serializeToYaml', () => {
	it('should serialize UxLintConfig to YAML format', () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const yaml = serializeToYaml(config);

		// Verify YAML structure
		expect(yaml).toContain('mainPageUrl:');
		expect(yaml).toContain('subPageUrls:');
		expect(yaml).toContain('pages:');
		expect(yaml).toContain('personas:');
		expect(yaml).toContain('report:');

		// Verify content
		expect(yaml).toContain('https://example.com');
		expect(yaml).toContain('./ux-report.md');
	});

	it('should produce valid YAML with proper indentation', () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const yaml = serializeToYaml(config);

		// YAML typically uses 2-space indentation
		expect(yaml).toMatch(/\n {2}-/); // Array items
		expect(yaml).toMatch(/\n {2}\w+:/); // Nested properties
	});

	it('should handle arrays correctly in YAML', () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const yaml = serializeToYaml(config);

		// Verify array syntax
		expect(yaml).toContain('subPageUrls:');
		expect(yaml).toContain('- https://example.com/about');
		expect(yaml).toContain('- https://example.com/contact');
	});

	it('should handle nested objects correctly', () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const yaml = serializeToYaml(config);

		// Verify report nested structure
		expect(yaml).toContain('report:');
		expect(yaml).toContain('output:');
	});
});

describe('determineFilePath', () => {
	it('should return custom file path when provided', () => {
		const saveOptions: SaveOptions = {
			shouldSave: true,
			format: 'yaml',
			filePath: './custom-config.yaml',
		};

		const result = determineFilePath(saveOptions);

		expect(result).toBe('./custom-config.yaml');
	});

	it('should return default .uxlintrc.yaml for yaml format', () => {
		const saveOptions: SaveOptions = {
			shouldSave: true,
			format: 'yaml',
		};

		const result = determineFilePath(saveOptions);

		expect(result).toBe('.uxlintrc.yaml');
	});

	it('should return default .uxlintrc.json for json format', () => {
		const saveOptions: SaveOptions = {
			shouldSave: true,
			format: 'json',
		};

		const result = determineFilePath(saveOptions);

		expect(result).toBe('.uxlintrc.json');
	});

	it('should default to yaml when format is not specified', () => {
		const saveOptions: SaveOptions = {
			shouldSave: true,
			format: undefined,
		};

		const result = determineFilePath(saveOptions);

		expect(result).toBe('.uxlintrc.yaml');
	});

	it('should prefer custom path over format-based default', () => {
		const saveOptions: SaveOptions = {
			shouldSave: true,
			format: 'json',
			filePath: '/tmp/my-config.yaml',
		};

		const result = determineFilePath(saveOptions);

		expect(result).toBe('/tmp/my-config.yaml');
	});
});

describe('canBuildConfig', () => {
	it('should return true for complete configuration data', () => {
		expect(canBuildConfig(validConfigData)).toBe(true);
	});

	it('should return false for undefined data', () => {
		expect(canBuildConfig(undefined)).toBe(false);
	});

	it('should return false for missing mainPageUrl', () => {
		const incomplete = {...validConfigData, mainPageUrl: ''};
		expect(canBuildConfig(incomplete)).toBe(false);
	});

	it('should return false for empty pages array', () => {
		const incomplete = {...validConfigData, pages: []};
		expect(canBuildConfig(incomplete)).toBe(false);
	});

	it('should return false for empty personas array', () => {
		const incomplete = {...validConfigData, personas: []};
		expect(canBuildConfig(incomplete)).toBe(false);
	});

	it('should return false for missing reportOutput', () => {
		const incomplete = {...validConfigData, reportOutput: ''};
		expect(canBuildConfig(incomplete)).toBe(false);
	});

	it('should return true for minimal valid configuration', () => {
		const minimalConfig: ConfigurationData = {
			mainPageUrl: 'https://example.com',
			subPageUrls: [],
			pages: [{url: 'https://example.com', features: 'Home page'}],
			personas: ['Minimal valid persona description'],
			reportOutput: './report.md',
		};

		expect(canBuildConfig(minimalConfig)).toBe(true);
	});
});

describe('getDefaultReportPath', () => {
	it('should return default report path', () => {
		const result = getDefaultReportPath();

		expect(result).toBe('./ux-report.md');
	});
});

describe('formatFileSize', () => {
	it('should format bytes correctly', () => {
		expect(formatFileSize(500)).toBe('500 B');
		expect(formatFileSize(1023)).toBe('1023 B');
	});

	it('should format kilobytes correctly', () => {
		expect(formatFileSize(1024)).toBe('1.0 KB');
		expect(formatFileSize(1536)).toBe('1.5 KB');
		expect(formatFileSize(10_240)).toBe('10.0 KB');
	});

	it('should format megabytes correctly', () => {
		expect(formatFileSize(1_048_576)).toBe('1.0 MB');
		expect(formatFileSize(1_572_864)).toBe('1.5 MB');
		expect(formatFileSize(10_485_760)).toBe('10.0 MB');
	});

	it('should round to one decimal place', () => {
		expect(formatFileSize(1234)).toBe('1.2 KB');
		expect(formatFileSize(1_638_400)).toBe('1.6 MB');
	});
});

describe('saveConfigToFile', () => {
	const testDir = '/tmp/uxlint-test-output';
	let testFilePath: string;

	beforeEach(() => {
		testFilePath = path.join(testDir, 'test-config.yaml');
		// Create test directory
		if (!fs.existsSync(testDir)) {
			fs.mkdirSync(testDir, {recursive: true});
		}
	});

	afterEach(() => {
		// Clean up test files
		try {
			if (fs.existsSync(testFilePath)) {
				fs.unlinkSync(testFilePath);
			}

			if (fs.existsSync(testDir)) {
				fs.rmdirSync(testDir);
			}
		} catch {
			// Ignore cleanup errors
		}
	});

	it('should save YAML config to file', async () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const saveOptions: SaveOptions = {
			shouldSave: true,
			format: 'yaml',
			filePath: testFilePath,
		};

		const result = await saveConfigToFile(config, saveOptions);

		expect(result).toBe(testFilePath);
		expect(fs.existsSync(testFilePath)).toBe(true);

		const content = fs.readFileSync(testFilePath, 'utf8');
		expect(content).toContain('mainPageUrl:');
		expect(content).toContain('https://example.com');
	});

	it('should save JSON config to file', async () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const jsonFilePath = path.join(testDir, 'test-config.json');
		const saveOptions: SaveOptions = {
			shouldSave: true,
			format: 'json',
			filePath: jsonFilePath,
		};

		const result = await saveConfigToFile(config, saveOptions);

		expect(result).toBe(jsonFilePath);
		expect(fs.existsSync(jsonFilePath)).toBe(true);

		const content = fs.readFileSync(jsonFilePath, 'utf8');
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const parsed: UxLintConfig = JSON.parse(content);
		expect(parsed.mainPageUrl).toBe('https://example.com');

		// Cleanup
		fs.unlinkSync(jsonFilePath);
	});

	it('should throw error when shouldSave is false', async () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const saveOptions: SaveOptions = {
			shouldSave: false,
			format: undefined,
		};

		await expect(saveConfigToFile(config, saveOptions)).rejects.toThrow(
			'Cannot save config when shouldSave is false',
		);
	});

	it('should overwrite existing file', async () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const saveOptions: SaveOptions = {
			shouldSave: true,
			format: 'yaml',
			filePath: testFilePath,
		};

		// Save first time
		await saveConfigToFile(config, saveOptions);
		const firstContent = fs.readFileSync(testFilePath, 'utf8');

		// Modify config and save again
		const modifiedConfig = {...config, mainPageUrl: 'https://modified.com'};
		await saveConfigToFile(modifiedConfig, saveOptions);
		const secondContent = fs.readFileSync(testFilePath, 'utf8');

		expect(firstContent).not.toBe(secondContent);
		expect(secondContent).toContain('https://modified.com');
	});
});

describe('trySaveConfig', () => {
	const testDir = '/tmp/uxlint-test-output';
	let testFilePath: string;

	beforeEach(() => {
		testFilePath = path.join(testDir, 'test-config.yaml');
		if (!fs.existsSync(testDir)) {
			fs.mkdirSync(testDir, {recursive: true});
		}
	});

	afterEach(() => {
		try {
			if (fs.existsSync(testFilePath)) {
				fs.unlinkSync(testFilePath);
			}

			if (fs.existsSync(testDir)) {
				fs.rmdirSync(testDir);
			}
		} catch {
			// Ignore cleanup errors
		}
	});

	it('should return success result when save succeeds', async () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const saveOptions: SaveOptions = {
			shouldSave: true,
			format: 'yaml',
			filePath: testFilePath,
		};

		const result: SaveResult = await trySaveConfig(config, saveOptions);

		expect(result.success).toBe(true);
		expect(result.filePath).toBe(testFilePath);
		expect(result.fileSize).toBeGreaterThan(0);
		expect(result.error).toBeUndefined();
	});

	it('should return failure result when shouldSave is false', async () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const saveOptions: SaveOptions = {
			shouldSave: false,
			format: undefined,
		};

		const result: SaveResult = await trySaveConfig(config, saveOptions);

		expect(result.success).toBe(false);
		expect(result.error).toBe('Save was not requested');
		expect(result.filePath).toBeUndefined();
		expect(result.fileSize).toBeUndefined();
	});

	it('should return failure result when save fails', async () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const invalidPath = '/invalid/path/that/does/not/exist/config.yaml';
		const saveOptions: SaveOptions = {
			shouldSave: true,
			format: 'yaml',
			filePath: invalidPath,
		};

		const result: SaveResult = await trySaveConfig(config, saveOptions);

		expect(result.success).toBe(false);
		expect(result.error).toBeDefined();
		expect(result.filePath).toBeUndefined();
	});

	it('should include file size in success result', async () => {
		const config: UxLintConfig = buildConfig(validConfigData);
		const saveOptions: SaveOptions = {
			shouldSave: true,
			format: 'json',
			filePath: testFilePath,
		};

		const result: SaveResult = await trySaveConfig(config, saveOptions);

		expect(result.success).toBe(true);
		expect(result.fileSize).toBeGreaterThan(0);
		expect(typeof result.fileSize).toBe('number');
	});
});
