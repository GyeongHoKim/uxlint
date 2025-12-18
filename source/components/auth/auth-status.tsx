import {Spinner, StatusMessage} from '@inkjs/ui';
import {Box, Text} from 'ink';
import {useEffect, useState, type ReactNode} from 'react';
import {getUXLintClient} from '../../infrastructure/auth/uxlint-client.js';
import {
	isSessionExpired,
	type AuthenticationSession,
} from '../../models/auth-session.js';

export type AuthStatusClient = {
	getStatus(): Promise<AuthenticationSession | undefined>;
};

export type AuthStatusProps = {
	readonly client?: AuthStatusClient;
	readonly onComplete?: () => void;
};

export function AuthStatus({client, onComplete}: AuthStatusProps) {
	const uxlintClient = client ?? getUXLintClient();
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState<ReactNode | undefined>();

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const session = await uxlintClient.getStatus();
			if (cancelled) {
				return;
			}

			if (!session) {
				setMessage(
					<StatusMessage variant="warning">
						Not logged in. Run: uxlint auth login
					</StatusMessage>,
				);
			} else if (isSessionExpired(session)) {
				setMessage(
					<Box flexDirection="column" gap={1}>
						<StatusMessage variant="warning">Session expired</StatusMessage>
						<Text>Run: uxlint auth login</Text>
					</Box>,
				);
			} else {
				setMessage(
					<Box flexDirection="column" gap={1}>
						<StatusMessage variant="success">Authenticated</StatusMessage>
						<Text>
							{session.user.name} ({session.user.email})
						</Text>
						<Text dimColor>
							Expires: {new Date(session.metadata.expiresAt).toLocaleString()}
						</Text>
					</Box>,
				);
			}

			setLoading(false);
			onComplete?.();
		})();

		return () => {
			cancelled = true;
		};
	}, [onComplete, uxlintClient]);

	if (loading) {
		return <Spinner label="Checking authentication status..." />;
	}

	return <Box flexDirection="column">{message}</Box>;
}
