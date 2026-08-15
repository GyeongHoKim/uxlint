import {Buffer} from 'node:buffer';
import * as fs from 'node:fs';
import {promises as fsPromises} from 'node:fs';
import {join} from 'node:path';
import test from 'ava';
import sinon from 'sinon';
import {ConfigIO} from '../../../source/infrastructure/config/config-io.js';
import {ConfigurationError} from '../../../source/models/errors.js';

test('ConfigIO.findConfigFile() returns path when config exists', t => {
	const sandbox = sinon.createSandbox();
	const testDir = '/test/dir';
	const configPath = join(testDir, '.uxlintrc.json');

	// Create stubs for fs methods
	const existsStub = sandbox
		.stub()
		.callsFake((path: fs.PathLike) => String(path) === configPath);

	const mockFsSync = {
		existsSync: existsStub,
		statSync: fs.statSync,
		readFileSync: fs.readFileSync,
	};

	const mockFsAsync = {
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	};

	const configIO = new ConfigIO(mockFsSync, mockFsAsync);

	try {
		const found = configIO.findConfigFile(testDir);
		t.is(found, configPath);
		t.true(existsStub.called);
	} finally {
		sandbox.restore();
	}
});

test('ConfigIO.findConfigFile() returns undefined when no config exists', t => {
	const sandbox = sinon.createSandbox();

	// Stub existsSync to always return false
	const existsStub = sandbox.stub().returns(false);

	const mockFsSync = {
		existsSync: existsStub,
		statSync: fs.statSync,
		readFileSync: fs.readFileSync,
	};

	const mockFsAsync = {
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	};

	const configIO = new ConfigIO(mockFsSync, mockFsAsync);

	try {
		const found = configIO.findConfigFile('/nonexistent');
		t.is(found, undefined);
	} finally {
		sandbox.restore();
	}
});

test('ConfigIO.findConfigFile() prefers .uxlintrc.json over .uxlintrc.yaml', t => {
	const sandbox = sinon.createSandbox();
	const testDir = '/test/dir';
	const jsonPath = join(testDir, '.uxlintrc.json');
	const yamlPath = join(testDir, '.uxlintrc.yaml');

	// Stub existsSync to return true for both json and yaml files
	const existsStub = sandbox.stub().callsFake((path: fs.PathLike) => {
		const pathString = String(path);
		return pathString === jsonPath || pathString === yamlPath;
	});

	const mockFsSync = {
		existsSync: existsStub,
		statSync: fs.statSync,
		readFileSync: fs.readFileSync,
	};

	const mockFsAsync = {
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	};

	const configIO = new ConfigIO(mockFsSync, mockFsAsync);

	try {
		const found = configIO.findConfigFile(testDir);
		t.is(found, jsonPath);
	} finally {
		sandbox.restore();
	}
});

test('ConfigIO.readConfigFile() reads file content', t => {
	const sandbox = sinon.createSandbox();
	const configPath = '/test/dir/.uxlintrc.json';
	const content = '{"mainPageUrl": "https://example.com"}';

	// Stub fs methods
	const statStub = sandbox.stub().returns({
		size: content.length,
	});

	const readFileStub = sandbox
		.stub()
		.callsFake((_path: fs.PathOrFileDescriptor, encoding?: string) => {
			if (encoding === 'utf8') {
				return content;
			}

			return Buffer.from(content);
		});

	const mockFsSync = {
		existsSync: fs.existsSync,
		statSync: statStub as unknown as typeof fs.statSync,
		readFileSync: readFileStub as unknown as typeof fs.readFileSync,
	};

	const mockFsAsync = {
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	};

	const configIO = new ConfigIO(mockFsSync, mockFsAsync);

	try {
		const result = configIO.readConfigFile(configPath);
		t.is(result, content);
		t.true(statStub.called);
		t.true(readFileStub.called);
	} finally {
		sandbox.restore();
	}
});

test('ConfigIO.readConfigFile() throws ConfigurationError for non-existent file', t => {
	const sandbox = sinon.createSandbox();

	// Stub statSync to throw ENOENT error
	const statStub = sandbox.stub().throws({
		code: 'ENOENT',
		message: 'File not found',
	});

	const mockFsSync = {
		existsSync: fs.existsSync,
		statSync: statStub as unknown as typeof fs.statSync,
		readFileSync: fs.readFileSync,
	};

	const mockFsAsync = {
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	};

	const configIO = new ConfigIO(mockFsSync, mockFsAsync);

	try {
		t.throws(() => configIO.readConfigFile('/nonexistent/file.json'), {
			instanceOf: ConfigurationError,
		});
	} finally {
		sandbox.restore();
	}
});

test('ConfigIO with sinon stubs: findConfigFile returns path when mocked file exists', t => {
	const sandbox = sinon.createSandbox();
	const testDir = '/test/dir';
	const expectedPath = join(testDir, '.uxlintrc.json');

	const existsStub = sandbox
		.stub()
		.callsFake((path: fs.PathLike) => String(path).includes('.uxlintrc.json'));

	const mockFsSync = {
		existsSync: existsStub,
		statSync: fs.statSync,
		readFileSync: fs.readFileSync,
	};

	const mockFsAsync = {
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	};

	const configIO = new ConfigIO(mockFsSync, mockFsAsync);

	try {
		const found = configIO.findConfigFile(testDir);
		t.is(found, expectedPath);
	} finally {
		sandbox.restore();
	}
});

