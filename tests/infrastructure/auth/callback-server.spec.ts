/**
 * Unit tests for CallbackServer
 *
 * These used to be integration tests: each one bound a real port and
 * delivered a real HTTP callback to it. Nothing they asserted needed that.
 * Every assertion here is about what this class decides once `getAuthCode`
 * has returned -- which port to try next, whether the state matches, which
 * error code an OAuth failure becomes -- and none of those decisions involve
 * a socket.
 *
 * Going through HTTP also cost coverage rather than adding it. The guards on
 * code and state length were unreachable, because reaching them means a
 * callback carrying a 10,000-character code, and the malformed-result branch
 * needs `getAuthCode` to return something it never returns in practice. Those
 * three branches are tested here for the first time.
 *
 * One real round trip is kept, in `tests/integration/callback-server.spec.ts`.
 * It
 * exists to check the assumption a mock freezes -- that `getAuthCode` still
 * takes these arguments and still binds a reachable port -- and not to test
 * anything in this file.
 */

import test from 'ava';
import {
	CallbackServer,
	type AuthCodeRequester,
	type CallbackServerOptions,
} from '../../../source/infrastructure/auth/callback-server.js';
import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';
import {MAX_PORT_RANGE_SIZE} from '../../../source/infrastructure/auth/auth-constants.js';

type Call = {
	authorizationUrl: string;
	port: number;
	callbackPath: string;
	timeout: number;
	signal?: AbortSignal;
};

/**
 * A requester that records what it was asked and answers from a script.
 *
 * @param script - What to do for each successive call
 * @returns The requester and the calls it received
 */
function recordingRequester(script: Array<() => Promise<unknown>>): {
	requester: AuthCodeRequester;
	calls: Call[];
} {
	const calls: Call[] = [];

	return {
		calls,
		async requester(options) {
			calls.push({
				authorizationUrl: options.authorizationUrl,
				port: options.port,
				callbackPath: options.callbackPath,
				timeout: options.timeout,
				signal: options.signal,
			});

			const step = script[calls.length - 1] ?? script.at(-1);
			return step ? step() : Promise.resolve({code: 'c', state: 's'});
		},
	};
}

const succeedsWith = (result: unknown) => async () => result;
const failsWith = (error: unknown) => async () => {
	throw error;
};

const baseOptions: CallbackServerOptions = {
	port: 8080,
	expectedState: 'test_state_123',
	timeoutMs: 5000,
};

test('waitForCallback returns code and state on success', async t => {
	const {requester} = recordingRequester([
		succeedsWith({code: 'auth_code_xyz', state: 'test_state_123'}),
	]);

	const result = await new CallbackServer(requester).waitForCallback(
		baseOptions,
	);

	t.is(result.code, 'auth_code_xyz');
	t.is(result.state, 'test_state_123');
	t.is(result.error, undefined);
});

test('waitForCallback throws on state mismatch', async t => {
	const {requester} = recordingRequester([
		succeedsWith({code: 'auth_code', state: 'wrong_state'}),
	]);

	const error = await t.throwsAsync<AuthenticationError>(
		async () =>
			new CallbackServer(requester).waitForCallback({
				...baseOptions,
				expectedState: 'expected_state',
			}),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.INVALID_RESPONSE);
	t.true(error?.message.includes('state'));
});

test('waitForCallback handles OAuth error response', async t => {
	// The library reports an OAuth failure by throwing a shape carrying
	// `error`, which is why this is a rejection rather than a return value.
	const {requester} = recordingRequester([
		failsWith({
			error: 'access_denied',
			error_description: 'User denied access',
		}),
	]);

	const error = await t.throwsAsync<AuthenticationError>(
		async () => new CallbackServer(requester).waitForCallback(baseOptions),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.USER_DENIED);
	t.true(error?.message.includes('access_denied'));
});

