import test from 'ava';
import {
	CallbackServer,
	type CallbackServerOptions,
} from '../../../source/infrastructure/auth/callback-server.js';
import {
	AuthErrorCode,
	AuthenticationError,
} from '../../../source/models/auth-error.js';

test('waitForCallback returns code and state on success', async t => {
	const server = new CallbackServer();
	const options: CallbackServerOptions = {
		port: 8080,
		expectedState: 'test_state_123',
		timeoutMs: 5000,
	};

	const callbackPromise = server.waitForCallback(options);

	setTimeout(async () => {
		const response = await fetch(
			'http://localhost:8080/callback?code=auth_code_xyz&state=test_state_123',
		);
		await response.text();
	}, 100);

	const result = await callbackPromise;

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

	setTimeout(async () => {
		const response = await fetch(
			'http://localhost:8081/callback?code=auth_code&state=wrong_state',
		);
		await response.text();
	}, 100);

	const error = await t.throwsAsync<AuthenticationError>(
		async () => callbackPromise,
		{instanceOf: AuthenticationError},
	);

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

	setTimeout(async () => {
		const response = await fetch(
			'http://localhost:8082/callback?error=access_denied&error_description=User+denied+access&state=test_state',
		);
		await response.text();
	}, 100);

	const error = await t.throwsAsync<AuthenticationError>(
		async () => callbackPromise,
		{instanceOf: AuthenticationError},
	);

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

	setTimeout(async () => {
		const response = await fetch(
			'http://localhost:8083/oauth/callback?code=code_123&state=custom_path_state',
		);
		await response.text();
	}, 100);

	const result = await callbackPromise;

	t.is(result.code, 'code_123');
	t.is(result.state, 'custom_path_state');
});

test('waitForCallback supports port range', async t => {
	const server = new CallbackServer();
	const options: CallbackServerOptions = {
		port: [9000, 9010],
		expectedState: 'range_state',
		timeoutMs: 5000,
	};

	const callbackPromise = server.waitForCallback(options);

	setTimeout(() => {
		void (async () => {
			for (let port = 9000; port <= 9010; port++) {
				try {
					// eslint-disable-next-line no-await-in-loop
					const response = await fetch(
						`http://localhost:${port}/callback?code=range_code&state=range_state`,
						{signal: AbortSignal.timeout(100)},
					);
					// eslint-disable-next-line no-await-in-loop
					await response.text();
					break;
				} catch {
					continue;
				}
			}
		})();
	}, 100);

	const result = await callbackPromise;

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

	await new Promise(resolve => {
		setTimeout(resolve, 100);
	});

	await server.stop();

	const error = await t.throwsAsync(async () => callbackPromise);
	t.truthy(error);
});
