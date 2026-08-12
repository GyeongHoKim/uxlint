import {fixupConfigRules} from '@eslint/compat';
import xoReact from 'eslint-config-xo-react';

/**
 * XO 3 removed built-in React support, so `eslint-config-xo-react` is now
 * composed in by hand. It must come before the override block below so this
 * project's `off` rules win.
 *
 * `fixupConfigRules` is required because eslint-plugin-react 7.37.5 still
 * calls the ESLint 8 rule context API (context.getSourceCode), which ESLint 10
 * removed. Drop it once eslint-plugin-react ships ESLint 10 support.
 *
 * @type {import('xo').FlatXoConfig}
 */
const xoConfig = [
	{
		ignores: [
			'dist/**',
			'coverage/**',
			'**/*.config.js',
			'**/*.config.cjs',
			'**/*.config.mjs',
			'**/*.config.ts',
			'**/*.mjs',
			'specs/**',
			'**/__mocks__/**',
			// XO 4 lints Markdown. Prose in this repo is not currently held to
			// those rules (and CHANGELOG.md is generated), so keep the linter
			// scoped to code. Enabling Markdown linting is its own decision.
			'**/*.md',
		],
	},
	...fixupConfigRules(xoReact()),
	{
		files: ['source/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
		prettier: true,
		semicolon: true,
	},
	// Rule overrides live in their own item, with no XO options alongside them.
	// XO expands `prettier`/`semicolon` into generated configs that it appends
	// *after* the item carrying those options, so overrides sharing that item
	// would be silently re-enabled.
	{
		files: ['source/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
		rules: {
			'react/prop-types': 'off',
			'react/react-in-jsx-scope': 'off',
			'unicorn/expiring-todo-comments': 'off',
			'unicorn/no-process-exit': 'off',
			'@typescript-eslint/parameter-properties': 'off',
			'@typescript-eslint/naming-convention': 'off',
			// eslint-config-xo 0.57 defaults this to "never", which would strip
			// the leading asterisk from every JSDoc block in the repo. Keep the
			// conventional style instead.
			'jsdoc/require-asterisk-prefix': ['error', 'always'],

			// Rules introduced by eslint-config-xo 0.57 that the existing
			// codebase predates. Each would be a large mechanical rewrite with
			// no behavioural change, so they are off for now rather than folded
			// into a dependency upgrade. Enable them one at a time, each with
			// its own commit.
			'@typescript-eslint/strict-boolean-expressions': 'off', // ~52 sites
			'@stylistic/no-mixed-operators': 'off', // ~36 sites
			'ava/no-conditional-assertion': 'off', // ~32 sites
			'unicorn/consistent-class-member-order': 'off', // ~18 sites
			'require-unicode-regexp': 'off', // ~9 sites
			'unicorn/consistent-boolean-name': 'off', // ~7 sites
			'jsdoc/informative-docs': 'off', // ~6 sites
			'@typescript-eslint/strict-void-return': 'off', // ~5 sites
			'regexp/prefer-named-capture-group': 'off', // ~3 sites

			// Suggest Array#toSorted / Iterator#toArray, which are not in this
			// project's `lib` (ES2022) and therefore resolve to `any`.
			// Revisit together with a `target`/`lib` bump.
			'unicorn/no-array-sort': 'off',
			'unicorn/prefer-iterator-to-array': 'off',
		},
	},
];

export default xoConfig;
