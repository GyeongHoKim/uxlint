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
	require: ['./dist/tests/setup.js', 'global-jsdom/register'],
	watchMode: {
		ignoreChanges: ['dist/**', 'coverage/**'],
	},
	environmentVariables: {
		TEST_ENV: 'jsdom',
	},
};
