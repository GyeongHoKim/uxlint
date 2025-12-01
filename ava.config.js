export default {
	typescript: {
		rewritePaths: {
			'source/': 'dist/',
		},
		compile: false,
		extensions: ['ts', 'tsx'],
	},
	files: ['tests/**/*.spec.{ts,tsx}'],
	require: ['./tests/setup.ts'],
	watchMode: {
		ignoreChanges: ['dist/**', 'coverage/**'],
	},
};
