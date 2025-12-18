import test from 'ava';
import {MockBrowserService} from '../../../source/infrastructure/auth/browser-mock.js';
import {AuthErrorCode} from '../../../source/models/auth-error.js';

test('MockBrowserService tracks opened URLs', async t => {
	const browser = new MockBrowserService();
	await browser.openUrl('https://example.com');
	await browser.openUrl('https://example.com/2');

	t.deepEqual(browser.openedUrls, [
		'https://example.com',
		'https://example.com/2',
	]);
});

test('MockBrowserService can simulate failure', async t => {
	const browser = new MockBrowserService();
	browser.shouldFail = true;

	const error = await t.throwsAsync(async () => {
		await browser.openUrl('https://example.com');
	});

	t.is((error as any)?.code, AuthErrorCode.BROWSER_FAILED);
});

test('MockBrowserService clear() resets state', async t => {
	const browser = new MockBrowserService();
	await browser.openUrl('https://example.com');
	browser.shouldFail = true;

	browser.clear();
	t.deepEqual(browser.openedUrls, []);
	t.false(browser.shouldFail);
});
