import {getAuthCode} from 'oauth-callback';
import {AuthenticationError, AuthErrorCode} from '../../models/auth-error.js';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export type OAuthCallbackResult = {
	code?: string;
	state?: string;
	error?: string;
	errorDescription?: string;
	errorUri?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export class CallbackServer {
	private controller: AbortController | undefined;
	private readonly getAuthCodeImpl: typeof getAuthCode;

	constructor(getAuthCodeImpl: typeof getAuthCode = getAuthCode) {
		this.getAuthCodeImpl = getAuthCodeImpl;
	}

	async waitForCallback(options: {
		authorizationUrl: string;
		redirectUri: string;
		expectedState: string;
		timeoutMs?: number;
	}): Promise<OAuthCallbackResult> {
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const redirect = new URL(options.redirectUri);

		if (
			redirect.hostname !== 'localhost' &&
			redirect.hostname !== '127.0.0.1'
		) {
			throw new AuthenticationError(
				AuthErrorCode.INVALID_CONFIG,
				'redirectUri must use localhost',
				{redirectUri: options.redirectUri},
			);
		}

		if (redirect.port.length === 0) {
			throw new AuthenticationError(
				AuthErrorCode.INVALID_CONFIG,
				'redirectUri must include a port',
				{redirectUri: options.redirectUri},
			);
		}

		this.controller = new AbortController();

		const unknownResult: unknown = await this.getAuthCodeImpl({
			authorizationUrl: options.authorizationUrl,
			port: Number(redirect.port),
			hostname: redirect.hostname,
			callbackPath: redirect.pathname,
			timeout: timeoutMs,
			openBrowser: false,
			signal: this.controller.signal,
		});

		if (!isRecord(unknownResult)) {
			throw new AuthenticationError(
				AuthErrorCode.INVALID_RESPONSE,
				'Invalid OAuth callback result',
			);
		}

		const result: OAuthCallbackResult = {
			code:
				typeof unknownResult['code'] === 'string'
					? unknownResult['code']
					: undefined,
			state:
				typeof unknownResult['state'] === 'string'
					? unknownResult['state']
					: undefined,
			error:
				typeof unknownResult['error'] === 'string'
					? unknownResult['error']
					: undefined,
			errorDescription:
				typeof unknownResult['error_description'] === 'string'
					? unknownResult['error_description']
					: undefined,
			errorUri:
				typeof unknownResult['error_uri'] === 'string'
					? unknownResult['error_uri']
					: undefined,
		};

		if (result.state !== options.expectedState) {
			throw new AuthenticationError(
				AuthErrorCode.INVALID_RESPONSE,
				'OAuth state mismatch',
				{
					expectedState: options.expectedState,
					actualState: result.state,
				},
			);
		}

		return result;
	}

	async stop(): Promise<void> {
		this.controller?.abort();
		this.controller = undefined;
	}
}
