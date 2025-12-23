import {type UXLintClient} from '../../infrastructure/auth/uxlint-client.js';
import {UxlintClientContext} from './uxlint-client-context.js';

type UXLintClientProviderProps = {
	readonly children: React.ReactNode;
	readonly uxlintClientImpl: UXLintClient;
};

export function UXLintClientProvider({
	children,
	uxlintClientImpl,
}: UXLintClientProviderProps) {
	return (
		<UxlintClientContext.Provider value={uxlintClientImpl}>
			{children}
		</UxlintClientContext.Provider>
	);
}
