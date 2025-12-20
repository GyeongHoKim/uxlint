/**
 * Authentication error types
 */
export enum AuthErrorCode {
	/** No active session found */
	NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',

	/** Token has expired */
	TOKEN_EXPIRED = 'TOKEN_EXPIRED',

	/** Refresh token is invalid */
	REFRESH_FAILED = 'REFRESH_FAILED',

	/** Network error during auth flow */
	NETWORK_ERROR = 'NETWORK_ERROR',

	/** User denied authorization */
	USER_DENIED = 'USER_DENIED',

	/** Invalid OAuth response */
	INVALID_RESPONSE = 'INVALID_RESPONSE',

	/** Keychain access denied */
	KEYCHAIN_ERROR = 'KEYCHAIN_ERROR',

	/** Browser launch failed */
	BROWSER_FAILED = 'BROWSER_FAILED',

	/** User is already authenticated */
	ALREADY_AUTHENTICATED = 'ALREADY_AUTHENTICATED',
}

/**
 * Authentication error with structured error codes
 */
export class AuthenticationError extends Error {
	constructor(
		public code: AuthErrorCode,
		message: string,
		public override cause?: Error,
	) {
		super(message);
		this.name = 'AuthenticationError';
	}
}

/**
 * Get user-friendly error message for an authentication error code
 * @param code Error code
 * @returns Human-readable error message
 */
export function getUserFriendlyErrorMessage(code: AuthErrorCode): string {
	switch (code) {
		case AuthErrorCode.NOT_AUTHENTICATED: {
			return 'You are not logged in. Please run "uxlint auth login" to authenticate.';
		}

		case AuthErrorCode.TOKEN_EXPIRED: {
			return 'Your session has expired. Please log in again using "uxlint auth login".';
		}

		case AuthErrorCode.REFRESH_FAILED: {
			return 'Failed to refresh your authentication. Please log in again using "uxlint auth login".';
		}

		case AuthErrorCode.NETWORK_ERROR: {
			return 'Network error occurred. Please check your internet connection and try again.';
		}

		case AuthErrorCode.USER_DENIED: {
			return 'Authentication was cancelled. You can try again using "uxlint auth login".';
		}

		case AuthErrorCode.INVALID_RESPONSE: {
			return 'Received an invalid response from the authentication server. Please try again.';
		}

		case AuthErrorCode.KEYCHAIN_ERROR: {
			return 'Unable to access secure storage. Please ensure you have the necessary permissions.';
		}

		case AuthErrorCode.BROWSER_FAILED: {
			return 'Failed to open browser automatically. You can manually open the authorization URL shown below.';
		}

		case AuthErrorCode.ALREADY_AUTHENTICATED: {
			return 'You are already logged in. Use "uxlint auth logout" to log out first.';
		}
	}
}
