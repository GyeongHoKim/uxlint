import {Alert, Spinner, StatusMessage} from '@inkjs/ui';
import {Box, Text} from 'ink';
import {useEffect, useState} from 'react';
import {AuthErrorCode, AuthenticationError} from '../../models/auth-error.js';
import {getUXLintClient} from '../../infrastructure/auth/uxlint-client.js';

export type LoginStatus =
	| 'opening-browser'
	| 'waiting-for-authentication'
	| 'exchanging-tokens'
	| 'success'
	| 'error';

export type LoginFlowProps = {
	readonly onComplete: () => void;
	readonly onError: (error: AuthenticationError) => void;
	readonly client?: LoginFlowClient;
};

export type LoginFlowClient = {
	login(options?: {
		onStatus?: (
			status:
				| 'opening-browser'
				| 'waiting-for-authentication'
				| 'exchanging-tokens',
		) => void;
	}): Promise<void>;
};

function normalizeAuthenticationError(error: unknown): AuthenticationError {
	if (error instanceof AuthenticationError) {
		return error;
	}

	return new AuthenticationError(
		AuthErrorCode.NETWORK_ERROR,
		error instanceof Error ? error.message : String(error),
	);
}

function isBrowserFailed(code: AuthErrorCode | string): boolean {
	return code === 'AUTH_BROWSER_FAILED';
}

export function LoginFlow({onComplete, onError, client}: LoginFlowProps) {
	const uxlintClient = client ?? getUXLintClient();
	const [status, setStatus] = useState<LoginStatus>('opening-browser');
	const [error, setError] = useState<AuthenticationError | undefined>();

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			try {
				await uxlintClient.login({
					onStatus(next) {
						if (!cancelled) {
							setStatus(next);
						}
					},
				});

				if (cancelled) {
					return;
				}

				setStatus('success');
				onComplete();
			} catch (error) {
				if (cancelled) {
					return;
				}

				const authError = normalizeAuthenticationError(error);

				setStatus('error');
				setError(authError);
				onError(authError);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [onComplete, onError, uxlintClient]);

	if (status === 'success') {
		return (
			<StatusMessage variant="success">
				Authenticated successfully
			</StatusMessage>
		);
	}

	if (status === 'error' && error) {
		if (isBrowserFailed(error.code)) {
			return (
				<Box flexDirection="column" gap={1}>
					<Alert variant="warning">
						Browser launch failed. Please open the authorization URL manually.
					</Alert>
					<Text>Then re-run: uxlint auth login</Text>
				</Box>
			);
		}

		return (
			<Alert variant="error">
				{error.message} ({String(error.code)})
			</Alert>
		);
	}

	let label = 'Completing authentication...';
	if (status === 'opening-browser') {
		label = 'Opening browser...';
	} else if (status === 'waiting-for-authentication') {
		label = 'Waiting for authentication...';
	}

	return (
		<Box flexDirection="column" gap={1}>
			<Spinner label={label} />
			<Text dimColor>Press Ctrl+C to cancel</Text>
		</Box>
	);
}
