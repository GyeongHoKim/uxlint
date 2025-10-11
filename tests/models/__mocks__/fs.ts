/**
 * Manual mock for node:fs module
 * Based on Jest official documentation: https://jestjs.io/docs/manual-mocks
 * Used for testing file system operations without touching the real filesystem
 */

import {jest} from '@jest/globals';
import type * as fsType from 'node:fs';

export interface MockFileSystem {
	[path: string]: string | {size: number; content: string};
}

// Custom object to store mock file information
let mockFileSystem: MockFileSystem = {};

// Helper function to set up the mock filesystem
export function __setMockFiles(newMockFiles: MockFileSystem): void {
	mockFileSystem = {...newMockFiles};
}

// Helper function to clear the mock filesystem
export function __clearMockFiles(): void {
	mockFileSystem = {};
}

// Custom implementation of existsSync
export const existsSync = jest.fn((path: string): boolean => {
	return path in mockFileSystem;
});

// Custom implementation of statSync
export const statSync = jest.fn((path: string): {size: number} => {
	const file = mockFileSystem[path];
	if (!file) {
		const error = new Error(
			`ENOENT: no such file or directory, stat '${path}'`,
		) as NodeJS.ErrnoException;
		error.code = 'ENOENT';
		throw error;
	}

	if (typeof file === 'string') {
		return {size: Buffer.from(file).length};
	}

	return {size: file.size};
});

// Custom implementation of readFileSync
export const readFileSync = jest.fn(
	(path: string, _encoding: string): string => {
		const file = mockFileSystem[path];
		if (!file) {
			const error = new Error(
				`ENOENT: no such file or directory, open '${path}'`,
			) as NodeJS.ErrnoException;
			error.code = 'ENOENT';
			throw error;
		}

		if (typeof file === 'string') {
			return file;
		}

		return file.content;
	},
);

// Create the base mock with jest.createMockFromModule and override specific functions
const fsMock = jest.createMockFromModule<typeof fsType>('node:fs');

// Export the enhanced mock as default
export default {
	...fsMock,
	__setMockFiles,
	__clearMockFiles,
	existsSync,
	statSync,
	readFileSync,
};
