export default [
	{
		ignores: [
			'dist/**',
			'**/*.config.js',
			'**/*.config.cjs',
			'**/*.config.mjs',
			'**/*.mjs',
			'specs/**',
		],
	},
	{
		files: ['source/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
		react: true,
		prettier: true,
		rules: {
			'react/prop-types': 'off',
			'react/react-in-jsx-scope': 'off',
			'unicorn/expiring-todo-comments': 'off',
			'unicorn/no-process-exit': 'off',
		},
		semicolon: true,
	},
];
