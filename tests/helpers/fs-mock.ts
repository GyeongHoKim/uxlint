/**
 * Shared fs mock utilities for tests
 * Provides a consistent mock implementation of node:fs for use with jest.unstable_mockModule
 */

import * as path from 'node:path';
import {jest} from '@jest/globals';

// Mock files map for fs operations
export const mockFiles = new Map<string, string>();

/**
 * Reset all mock files
 */
export function resetMockFiles(): void {
	mockFiles.clear();
}

/**
 * Get the mock fs module implementation
 * Use with jest.unstable_mockModule('node:fs', () => getMockFsModule())
 */
export function getMockFsModule() {
	return {
		existsSync: jest.fn((filePath: string): boolean => {
			return mockFiles.has(filePath);
		}),
		readFileSync: jest.fn((filePath: string, _encoding?: string): string => {
			const content = mockFiles.get(filePath);
			if (content === undefined) {
				const error = new Error(
					`ENOENT: no such file or directory, open '${filePath}'`,
				);
				(error as NodeJS.ErrnoException).code = 'ENOENT';
				throw error;
			}

			return content;
		}),
		writeFileSync: jest.fn((filePath: string, data: string): void => {
			mockFiles.set(filePath, data);
		}),
		unlinkSync: jest.fn((filePath: string): void => {
			mockFiles.delete(filePath);
		}),
		statSync: jest.fn(
			(
				filePath: string,
			): {
				size: number;
				isFile: () => boolean;
				isDirectory: () => boolean;
			} => {
				const content = mockFiles.get(filePath);
				if (content === undefined) {
					const error = new Error(
						`ENOENT: no such file or directory, stat '${filePath}'`,
					);
					(error as NodeJS.ErrnoException).code = 'ENOENT';
					throw error;
				}

				const isDir = content === '__DIR__';
				return {
					size: isDir ? 0 : content.length,
					isFile: () => !isDir,
					isDirectory: () => isDir,
				};
			},
		),
		promises: {
			writeFile: jest.fn(
				async (
					filePath: string,
					data: string,
					_encoding?: string,
				): Promise<void> => {
					// Check if parent directory exists
					const parentDir = path.dirname(filePath);
					if (!mockFiles.has(parentDir)) {
						const error = new Error(
							`ENOENT: no such file or directory, open '${filePath}'`,
						);
						(error as NodeJS.ErrnoException).code = 'ENOENT';
						throw error;
					}

					mockFiles.set(filePath, data);
				},
			),
		},
	};
}
