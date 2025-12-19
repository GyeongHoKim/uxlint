import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';
import type {CallbackResult} from '../../../source/infrastructure/auth/callback-server.js';

/**
 * Mock CallbackServer for testing OAuth callback handling.
 * Tracks method calls and allows customizing responses.
 */
export class MockCallbackServer {
	public waitForCallbackCalled = false;
	public stopCalled = false;
	public lastExpectedState?: string;
	public shouldFail = false;
	public failureError?: Error;

	public mockResult: CallbackResult = {
		code: 'mock_auth_code',
		state: '', // Will be set to match expected state
	};

	async waitForCallback(options: {
		expectedState: string;
	}): Promise<CallbackResult> {
		this.waitForCallbackCalled = true;
		this.lastExpectedState = options.expectedState;

		if (this.shouldFail) {
			throw (
				this.failureError ??
				new AuthenticationError(
					AuthErrorCode.NETWORK_ERROR,
					'Mock callback failure',
				)
			);
		}

		// Return result with matching state
		return {
			...this.mockResult,
			state: options.expectedState,
		};
	}

	async stop(): Promise<void> {
		this.stopCalled = true;
	}

	/**
	 * Reset mock state for test cleanup.
	 */
	clear(): void {
		this.waitForCallbackCalled = false;
		this.stopCalled = false;
		this.lastExpectedState = undefined;
		this.shouldFail = false;
		this.failureError = undefined;
		this.mockResult = {
			code: 'mock_auth_code',
			state: '',
		};
	}
}
