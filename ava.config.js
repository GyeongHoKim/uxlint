export default {
	files: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
	extensions: {
		ts: 'module',
		tsx: 'module',
	},
	nodeArguments: ['--import=tsimp'],
};
