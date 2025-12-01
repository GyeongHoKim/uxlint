import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'ava';
import {ConfigurationError} from '../../../dist/models/errors.js';
import {
	findConfigFile,
	readConfigFile,
} from '../../../dist/infrastructure/config/config-io.js';

test('findConfigFile() returns path when config exists', t => {
	const testDir = tmpdir();
	const configPath = join(testDir, '.uxlintrc.json');

	// Create temporary config file
	fs.writeFileSync(configPath, '{}');

	try {
		const found = findConfigFile(testDir);
		t.is(found, configPath);
	} finally {
		// Cleanup
		if (fs.existsSync(configPath)) {
			fs.unlinkSync(configPath);
		}
	}
});

test('findConfigFile() returns undefined when no config exists', t => {
	const found = findConfigFile('/nonexistent');
	t.is(found, undefined);
});

test('findConfigFile() prefers .uxlintrc.json over .uxlintrc.yaml', t => {
	const testDir = tmpdir();
	const jsonPath = join(testDir, '.uxlintrc.json');
	const yamlPath = join(testDir, '.uxlintrc.yaml');

	// Create both files
	fs.writeFileSync(jsonPath, '{}');
	fs.writeFileSync(yamlPath, '{}');

	try {
		const found = findConfigFile(testDir);
		t.is(found, jsonPath);
	} finally {
		// Cleanup
		if (fs.existsSync(jsonPath)) {
			fs.unlinkSync(jsonPath);
		}

		if (fs.existsSync(yamlPath)) {
			fs.unlinkSync(yamlPath);
		}
	}
});

test('readConfigFile() reads file content', t => {
	const testDir = tmpdir();
	const configPath = join(testDir, '.uxlintrc.json');
	const content = '{"mainPageUrl": "https://example.com"}';

	fs.writeFileSync(configPath, content);

	try {
		const result = readConfigFile(configPath);
		t.is(result, content);
	} finally {
		if (fs.existsSync(configPath)) {
			fs.unlinkSync(configPath);
		}
	}
});

test('readConfigFile() throws ConfigurationError for non-existent file', t => {
	t.throws(() => readConfigFile('/nonexistent/file.json'), {
		instanceOf: ConfigurationError,
	});
});
