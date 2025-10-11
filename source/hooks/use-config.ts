/**
 * UseConfig Hook
 * React hook for loading and managing UxLint configuration
 */

import {useState, useEffect} from 'react';
import {loadConfig} from '../models/config-io.js';
import type {UxLintConfig} from '../models/config.js';
import {ConfigurationError} from '../models/errors.js';

/**
 * Hook state type
 */
type ConfigState =
	| {status: 'idle'; config: undefined; error: undefined}
	| {status: 'loading'; config: undefined; error: undefined}
	| {status: 'success'; config: UxLintConfig; error: undefined}
	| {status: 'error'; config: undefined; error: Error};

/**
 * Hook return type
 */
export type UseConfigResult = ConfigState & {
	reload: () => void;
};

/**
 * Load and manage UxLint configuration
 *
 * @param baseDirectory - Directory to search for config (defaults to cwd)
 * @returns Configuration state and reload function
 *
 * @example
 * ```tsx
 * function App() {
 *   const {status, config, error, reload} = useConfig();
 *
 *   if (status === 'loading') return <Text>Loading...</Text>;
 *   if (status === 'error') return <Text>Error: {error.message}</Text>;
 *   if (status === 'success') return <Text>Loaded: {config.mainPageUrl}</Text>;
 *
 *   return null;
 * }
 * ```
 */
export function useConfig(baseDirectory?: string): UseConfigResult {
	const [state, setState] = useState<ConfigState>({
		status: 'idle',
		config: undefined,
		error: undefined,
	});

	const [reloadTrigger, setReloadTrigger] = useState(0);

	useEffect(() => {
		let isMounted = true;

		async function load() {
			// Set loading state
			if (isMounted) {
				setState({
					status: 'loading',
					config: undefined,
					error: undefined,
				});
			}

			try {
				// Load config synchronously (wrapped in try-catch)
				const config = loadConfig(baseDirectory);

				if (isMounted) {
					setState({
						status: 'success',
						config,
						error: undefined,
					});
				}
			} catch (error) {
				if (isMounted) {
					setState({
						status: 'error',
						config: undefined,
						error:
							error instanceof Error
								? error
								: new ConfigurationError(String(error)),
					});
				}
			}
		}

		// Start loading
		void load();

		// Cleanup function
		return () => {
			isMounted = false;
		};
	}, [baseDirectory, reloadTrigger]);

	// Reload function to trigger re-fetch
	const reload = () => {
		setReloadTrigger(previous => previous + 1);
	};

	return {
		...state,
		reload,
	};
}
