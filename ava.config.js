export default {
	typescript: {
		rewritePaths: {
			'source/': 'dist/source/',
			'tests/': 'dist/tests/',
		},
		compile: false,
		extensions: ['ts', 'tsx'],
	},
	files: ['tests/**/*.spec.{ts,tsx}'],
	require: ['./tests/setup.ts', 'global-jsdom/register'],
	watchMode: {
		ignoreChanges: ['dist/**', 'coverage/**'],
	},
	environmentVariables: {
		TEST_ENV: 'jsdom',
	},
};
