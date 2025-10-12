export default [
	{
		ignores: [
			'dist/**',
			'**/*.config.js',
			'**/*.config.cjs',
			'**/*.config.mjs',
			'**/*.config.ts',
			'**/*.mjs',
			'specs/**',
			'**/__mocks__/**',
		],
	},
	{
		files: ['source/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
		languageOptions: {
			parserOptions: {
				project: ['./tsconfig.json'],
			},
		},
		react: true,
		prettier: true,
		rules: {
			'react/prop-types': 'off',
			'react/react-in-jsx-scope': 'off',
			'unicorn/expiring-todo-comments': 'off',
			'unicorn/no-process-exit': 'off',
			'@typescript-eslint/parameter-properties': 'off',
		},
		semicolon: true,
	},
];
