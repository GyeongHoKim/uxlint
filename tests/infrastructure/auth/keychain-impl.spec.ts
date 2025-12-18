import test from 'ava';
import sinon from 'sinon';
import {KeytarKeychainService} from '../../../source/infrastructure/auth/keychain-impl.js';
import {AuthErrorCode} from '../../../source/models/auth-error.js';

test('KeytarKeychainService wraps keytar errors as AuthenticationError', async t => {
	const sandbox = sinon.createSandbox();
	const keytar = {
		getPassword: sandbox.stub().rejects(new Error('boom')),
		setPassword: sandbox.stub().resolves(),
		deletePassword: sandbox.stub().resolves(true),
	};

	const svc = new KeytarKeychainService(keytar);

	const error = await t.throwsAsync(async () => {
		await svc.getPassword('uxlint-cli', 'default');
	});

	t.is((error as any)?.code, AuthErrorCode.KEYCHAIN_ERROR);
	sandbox.restore();
});
