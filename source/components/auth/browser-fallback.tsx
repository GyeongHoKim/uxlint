import {Alert, Spinner} from '@inkjs/ui';
import {Box, Text} from 'ink';
import {useEffect, useState} from 'react';
import type {UserProfile} from '../../models/user-profile.js';
import {useUXLintClient} from '../providers/uxlint-client-context.js';

export type BrowserFallbackProps = {
	/** Authorization URL to display */
	readonly url: string;
	/** Callback when authentication completes */
	readonly onComplete: (profile: UserProfile) => void;
	/** Callback when an error occurs */
	readonly onError: (error: Error) => void;
};

/**
 * BrowserFallback component - Displays manual URL when browser launch fails
 */
export function BrowserFallback({
	url,
	onComplete,
	onError,
}: BrowserFallbackProps) {
	const [waiting, setWaiting] = useState(true);
	const uxlintClient = useUXLintClient();

	useEffect(() => {
		// Poll for authentication completion
		const pollInterval = setInterval(async () => {
			try {
				const isAuth = await uxlintClient.isAuthenticated();

				if (isAuth) {
					clearInterval(pollInterval);
					setWaiting(false);
					const profile = await uxlintClient.getUserProfile();
					onComplete(profile);
				}
			} catch {
				// Continue polling on error
			}
		}, 2000);

		// Set timeout for 5 minutes
		const timeout = setTimeout(() => {
			clearInterval(pollInterval);
			setWaiting(false);
			onError(new Error('Authentication timed out. Please try again.'));
		}, 300_000);

		return () => {
			clearInterval(pollInterval);
			clearTimeout(timeout);
		};
	}, [onComplete, onError, uxlintClient]);

	return (
		<Box flexDirection="column" gap={1}>
			<Alert variant="warning">Could not open browser automatically</Alert>

			<Box flexDirection="column">
				<Text>
					Please open the following URL in your browser to authenticate:
				</Text>
				<Box marginY={1} paddingX={2}>
					<Text bold color="cyan">
						{url}
					</Text>
				</Box>
			</Box>

			{waiting ? (
				<Box>
					<Spinner label="Waiting for authentication..." />
				</Box>
			) : undefined}

			<Box marginTop={1}>
				<Text color="gray">Press Ctrl+C to cancel</Text>
			</Box>
		</Box>
	);
}
