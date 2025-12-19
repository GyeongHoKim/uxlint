import {getAuthCode, type OAuthError} from 'oauth-callback';
import {AuthErrorCode, AuthenticationError} from '../../models/auth-error.js';

export type CallbackServerOptions = {
	port: number | [number, number];
	path?: string;
	timeoutMs?: number;
	expectedState: string;
};

export type CallbackResult = {
	code: string;
	state: string;
	error?: string;
	errorDescription?: string;
};

export class CallbackServer {
	private abortController?: AbortController;

	async waitForCallback(
		options: CallbackServerOptions,
	): Promise<CallbackResult> {
		this.abortController = new AbortController();

		const ports = Array.isArray(options.port)
			? this.generatePortRange(options.port[0], options.port[1])
			: [options.port];
		const callbackPath = options.path ?? '/callback';
		const timeout = options.timeoutMs ?? 300_000;

		return this.tryPorts({
			ports,
			callbackPath,
			timeout,
			expectedState: options.expectedState,
			index: 0,
		});
	}

	async stop(): Promise<void> {
		if (this.abortController) {
			this.abortController.abort();
		}
	}

	private async tryPorts(options: {
		ports: number[];
		callbackPath: string;
		timeout: number;
		expectedState: string;
		index: number;
		lastError?: Error;
	}): Promise<CallbackResult> {
		const {ports, callbackPath, timeout, expectedState, index, lastError} =
			options;
		if (index >= ports.length) {
			throw new AuthenticationError(
				AuthErrorCode.NETWORK_ERROR,
				'Callback server error: all ports failed',
				lastError,
			);
		}

		const port = ports[index];

		if (port === undefined) {
			throw new AuthenticationError(
				AuthErrorCode.NETWORK_ERROR,
				'Invalid port at index',
			);
		}

		try {
			const dummyAuthUrl = this.buildDummyAuthUrl(port, callbackPath);

			const rawResult: unknown = await getAuthCode({
				authorizationUrl: dummyAuthUrl,
				port,
				callbackPath,
				timeout,
				openBrowser: false,
				signal: this.abortController?.signal,
			});

			const result = this.validateCallbackResult(rawResult);

			if (result.state !== expectedState) {
				throw new AuthenticationError(
					AuthErrorCode.INVALID_RESPONSE,
					`State mismatch: expected "${expectedState}", got "${result.state}"`,
				);
			}

			if (result.error) {
				this.handleOAuthError(result as OAuthError);
			}

			return {
				code: result.code,
				state: result.state,
			};
		} catch (error: unknown) {
			if (error instanceof AuthenticationError) {
				throw error;
			}

			if (this.isOAuthError(error)) {
				this.handleOAuthError(error);
			}

			const currentError =
				error instanceof Error ? error : new Error(String(error));

			return this.tryPorts({
				ports,
				callbackPath,
				timeout,
				expectedState,
				index: index + 1,
				lastError: currentError,
			});
		}
	}

	private generatePortRange(start: number, end: number): number[] {
		const ports: number[] = [];
		for (let port = start; port <= end; port++) {
			ports.push(port);
		}

		return ports;
	}

	private validateCallbackResult(result: unknown): {
		code: string;
		state: string;
		error?: string;
	} {
		if (
			typeof result === 'object' &&
			result !== null &&
			'code' in result &&
			'state' in result &&
			typeof (result as {code: unknown}).code === 'string' &&
			typeof (result as {state: unknown}).state === 'string'
		) {
			return result as {code: string; state: string; error?: string};
		}

		throw new AuthenticationError(
			AuthErrorCode.INVALID_RESPONSE,
			'Invalid callback result',
		);
	}

	private buildDummyAuthUrl(port: number, path: string): string {
		const redirectUri = `http://localhost:${port}${path}`;
		return `http://localhost/authorize?redirect_uri=${encodeURIComponent(
			redirectUri,
		)}`;
	}

	private isOAuthError(error: unknown): error is OAuthError {
		return (
			typeof error === 'object' &&
			error !== null &&
			'error' in error &&
			typeof (error as {error: unknown}).error === 'string'
		);
	}

	private handleOAuthError(error: OAuthError): never {
		const errorCode = String(error.error);
		const description = error.error_description
			? String(error.error_description)
			: undefined;

		if (errorCode === 'access_denied') {
			throw new AuthenticationError(
				AuthErrorCode.USER_DENIED,
				`OAuth error: ${errorCode}${description ? `: ${description}` : ''}`,
			);
		}

		throw new AuthenticationError(
			AuthErrorCode.INVALID_RESPONSE,
			`OAuth error: ${errorCode}${description ? `: ${description}` : ''}`,
		);
	}
}
