import {createContext, useContext} from 'react';
import {type UXLintClient} from '../../infrastructure/auth/uxlint-client.js';

export const UxlintClientContext = createContext<UXLintClient | undefined>(
	undefined,
);

export function useUXLintClient(): UXLintClient {
	const context = useContext(UxlintClientContext);
	if (!context) {
		throw new Error(
			'useUXLintClient must be used within a UXLintClientProvider',
		);
	}

	return context;
}
