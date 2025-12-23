import {useCallback, useState} from 'react';
import {useUXLintClient} from '../components/providers/uxlint-client-context.js';

export const useLogout = () => {
	const uxlintClient = useUXLintClient();
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isSuccess, setIsSuccess] = useState<boolean | undefined>(undefined);
	const [error, setError] = useState<Error | undefined>(undefined);

	const logout = useCallback(async () => {
		setIsLoading(true);
		try {
			await uxlintClient.logout();
			setIsSuccess(true);
		} catch (error) {
			setError(error instanceof Error ? error : new Error(String(error)));
		} finally {
			setIsLoading(false);
		}
	}, [uxlintClient]);

	return {
		logout,
		isLoading,
		isSuccess,
		error,
	};
};