test('ConfigIO with sinon stubs: findConfigFile returns undefined when no file exists', t => {
	const sandbox = sinon.createSandbox();

	const existsStub = sandbox.stub().returns(false);

	const mockFsSync = {
		existsSync: existsStub,
		statSync: fs.statSync,
		readFileSync: fs.readFileSync,
	};

	const mockFsAsync = {
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	};

	const configIO = new ConfigIO(mockFsSync, mockFsAsync);

	try {
		const found = configIO.findConfigFile('/test/dir');
		t.is(found, undefined);
	} finally {
		sandbox.restore();
	}
});

test('ConfigIO with sinon stubs: readConfigFile returns mocked content', t => {
	const sandbox = sinon.createSandbox();
	const mockContent = '{"test": "data"}';

	const statStub = sandbox.stub().returns({
		size: mockContent.length,
	});

	const readFileStub = sandbox
		.stub()
		.callsFake((_path: fs.PathOrFileDescriptor, encoding?: string) => {
			if (encoding === 'utf8') {
				return mockContent;
			}

			return Buffer.from(mockContent);
		});

	const mockFsSync = {
		existsSync: fs.existsSync,
		statSync: statStub as unknown as typeof fs.statSync,
		readFileSync: readFileStub as unknown as typeof fs.readFileSync,
	};

	const mockFsAsync = {
		...fsPromises,
		writeFile: sandbox.stub().resolves(),
	};

	const configIO = new ConfigIO(mockFsSync, mockFsAsync);

	try {
		const content = configIO.readConfigFile('/test/path');
		t.is(content, mockContent);
	} finally {
		sandbox.restore();
	}
});

// Since js-yaml 5, content that carries no document throws "expected a
// document, but the input is empty" where js-yaml 4 returned undefined. Both
// blank and comment-only files must keep resolving to undefined so the caller
// reports "Configuration must be an object" rather than a syntax error the
// user cannot find.
for (const [label, content] of [
	['blank', ''],
	['whitespace-only', '   \n\t\n'],
	['comment-only', '# mainPageUrl: https://example.com\n# personas: []\n'],
	['comment-only without trailing newline', '# nothing here'],
] as const) {
	test(`ConfigIO.parseConfigFile() returns undefined for ${label} YAML`, t => {
		const configIO = new ConfigIO();

		t.is(configIO.parseConfigFile(content, 'yaml'), undefined);
	});
}

test('ConfigIO.parseConfigFile() still parses YAML that has content', t => {
	const configIO = new ConfigIO();

	t.deepEqual(
		configIO.parseConfigFile('# a comment\nmainPageUrl: x\n', 'yaml'),
		{
			mainPageUrl: 'x',
		},
	);
});

test('ConfigIO.parseConfigFile() reports genuine YAML syntax errors', t => {
	const configIO = new ConfigIO();

	t.throws(() => configIO.parseConfigFile('a:\n\t- b\n', 'yaml'), {
		instanceOf: ConfigurationError,
	});
});

/**
 * A minimal configuration that passes every pre-existing rule, so threshold
 * tests fail for threshold reasons only.
 */
const validConfigObject = {
	mainPageUrl: 'https://example.com',
	subPageUrls: [],
	pages: [{url: 'https://example.com', features: 'features'}],
	persona: 'Test persona',
	report: {output: './ux-report.md'},
};

const validateWith = (thresholds?: unknown) =>
	new ConfigIO().validateConfig(
		thresholds === undefined
			? validConfigObject
			: {...validConfigObject, thresholds},
		'.uxlintrc.yml',
	);

test('validateConfig leaves an absent thresholds block absent', t => {
	// FR-004: absent must not quietly become a default set of limits.
	t.is(validateWith().thresholds, undefined);
});

test('validateConfig accepts a fully populated thresholds block', t => {
	const thresholds = {
		maxCritical: 0,
		maxHigh: 3,
		maxMedium: 10,
		maxLow: 20,
		failOnPartialPage: true,
		failOnFailedPage: false,
	};

	t.deepEqual(validateWith(thresholds).thresholds, thresholds);
});

test('validateConfig accepts an empty thresholds block', t => {
	t.deepEqual(validateWith({}).thresholds, {});
});

for (const [label, thresholds, expectedField] of [
	['a fractional limit', {maxCritical: 1.5}, 'thresholds.maxCritical'],
	['a negative limit', {maxHigh: -1}, 'thresholds.maxHigh'],
	['a string limit', {maxLow: '0'}, 'thresholds.maxLow'],
	[
		'a non-boolean flag',
		{failOnPartialPage: 'yes'},
		'thresholds.failOnPartialPage',
	],
	['an unrecognised key', {maxCritcal: 0}, 'thresholds.maxCritcal'],
	['a non-object block', [], 'thresholds'],
] as const) {
	test(`validateConfig rejects ${label}`, t => {
		const error = t.throws(
			() => {
				validateWith(thresholds);
			},
			{instanceOf: ConfigurationError},
		);

		t.is(
			error?.configField,
			expectedField,
			'the error must name the offending key so the user can fix it',
		);
	});
}

