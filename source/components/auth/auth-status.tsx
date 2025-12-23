import {Alert, Badge, Spinner} from '@inkjs/ui';
import {Box, Text} from 'ink';
import {useEffect, useState} from 'react';
import {
	isSessionExpired,
	type AuthenticationSession,
} from '../../models/auth-session.js';
import {useUXLintClient} from '../providers/uxlint-client-context.js';

export type AuthStatusProps = {
	/** Callback when status check is complete */
	readonly onComplete?: () => void;
};

/**
 * AuthStatus component - Displays current authentication status
 */
export function AuthStatus({onComplete}: AuthStatusProps) {
	const [session, setSession] = useState<AuthenticationSession | undefined>(
		undefined,
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);
	const uxlintClient = useUXLintClient();

	useEffect(() => {
		const checkStatus = async () => {
			try {
				const status = await uxlintClient.getStatus();
				setSession(status);
			} catch (error_) {
				setError(
					error_ instanceof Error ? error_.message : 'Failed to check status',
				);
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		void checkStatus();
	}, [onComplete, uxlintClient]);

	if (loading) {
		return (
			<Box>
				<Spinner label="Checking authentication status..." />
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column">
				<Alert variant="error">Error checking authentication status</Alert>
				<Text color="gray">{error}</Text>
			</Box>
		);
	}

	if (!session) {
		return (
			<Box flexDirection="column" gap={1}>
				<Alert variant="info">Not logged in</Alert>
				<Text>
					Run <Text bold>uxlint auth login</Text> to authenticate with UXLint
					Cloud.
				</Text>
			</Box>
		);
	}

	const isExpired = isSessionExpired(session, 0);
	const expiresAt = new Date(session.metadata.expiresAt);

	return (
		<Box flexDirection="column" gap={1}>
			<Box gap={1}>
				<Text>Status:</Text>
				{isExpired ? (
					<Badge color="red">Expired</Badge>
				) : (
					<Badge color="green">Authenticated</Badge>
				)}
			</Box>

			<Box flexDirection="column">
				<Text>
					<Text bold>{session.user.name}</Text>
					<Text color="gray"> ({session.user.email})</Text>
				</Text>

				{session.user.organization ? (
					<Text color="gray">Organization: {session.user.organization}</Text>
				) : undefined}
			</Box>

			<Box flexDirection="column">
				<Text color="gray">
					{isExpired ? 'Expired: ' : 'Expires: '}
					{expiresAt.toLocaleString()}
				</Text>
				<Text color="gray">Scopes: {session.metadata.scopes.join(', ')}</Text>
			</Box>

			{isExpired ? (
				<Box marginTop={1}>
					<Text color="yellow">
						Your session has expired. Please run{' '}
						<Text bold>uxlint auth login</Text> to re-authenticate.
					</Text>
				</Box>
			) : undefined}
		</Box>
	);
}
