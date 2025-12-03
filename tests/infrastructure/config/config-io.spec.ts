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
	const existsStub = sandbox.stub().callsFake((path: fs.PathLike) => {
		return String(path) === configPath;
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

	const existsStub = sandbox.stub().callsFake((path: fs.PathLike) => {
		return String(path).includes('.uxlintrc.json');
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
		const found = configIO.findConfigFile('/test/dir');
		t.is(found, '/test/dir/.uxlintrc.json');
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
