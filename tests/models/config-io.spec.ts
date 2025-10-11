import * as fs from 'node:fs';
import {
	findConfigFile,
	loadConfig,
	parseConfigFile,
	readConfigFile,
	validateConfig,
} from '../../source/models/config-io.js';
import {ConfigurationError} from '../../source/models/errors.js';
import type {MockFileSystem} from './__mocks__/fs.js';

// Mock the node:fs module
jest.mock('node:fs');

// Type assertion for mocked fs module
const mockFs = fs as typeof fs & {
	__setMockFiles: (files: MockFileSystem) => void;
	__clearMockFiles: () => void;
};

describe('config-loader', () => {
	// Test file paths
	const testDir = '/test';
	const testJsonPath = '/test/.uxlintrc.json';
	const testYamlPath = '/test/.uxlintrc.yaml';

	beforeEach(() => {
		mockFs.__clearMockFiles();
	});

	describe('findConfigFile', () => {
		test('should find .uxlintrc.json file', () => {
			mockFs.__setMockFiles({
				[testJsonPath]: '{}',
			});

			const result = findConfigFile(testDir);
			expect(result).toBe(testJsonPath);
		});

		test('should find .uxlintrc.yaml file', () => {
			mockFs.__setMockFiles({
				[testYamlPath]: 'mainPageUrl: test',
			});

			const result = findConfigFile(testDir);
			expect(result).toBe(testYamlPath);
		});

		test('should prioritize .uxlintrc.json over .uxlintrc.yaml', () => {
			mockFs.__setMockFiles({
				[testJsonPath]: '{}',
				[testYamlPath]: 'mainPageUrl: test',
			});

			const result = findConfigFile(testDir);
			expect(result).toBe(testJsonPath);
		});

		test('should return undefined when no config file exists', () => {
			mockFs.__setMockFiles({});

			const result = findConfigFile(testDir);
			expect(result).toBeUndefined();
		});
	});

	describe('readConfigFile', () => {
		test('should read file content successfully', () => {
			const content = '{"mainPageUrl": "https://example.com"}';
			mockFs.__setMockFiles({
				[testJsonPath]: content,
			});

			const result = readConfigFile(testJsonPath);
			expect(result).toBe(content);
		});

		test('should throw ConfigurationError when file does not exist', () => {
			mockFs.__setMockFiles({});

			expect(() => {
				readConfigFile(testJsonPath);
			}).toThrow(ConfigurationError);
		});

		test('should throw ConfigurationError when file is too large', () => {
			const maxFileSize = 10 * 1024 * 1024; // 10MB
			mockFs.__setMockFiles({
				[testJsonPath]: {
					size: maxFileSize + 1,
					content: '{}',
				},
			});

			expect(() => {
				readConfigFile(testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				readConfigFile(testJsonPath);
			}).toThrow(/too large/);
		});

		test('should accept file at exactly max size limit', () => {
			const maxFileSize = 10 * 1024 * 1024; // 10MB
			mockFs.__setMockFiles({
				[testJsonPath]: {
					size: maxFileSize,
					content: '{}',
				},
			});

			const result = readConfigFile(testJsonPath);
			expect(result).toBe('{}');
		});
	});

	describe('parseConfigFile', () => {
		test('should parse valid JSON content', () => {
			const content = '{"mainPageUrl": "https://example.com"}';
			const result = parseConfigFile(content, 'json');
			expect(result).toEqual({mainPageUrl: 'https://example.com'});
		});

		test('should parse valid YAML content', () => {
			const content = 'mainPageUrl: https://example.com';
			const result = parseConfigFile(content, 'yaml');
			expect(result).toEqual({mainPageUrl: 'https://example.com'});
		});

		test('should throw ConfigurationError for invalid JSON', () => {
			const content = '{invalid json}';
			expect(() => {
				parseConfigFile(content, 'json');
			}).toThrow(ConfigurationError);
			expect(() => {
				parseConfigFile(content, 'json');
			}).toThrow(/Invalid JSON syntax/);
		});

		test('should throw ConfigurationError for invalid YAML', () => {
			const content = 'invalid: yaml: content:';
			expect(() => {
				parseConfigFile(content, 'yaml');
			}).toThrow(ConfigurationError);
			expect(() => {
				parseConfigFile(content, 'yaml');
			}).toThrow(/Invalid YAML syntax/);
		});
	});

	describe('validateConfig', () => {
		const validConfig = {
			mainPageUrl: 'https://example.com',
			subPageUrls: ['https://example.com/page1'],
			pages: [
				{
					url: 'https://example.com',
					features: 'Main features',
				},
			],
			personas: ['User persona 1'],
			report: {
				output: './report.md',
			},
		};

		test('should validate correct configuration', () => {
			const result = validateConfig(validConfig, testJsonPath);
			expect(result).toEqual(validConfig);
		});

		test('should throw ConfigurationError when data is not an object', () => {
			expect(() => {
				validateConfig(null, testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				validateConfig(null, testJsonPath);
			}).toThrow(/must be an object/);
		});

		test('should throw ConfigurationError when mainPageUrl is missing', () => {
			const config = {...validConfig};
			delete (config as Partial<typeof validConfig>).mainPageUrl;

			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(/mainPageUrl/);
		});

		test('should throw ConfigurationError when mainPageUrl is not a string', () => {
			const config = {...validConfig, mainPageUrl: 123};

			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(/mainPageUrl/);
		});

		test('should throw ConfigurationError when subPageUrls is not an array', () => {
			const config = {...validConfig, subPageUrls: 'not an array'};

			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(/subPageUrls/);
		});

		test('should throw ConfigurationError when pages is missing', () => {
			const config = {...validConfig};
			delete (config as Partial<typeof validConfig>).pages;

			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(/pages/);
		});

		test('should throw ConfigurationError when pages is empty', () => {
			const config = {...validConfig, pages: []};

			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(/at least one page/);
		});

		test('should throw ConfigurationError when page.url is missing', () => {
			const config = {
				...validConfig,
				pages: [{features: 'Test features'}],
			};

			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(/pages\[0]\.url/);
		});

		test('should throw ConfigurationError when page.features is missing', () => {
			const config = {
				...validConfig,
				pages: [{url: 'https://example.com'}],
			};

			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(/pages\[0]\.features/);
		});

		test('should throw ConfigurationError when personas is missing', () => {
			const config = {...validConfig};
			delete (config as Partial<typeof validConfig>).personas;

			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(/personas/);
		});

		test('should throw ConfigurationError when personas is empty', () => {
			const config = {...validConfig, personas: []};

			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(/at least one persona/);
		});

		test('should throw ConfigurationError when report is missing', () => {
			const config = {...validConfig};
			delete (config as Partial<typeof validConfig>).report;

			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(/report/);
		});

		test('should throw ConfigurationError when report.output is missing', () => {
			const config = {...validConfig, report: {}};

			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(ConfigurationError);
			expect(() => {
				validateConfig(config, testJsonPath);
			}).toThrow(/report\.output/);
		});
	});

	describe('loadConfig', () => {
		const validJsonConfig = {
			mainPageUrl: 'https://example.com',
			subPageUrls: ['https://example.com/page1'],
			pages: [
				{
					url: 'https://example.com',
					features: 'Main features',
				},
			],
			personas: ['User persona 1'],
			report: {
				output: './report.md',
			},
		};

		const validYamlContent = `mainPageUrl: https://example.com
subPageUrls:
  - https://example.com/page1
pages:
  - url: https://example.com
    features: Main features
personas:
  - User persona 1
report:
  output: ./report.md`;

		test('should load and validate JSON config successfully', () => {
			mockFs.__setMockFiles({
				[testJsonPath]: JSON.stringify(validJsonConfig),
			});

			const result = loadConfig(testDir);
			expect(result).toEqual(validJsonConfig);
		});

		test('should load and validate YAML config successfully', () => {
			mockFs.__setMockFiles({
				[testYamlPath]: validYamlContent,
			});

			const result = loadConfig(testDir);
			expect(result.mainPageUrl).toBe('https://example.com');
			expect(result.pages).toHaveLength(1);
		});

		test('should throw ConfigurationError when no config file found', () => {
			mockFs.__setMockFiles({});

			expect(() => {
				loadConfig(testDir);
			}).toThrow(ConfigurationError);
			expect(() => {
				loadConfig(testDir);
			}).toThrow(/Configuration file not found/);
		});

		test('should throw ConfigurationError for invalid config', () => {
			mockFs.__setMockFiles({
				[testJsonPath]: '{"mainPageUrl": "test"}',
			});

			expect(() => {
				loadConfig(testDir);
			}).toThrow(ConfigurationError);
		});
	});
});
