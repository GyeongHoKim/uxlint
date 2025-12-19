import {Text, Box} from 'ink';
import {Alert} from '@inkjs/ui';
import {AuthErrorCode, AuthenticationError} from '../../models/auth-error.js';

export type AuthErrorProps = {
	/** The error to display */
	readonly error: Error;
	/** Callback when user wants to retry */
	readonly onRetry?: () => void;
};

/**
 * AuthError component - Displays authentication error messages
 */
export function AuthError({error, onRetry}: AuthErrorProps) {
	const isAuthError = error instanceof AuthenticationError;
	const errorCode = isAuthError ? error.code : undefined;

	// Map error codes to user-friendly messages
	const getErrorMessage = (): {
		title: string;
		message: string;
		showRetry: boolean;
	} => {
		if (!isAuthError || !errorCode) {
			return {
				title: 'Authentication Error',
				message: error.message,
				showRetry: true,
			};
		}

		switch (errorCode) {
			case AuthErrorCode.USER_DENIED: {
				return {
					title: 'Authentication Cancelled',
					message:
						'You cancelled the authentication. Run `uxlint auth login` to try again.',
					showRetry: false,
				};
			}

			case AuthErrorCode.NETWORK_ERROR: {
				return {
					title: 'Network Error',
					message:
						'Could not connect to UXLint Cloud. Please check your internet connection.',
					showRetry: true,
				};
			}

			case AuthErrorCode.REFRESH_FAILED: {
				return {
					title: 'Session Expired',
					message:
						'Your session has expired and could not be refreshed. Please log in again.',
					showRetry: true,
				};
			}

			case AuthErrorCode.KEYCHAIN_ERROR: {
				return {
					title: 'Keychain Error',
					message:
						'Could not access the system keychain. Please check your system permissions.',
					showRetry: false,
				};
			}

			case AuthErrorCode.INVALID_RESPONSE: {
				return {
					title: 'Invalid Response',
					message:
						'Received an invalid response from the authentication server.',
					showRetry: true,
				};
			}

			case AuthErrorCode.NOT_AUTHENTICATED: {
				return {
					title: 'Not Authenticated',
					message:
						'You are not logged in. Run `uxlint auth login` to authenticate.',
					showRetry: false,
				};
			}

			case AuthErrorCode.TOKEN_EXPIRED: {
				return {
					title: 'Token Expired',
					message:
						'Your authentication token has expired. Please log in again.',
					showRetry: true,
				};
			}

			case AuthErrorCode.ALREADY_AUTHENTICATED: {
				return {
					title: 'Already Authenticated',
					message:
						'You are already logged in. Run `uxlint auth logout` first if you want to switch accounts.',
					showRetry: false,
				};
			}

			case AuthErrorCode.BROWSER_FAILED: {
				return {
					title: 'Browser Error',
					message:
						'Could not open the browser. Please try opening the URL manually.',
					showRetry: true,
				};
			}
		}
	};

	const {title, message, showRetry} = getErrorMessage();

	return (
		<Box flexDirection="column" gap={1}>
			<Alert variant="error">{title}</Alert>
			<Text>{message}</Text>
			{showRetry && onRetry ? (
				<Text color="gray">Press any key to retry or Ctrl+C to exit.</Text>
			) : undefined}
		</Box>
	);
}
