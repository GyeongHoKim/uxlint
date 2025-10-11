/** @type {import('jest').Config} */
const config = {
	projects: [
		// CommonJS project for model tests
		{
			displayName: 'models',
			preset: 'ts-jest',
			testEnvironment: 'node',
			testMatch: ['<rootDir>/tests/models/**/*.spec.ts'],
			moduleNameMapper: {
				'^(\\.{1,2}/.*)\\.js$': '$1',
				'^@/(.*)$': '<rootDir>/source/$1',
			},
			collectCoverageFrom: ['source/**/*.{ts,tsx}'],
		},
		// ESM project for component tests
		{
			displayName: 'components',
			preset: 'ts-jest/presets/default-esm',
			testEnvironment: 'node',
			testMatch: ['<rootDir>/tests/components/**/*.spec.tsx'],
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
		},
	],
};

export default config;
