/**
 * Tests for the keytar-backed keychain service
 *
 * The point of interest is when keytar loads, not what it stores: it is a
 * native addon that dlopens libsecret on Linux, so loading it eagerly takes
 * down the process on any host without libsecret.
 */

import test from 'ava';
import {KeytarKeychainService} from '../../../source/infrastructure/auth/keychain-impl.js';

test('constructing the service does not load keytar', t => {
	t.notThrows(() => new KeytarKeychainService());
});

test('isAvailable reports rather than throws when keytar cannot load', async t => {
	const keychain = new KeytarKeychainService();

	// Resolves either way: true where the platform keychain works, false where
	// the native addon cannot load. It must never reject.
	const available = await t.notThrowsAsync(async () => keychain.isAvailable());

	t.is(typeof available, 'boolean');
});
