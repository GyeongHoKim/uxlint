import test from 'ava';
import {
	CallbackServer,
	type CallbackServerOptions,
} from '../../../source/infrastructure/auth/callback-server.js';
import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';
import {findListeningPort, waitForPort} from '../../utils.js';

/**
 * Deliver the OAuth callback once the server is actually listening.
 *
 * Every test here used to sleep 100ms and hope. Binding takes 36-48ms on an
 * idle machine and 84-139ms under parallel load, so the margin was thin and
 * the probe had no second chance -- and a miss was not a fast failure. The
 * server tries each port in the range in turn, waiting the full `timeoutMs`
 * on each, so one missed delivery meant the test hung for ports x timeout
 * (55 seconds at the values used here) and surfaced as "remained pending
 * after a timeout" rather than as anything pointing back to this line.
 *
 * The delivery is returned rather than awaited so the caller can await the
 * callback promise first: attaching a handler immediately is what keeps a
 * rejection from being reported as unhandled.
 *
 * @param port Port the server is expected to bind
 * @param url Callback URL to request
 * @returns Resolves once the callback has been delivered
 */
async function deliverWhenReady(port: number, url: string): Promise<void> {
	await waitForPort(port);
	const response = await fetch(url);
	await response.text();
}

test('waitForCallback returns code and state on success', async t => {
	const server = new CallbackServer();
	const options: CallbackServerOptions = {
		port: 8080,
		expectedState: 'test_state_123',
		timeoutMs: 5000,
	};

	const callbackPromise = server.waitForCallback(options);
	const delivered = deliverWhenReady(
		8080,
		'http://localhost:8080/callback?code=auth_code_xyz&state=test_state_123',
	);

	const result = await callbackPromise;
	await delivered;

	t.is(result.code, 'auth_code_xyz');
	t.is(result.state, 'test_state_123');
	t.is(result.error, undefined);
});

test('waitForCallback throws on state mismatch', async t => {
	const server = new CallbackServer();
	const options: CallbackServerOptions = {
		port: 8081,
		expectedState: 'expected_state',
		timeoutMs: 5000,
	};

	const callbackPromise = server.waitForCallback(options);
	const delivered = deliverWhenReady(
		8081,
		'http://localhost:8081/callback?code=auth_code&state=wrong_state',
	);

	const error = await t.throwsAsync<AuthenticationError>(
		async () => callbackPromise,
		{instanceOf: AuthenticationError},
	);
	await delivered;

	t.is(error?.code, AuthErrorCode.INVALID_RESPONSE);
	t.true(error?.message.includes('state'));
});

test('waitForCallback handles OAuth error response', async t => {
	const server = new CallbackServer();
	const options: CallbackServerOptions = {
		port: 8082,
		expectedState: 'test_state',
		timeoutMs: 5000,
	};

	const callbackPromise = server.waitForCallback(options);
	const delivered = deliverWhenReady(
		8082,
		'http://localhost:8082/callback?error=access_denied&error_description=User+denied+access&state=test_state',
	);

	const error = await t.throwsAsync<AuthenticationError>(
		async () => callbackPromise,
		{instanceOf: AuthenticationError},
	);
	await delivered;

	t.is(error?.code, AuthErrorCode.USER_DENIED);
	t.true(error?.message.includes('access_denied'));
});

test('waitForCallback supports custom path', async t => {
	const server = new CallbackServer();
	const options: CallbackServerOptions = {
		port: 8083,
		path: '/oauth/callback',
		expectedState: 'custom_path_state',
		timeoutMs: 5000,
	};

	const callbackPromise = server.waitForCallback(options);
	const delivered = deliverWhenReady(
		8083,
		'http://localhost:8083/oauth/callback?code=code_123&state=custom_path_state',
	);

	const result = await callbackPromise;
	await delivered;

	t.is(result.code, 'code_123');
	t.is(result.state, 'custom_path_state');
});

test('waitForCallback supports port range', async t => {
	const server = new CallbackServer();
	// Three ports rather than eleven. The range behaviour is the same, and it
	// bounds what a failure costs: the server spends `timeoutMs` on each port
	// before moving on, so a range of eleven turned any missed delivery into a
	// 55-second hang that outlived the runner's patience and reported as a
	// pending test rather than a failing one.
	const ports = [9000, 9001, 9002];
	const options: CallbackServerOptions = {
		port: [9000, 9002],
		expectedState: 'range_state',
		timeoutMs: 2000,
	};

	const callbackPromise = server.waitForCallback(options);

	// Which port the server took is not knowable in advance, so it is found by
	// probe rather than by sending the callback to each candidate until one
	// sticks -- that would deliver the payload to whatever else happened to be
	// listening on the way.
	const delivered = findListeningPort(ports).then(async port =>
		deliverWhenReady(
			port,
			`http://localhost:${port}/callback?code=range_code&state=range_state`,
		),
	);

	const result = await callbackPromise;
	await delivered;

	t.is(result.code, 'range_code');
	t.is(result.state, 'range_state');
});

test('stop method cleans up server', async t => {
	const server = new CallbackServer();
	const options: CallbackServerOptions = {
		port: 8084,
		expectedState: 'stop_test',
		timeoutMs: 10_000,
	};

	const callbackPromise = server.waitForCallback(options);

	// Wait for the server to actually bind before aborting it; a fixed sleep
	// races with the rest of the suite under parallel load.
	await waitForPort(8084);

	await server.stop();

	const error = await t.throwsAsync(async () => callbackPromise);
	t.truthy(error);
});
