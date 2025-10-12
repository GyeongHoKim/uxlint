/** @type {import('jest').Config} */
const config = {
	preset: 'ts-jest/presets/default-esm',
	testEnvironment: 'node',
	testMatch: ['<rootDir>/tests/**/*.spec.{ts,tsx}'],
	testPathIgnorePatterns: ['/node_modules/', '/dist/'],
	extensionsToTreatAsEsm: ['.ts', '.tsx'],
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
		'^@/(.*)$': '<rootDir>/source/$1',
	},
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				useESM: true,
				tsconfig: {
					isolatedModules: true,
				},
			},
		],
	},
	collectCoverageFrom: ['source/**/*.{ts,tsx}'],
	setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};

export default config;
