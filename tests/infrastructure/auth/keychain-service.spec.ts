import test from 'ava';
import {MockKeychainService} from '../../../source/infrastructure/auth/keychain-mock.js';

test('MockKeychainService stores and retrieves values', async t => {
	const keychain = new MockKeychainService();

	await keychain.setPassword('uxlint-cli', 'default', 'value');
	t.is(await keychain.getPassword('uxlint-cli', 'default'), 'value');
	t.is(await keychain.getPassword('uxlint-cli', 'missing'), undefined);
});

test('MockKeychainService deletes values', async t => {
	const keychain = new MockKeychainService();

	await keychain.setPassword('uxlint-cli', 'default', 'value');
	t.true(await keychain.deletePassword('uxlint-cli', 'default'));
	t.false(await keychain.deletePassword('uxlint-cli', 'default'));
});

test('MockKeychainService supports clear()', async t => {
	const keychain = new MockKeychainService();

	await keychain.setPassword('uxlint-cli', 'default', 'value');
	keychain.clear();
	t.is(await keychain.getPassword('uxlint-cli', 'default'), undefined);
});
