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
