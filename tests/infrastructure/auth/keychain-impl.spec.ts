/**
 * Tests for the keytar-backed keychain service
 *
 * The point of interest is when keytar loads, not what it stores. keytar is a
 * native addon that dlopens libsecret on Linux; a static import ran it on
 * every `uxlint` invocation, including CI runs that never touch a credential,
 * and took the process down on any host without libsecret.
 */

import test from 'ava';
import {KeytarKeychainService} from '../../../source/infrastructure/auth/keychain-impl.js';

test('constructing the service does not load keytar', t => {
	// The constructor must stay inert. On a host without libsecret this line
	// used to be unreachable -- the process died at import time.
	t.notThrows(() => new KeytarKeychainService());
});

test('isAvailable reports rather than throws when keytar cannot load', async t => {
	const keychain = new KeytarKeychainService();

	// Resolves either way: true where the platform keychain works, false where
	// the native addon cannot load. What it must never do is reject or crash
	// the process, which is what the old static import did.
	const available = await t.notThrowsAsync(async () => keychain.isAvailable());

	t.is(typeof available, 'boolean');
});
