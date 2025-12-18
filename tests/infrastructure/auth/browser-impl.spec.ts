import test from 'ava';
import sinon from 'sinon';
import {OpenBrowserService} from '../../../source/infrastructure/auth/browser-impl.js';
import {AuthErrorCode} from '../../../source/models/auth-error.js';

test('OpenBrowserService calls open() with wait=false', async t => {
	const openStub = sinon.stub().resolves(undefined);
	const svc = new OpenBrowserService(openStub);

	await svc.openUrl('https://example.com');
	t.true(openStub.calledWith('https://example.com'));

	const options = openStub.firstCall.args[1] as {wait?: boolean} | undefined;
	t.is(options?.wait, false);
});

test('OpenBrowserService wraps errors as AuthenticationError', async t => {
	const openStub = sinon.stub().rejects(new Error('fail'));
	const svc = new OpenBrowserService(openStub);

	const error = await t.throwsAsync(async () => {
		await svc.openUrl('https://example.com');
	});

	t.is((error as any)?.code, AuthErrorCode.BROWSER_FAILED);
});
