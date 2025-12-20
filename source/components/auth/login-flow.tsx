import {useState, useEffect, useCallback} from 'react';
import {Text, Box} from 'ink';
import {Spinner} from '@inkjs/ui';
import type {UserProfile} from '../../models/user-profile.js';
import {AuthErrorCode, AuthenticationError} from '../../models/auth-error.js';
import {getUXLintClient} from '../../infrastructure/auth/uxlint-client.js';
import {BrowserFallback} from './browser-fallback.js';

export type LoginFlowStatus =
	| 'opening-browser'
	| 'waiting'
	| 'exchanging'
	| 'success'
	| 'error';

export type LoginFlowProps = {
	/** Callback when login completes successfully */
	readonly onComplete: (profile: UserProfile) => void;
	/** Callback when login fails with an error */
	readonly onError: (error: Error) => void;
	/** Optional client for testing (defaults to singleton) */
	readonly client?: {
		login: () => Promise<void>;
		getUserProfile: () => Promise<UserProfile>;
	};
};

/**
 * LoginFlow component - Handles the OAuth login flow UI
 */
export function LoginFlow({
	onComplete,
	onError,
	client: testClient,
}: LoginFlowProps) {
	const [status, setStatus] = useState<LoginFlowStatus>('opening-browser');
	const [fallbackUrl, setFallbackUrl] = useState<string | undefined>(undefined);
	const [errorMessage, setErrorMessage] = useState<string | undefined>(
		undefined,
	);

	const handleLogin = useCallback(async () => {
		const client = testClient ?? getUXLintClient();

		try {
			setStatus('opening-browser');
			await client.login();
			setStatus('success');
			const profile = await client.getUserProfile();
			onComplete(profile);
		} catch (error) {
			if (
				error instanceof AuthenticationError &&
				error.code === AuthErrorCode.BROWSER_FAILED
			) {
				// Extract URL from error message for fallback
				const urlMatch = /https?:\/\/\S+/.exec(error.message);
				if (urlMatch?.[0]) {
					setFallbackUrl(urlMatch[0]);
					setStatus('waiting');
					return;
				}
			}

			if (
				error instanceof AuthenticationError &&
				error.code === AuthErrorCode.ALREADY_AUTHENTICATED
			) {
				// Already logged in, get profile and complete
				try {
					const profile = await client.getUserProfile();
					setStatus('success');
					onComplete(profile);
					return;
				} catch {
					// Ignore and fall through to error
				}
			}

			setStatus('error');
			setErrorMessage(
				error instanceof Error ? error.message : 'Unknown error occurred',
			);
			onError(error instanceof Error ? error : new Error(String(error)));
		}
	}, [testClient, onComplete, onError]);

	useEffect(() => {
		void handleLogin();
	}, [handleLogin]);

	const handleFallbackComplete = useCallback(
		(profile: UserProfile) => {
			setStatus('success');
			onComplete(profile);
		},
		[onComplete],
	);

	const handleFallbackError = useCallback(
		(error: Error) => {
			setStatus('error');
			setErrorMessage(error.message);
			onError(error);
		},
		[onError],
	);

	// Browser fallback mode
	if (fallbackUrl) {
		return (
			<BrowserFallback
				url={fallbackUrl}
				onComplete={handleFallbackComplete}
				onError={handleFallbackError}
			/>
		);
	}

	// Error state
	if (status === 'error' && errorMessage) {
		return (
			<Box flexDirection="column">
				<Text color="red">✗ Authentication failed</Text>
				<Text color="gray">{errorMessage}</Text>
			</Box>
		);
	}

	// Success state
	if (status === 'success') {
		return (
			<Box>
				<Text color="green">✓ Authentication successful!</Text>
			</Box>
		);
	}

	// Loading states
	return (
		<Box flexDirection="column">
			{status === 'opening-browser' && (
				<Box>
					<Spinner label="Opening browser..." />
				</Box>
			)}
			{status === 'waiting' && (
				<Box>
					<Spinner label="Waiting for authentication..." />
				</Box>
			)}
			{status === 'exchanging' && (
				<Box>
					<Spinner label="Exchanging authorization code..." />
				</Box>
			)}
		</Box>
	);
}
