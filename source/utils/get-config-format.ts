export function getConfigFormat(path: string): 'json' | 'yaml' | 'yml' {
	if (path.endsWith('.json')) {
		return 'json';
	}

	if (path.endsWith('.yaml')) {
		return 'yaml';
	}

	return 'yml';
}