test('an OAuth error that is not a denial keeps its own code', async t => {
	const {requester} = recordingRequester([
		failsWith({error: 'server_error', error_description: 'Upstream exploded'}),
	]);

	const error = await t.throwsAsync<AuthenticationError>(
		async () => new CallbackServer(requester).waitForCallback(baseOptions),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.INVALID_RESPONSE);
	t.true(error?.message.includes('server_error'));
});

test('waitForCallback supports custom path', async t => {
	const {requester, calls} = recordingRequester([
		succeedsWith({code: 'code_123', state: 'custom_path_state'}),
	]);

	const result = await new CallbackServer(requester).waitForCallback({
		...baseOptions,
		port: 8083,
		path: '/oauth/callback',
		expectedState: 'custom_path_state',
	});

	t.is(result.code, 'code_123');
	// The path has to reach the socket layer *and* the redirect URI, or the
	// provider sends the browser somewhere nothing is listening.
	t.is(calls[0]?.callbackPath, '/oauth/callback');
	t.true(
		calls[0]?.authorizationUrl.includes(
			encodeURIComponent('http://localhost:8083/oauth/callback'),
		),
	);
});

test('the default path is used when none is given', async t => {
	const {requester, calls} = recordingRequester([
		succeedsWith({code: 'c', state: 'test_state_123'}),
	]);

	await new CallbackServer(requester).waitForCallback(baseOptions);

	t.is(calls[0]?.callbackPath, '/callback');
});

test('waitForCallback supports port range', async t => {
	// Every port before the last refuses, so this asserts the fallback walks
	// the range in order rather than merely that it eventually succeeds.
	const {requester, calls} = recordingRequester([
		failsWith(new Error('EADDRINUSE: address already in use')),
		failsWith(new Error('EADDRINUSE: address already in use')),
		succeedsWith({code: 'range_code', state: 'range_state'}),
	]);

	const result = await new CallbackServer(requester).waitForCallback({
		port: [9000, 9010],
		expectedState: 'range_state',
		timeoutMs: 5000,
	});

	t.is(result.code, 'range_code');
	t.deepEqual(
		calls.map(call => call.port),
		[9000, 9001, 9002],
	);
});

test('a range that never binds reports the last failure', async t => {
	const {requester, calls} = recordingRequester([
		failsWith(new Error('EADDRINUSE: address already in use')),
	]);

	const error = await t.throwsAsync<AuthenticationError>(
		async () =>
			new CallbackServer(requester).waitForCallback({
				port: [9000, 9002],
				expectedState: 's',
				timeoutMs: 5000,
			}),
		{instanceOf: AuthenticationError},
	);

	t.is(calls.length, 3, 'every port in the range should have been tried');
	t.true(error?.message.includes('all ports failed'));
});

test('a port range is capped rather than trusted', async t => {
	// A caller asking for ten thousand ports would otherwise get ten thousand
	// attempts, each waiting its own timeout.
	const {requester, calls} = recordingRequester([
		failsWith(new Error('EADDRINUSE: address already in use')),
	]);

	await t.throwsAsync(async () =>
		new CallbackServer(requester).waitForCallback({
			port: [9000, 19_000],
			expectedState: 's',
			timeoutMs: 1,
		}),
	);

	t.is(calls.length, MAX_PORT_RANGE_SIZE);
	// The cap is on the count, not on the highest port: the range starts where
	// the caller asked and stops after that many attempts.
	t.is(calls.at(-1)?.port, 9000 + MAX_PORT_RANGE_SIZE - 1);
});

// --- validation, unreachable through a real HTTP callback ----------------

test('an over-long authorization code is rejected', async t => {
	const {requester} = recordingRequester([
		succeedsWith({code: 'x'.repeat(10_000), state: 'test_state_123'}),
	]);

	const error = await t.throwsAsync<AuthenticationError>(
		async () => new CallbackServer(requester).waitForCallback(baseOptions),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.INVALID_RESPONSE);
	t.true(error?.message.includes('code'));
});