test('a rejected threshold names the received value in its message', t => {
	const error = t.throws(
		() => {
			validateWith({maxHigh: -1});
		},
		{instanceOf: ConfigurationError},
	);

	t.regex(error?.message ?? '', /maxHigh/);
	t.regex(error?.message ?? '', /-1/);
});

test('the same thresholds block validates identically from either format', t => {
	// FR-001: the two supported file formats must not diverge in meaning.
	const yamlParsed = new ConfigIO().parseConfigFile(
		'mainPageUrl: https://example.com\nsubPageUrls: []\npages:\n  - url: https://example.com\n    features: features\npersona: Test persona\nreport:\n  output: ./ux-report.md\nthresholds:\n  maxCritical: 0\n  failOnFailedPage: false\n',
		'yaml',
	);
	const jsonParsed = new ConfigIO().parseConfigFile(
		JSON.stringify({
			...validConfigObject,
			thresholds: {maxCritical: 0, failOnFailedPage: false},
		}),
		'json',
	);

	t.deepEqual(
		new ConfigIO().validateConfig(yamlParsed, '.uxlintrc.yml').thresholds,
		new ConfigIO().validateConfig(jsonParsed, '.uxlintrc.json').thresholds,
	);
});

test('validateConfig is the only config validator', t => {
	// A misspelled key must be rejected rather than ignored: a gate the user
	// believes in but does not have is worse than no gate.
	const misspelled = {...validConfigObject, thresholds: {maxCritcal: 0}};

	const error = t.throws(
		() => {
			new ConfigIO().validateConfig(misspelled, '.uxlintrc.yml');
		},
		{instanceOf: ConfigurationError},
	);

	t.is(error?.configField, 'thresholds.maxCritcal');
});

for (const [label, subPageUrls] of [
	['a number', [1]],
	['null', [null]],
	['a mix of strings and numbers', ['https://example.com/a', 2]],
	['an object', [{url: 'https://example.com'}]],
] as const) {
	test(`validateConfig rejects subPageUrls containing ${label}`, t => {
		// An unquoted YAML entry parses as a number; without an element check it
		// surfaces much later as an unrelated runtime error.
		const error = t.throws(
			() => {
				new ConfigIO().validateConfig(
					{...validConfigObject, subPageUrls},
					'.uxlintrc.yml',
				);
			},
			{instanceOf: ConfigurationError},
		);

		t.is(error?.configField, 'subPageUrls');
	});
}

test('validateConfig accepts an all-string subPageUrls list', t => {
	t.deepEqual(
		new ConfigIO().validateConfig(
			{
				...validConfigObject,
				subPageUrls: ['https://example.com/a', 'https://example.com/b'],
			},
			'.uxlintrc.yml',
		).subPageUrls,
		['https://example.com/a', 'https://example.com/b'],
	);
});

const validateBrowser = (browser?: unknown) =>
	new ConfigIO().validateConfig(
		browser === undefined ? validConfigObject : {...validConfigObject, browser},
		'.uxlintrc.yml',
	);

test('validateConfig leaves an absent browser block absent', t => {
	// Absent means the documented defaults apply; it must not quietly become
	// a materialised settings object.
	t.is(validateBrowser().browser, undefined);
});

test('validateConfig accepts a fully populated browser block', t => {
	const browser = {
		executablePath: '/opt/google/chrome/chrome',
		acceptInsecureCerts: false,
		allowExternalData: true,
	};

	t.deepEqual(validateBrowser(browser).browser, browser);
});

test('validateConfig accepts an empty browser block', t => {
	t.deepEqual(validateBrowser({}).browser, {});
});

for (const [label, browser, expectedField] of [
	[
		'a non-string executable path',
		{executablePath: 42},
		'browser.executablePath',
	],
	['an empty executable path', {executablePath: ''}, 'browser.executablePath'],
	[
		'a non-boolean certificate setting',
		{acceptInsecureCerts: 'yes'},
		'browser.acceptInsecureCerts',
	],
	[
		'a non-boolean external data setting',
		{allowExternalData: 1},
		'browser.allowExternalData',
	],
	['an unrecognised key', {allowExternalDta: true}, 'browser.allowExternalDta'],
	['a non-object block', [], 'browser'],
] as const) {
	test(`validateConfig rejects browser settings with ${label}`, t => {
		// D17 is why this matters: a setting no validator checks is
		// indistinguishable from one that was never written. A user who
		// believes they opted out of external data must not be wrong silently.
		const error = t.throws(
			() => {
				validateBrowser(browser);
			},
			{instanceOf: ConfigurationError},
		);

		t.is(
			error?.configField,
			expectedField,
			'the error must name the offending key so the user can fix it',
		);
	});
}
