import test from 'ava';
import {TokenManager} from '../../../source/infrastructure/auth/token-manager.js';
import {MockKeychainService} from '../../../source/infrastructure/auth/keychain-mock.js';
import type {AuthenticationSession} from '../../../source/models/auth-session.js';

function createSession(expiresAt: Date): AuthenticationSession {
	return {
		version: 1,
		user: {id: 'user_1', email: 'user@example.com', name: 'User'},
		tokens: {
			accessToken: 'access',
			tokenType: 'Bearer',
			expiresIn: 3600,
			refreshToken: 'refresh',
		},
		metadata: {
			createdAt: new Date().toISOString(),
			expiresAt: expiresAt.toISOString(),
		},
	};
}

test('TokenManager.loadSession returns null when missing', async t => {
	const manager = new TokenManager(new MockKeychainService());
	t.is(await manager.loadSession(), undefined);
});

test('TokenManager.saveSession + loadSession round-trip', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);
	const session = createSession(new Date(Date.now() + 60_000));

	await manager.saveSession(session);
	const loaded = await manager.loadSession();

	t.deepEqual(loaded, session);
});

test('TokenManager.loadSession deletes corrupted JSON and returns null', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);

	await keychain.setPassword('uxlint-cli', 'default', '{not json');
	const session = await manager.loadSession();

	t.is(session, undefined);
	t.is(await keychain.getPassword('uxlint-cli', 'default'), undefined);
});

test('TokenManager.loadSession deletes invalid session and returns null', async t => {
	const keychain = new MockKeychainService();
	const manager = new TokenManager(keychain);

	await keychain.setPassword(
		'uxlint-cli',
		'default',
		JSON.stringify({version: 1}),
	);
	const session = await manager.loadSession();

	t.is(session, undefined);
	t.is(await keychain.getPassword('uxlint-cli', 'default'), undefined);
});
