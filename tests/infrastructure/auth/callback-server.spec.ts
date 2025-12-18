import test from 'ava';
import {CallbackServer} from '../../../source/infrastructure/auth/callback-server.js';
import {AuthErrorCode} from '../../../source/models/auth-error.js';

test('CallbackServer validates state', async t => {
	const server = new CallbackServer(async () => {
		return {code: 'c', state: 'actual'};
	});
	const error = await t.throwsAsync(async () => {
		await server.waitForCallback({
			authorizationUrl: 'https://auth.example.com',
			redirectUri: 'http://localhost:8080/callback',
			expectedState: 'expected',
		});
	});

	t.is((error as any)?.code, AuthErrorCode.INVALID_RESPONSE);
});