test('an empty authorization code is rejected', async t => {
	const {requester} = recordingRequester([
		succeedsWith({code: '', state: 'test_state_123'}),
	]);

	const error = await t.throwsAsync<AuthenticationError>(
		async () => new CallbackServer(requester).waitForCallback(baseOptions),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.INVALID_RESPONSE);
	t.true(error?.message.includes('code'));
});

test('an over-long state is rejected', async t => {
	const {requester} = recordingRequester([
		succeedsWith({code: 'c', state: 'x'.repeat(10_000)}),
	]);

	const error = await t.throwsAsync<AuthenticationError>(
		async () =>
			new CallbackServer(requester).waitForCallback({
				...baseOptions,
				expectedState: 'x'.repeat(10_000),
			}),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.INVALID_RESPONSE);
	t.true(error?.message.includes('state'));
});

test('a result that is not a callback result is rejected', async t => {
	// The library returning something unexpected must not be read as a
	// successful login with undefined credentials.
	for (const shape of [undefined, null, {}, {code: 'c'}, {state: 's'}, 'ok']) {
		const {requester} = recordingRequester([succeedsWith(shape)]);

		// eslint-disable-next-line no-await-in-loop -- each shape is its own run
		const error = await t.throwsAsync<AuthenticationError>(
			async () => new CallbackServer(requester).waitForCallback(baseOptions),
			{instanceOf: AuthenticationError},
		);

		t.is(error?.code, AuthErrorCode.INVALID_RESPONSE);
	}
});

test('a code and state that are not strings are rejected', async t => {
	// Not merely falsy: a number reaching the length guards would throw on
	// `.length` rather than being reported as an invalid callback.
	const {requester} = recordingRequester([succeedsWith({code: 1, state: 2})]);

	const error = await t.throwsAsync<AuthenticationError>(
		async () => new CallbackServer(requester).waitForCallback(baseOptions),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.INVALID_RESPONSE);
	t.true(error?.message.includes('Invalid callback result'));
});

test('an OAuth error returned rather than thrown is still an error', async t => {
	// The library signals denial by throwing, but the result type carries an
	// `error` field too, and this class reads it. Both routes have to end in
	// the same place: this project has twice shipped a bug from treating a
	// returned failure as a success, in the browser tool results.
	//
	// Reaching it needs a result that also carries a valid code and a matching
	// state, because validation and the state comparison both run first. That
	// ordering is worth knowing: a denial arriving *without* a code is
	// reported as "Invalid callback result" rather than as a denial.
	const {requester} = recordingRequester([
		succeedsWith({
			code: 'unused_code',
			state: 'test_state_123',
			error: 'access_denied',
			error_description: 'User denied access',
		}),
	]);

	const error = await t.throwsAsync<AuthenticationError>(
		async () => new CallbackServer(requester).waitForCallback(baseOptions),
		{instanceOf: AuthenticationError},
	);

	t.is(error?.code, AuthErrorCode.USER_DENIED);
	t.true(error?.message.includes('access_denied'));
});

// --- cancellation --------------------------------------------------------

test('stop aborts the pending callback', async t => {
	let observed: AbortSignal | undefined;

	const server = new CallbackServer(async options => {
		observed = options.signal;
		return new Promise((_resolve, reject) => {
			options.signal?.addEventListener('abort', () => {
				reject(new Error('aborted'));
			});
		});
	});

	const pending = server.waitForCallback(baseOptions);
	// Let the requester run far enough to have been handed the signal.
	await Promise.resolve();
	await server.stop();

	await t.throwsAsync(async () => pending);
	t.true(observed?.aborted);
});

test('the timeout is passed through to the socket layer', async t => {
	const {requester, calls} = recordingRequester([
		succeedsWith({code: 'c', state: 'test_state_123'}),
	]);

	await new CallbackServer(requester).waitForCallback({
		...baseOptions,
		timeoutMs: 1234,
	});

	t.is(calls[0]?.timeout, 1234);
});
