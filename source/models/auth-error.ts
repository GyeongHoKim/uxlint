import {UxlintError} from './errors.js';

export enum AuthErrorCode {
	INVALID_CONFIG = 'AUTH_INVALID_CONFIG',
	NOT_AUTHENTICATED = 'AUTH_NOT_AUTHENTICATED',
	INVALID_RESPONSE = 'AUTH_INVALID_RESPONSE',
	USER_DENIED = 'AUTH_USER_DENIED',
	NETWORK_ERROR = 'AUTH_NETWORK_ERROR',
	KEYCHAIN_ERROR = 'AUTH_KEYCHAIN_ERROR',
	BROWSER_FAILED = 'AUTH_BROWSER_FAILED',
	REFRESH_FAILED = 'AUTH_REFRESH_FAILED',
}

export class AuthenticationError extends UxlintError {
	constructor(
		public readonly code: AuthErrorCode,
		message: string,
		context?: Record<string, unknown>,
	) {
		super(message, context);
		this.name = 'AuthenticationError';
	}
}
