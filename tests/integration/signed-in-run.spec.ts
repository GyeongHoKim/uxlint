/**
 * Signing in with a real browser (011 T025 · SC-001, SC-006).
 *
 * Every other sign-in test drives a scripted client. This one starts the
 * fixture site, the pinned browser server and a real headless Chrome, because
 * the properties it checks are the ones a script cannot confirm: that the
 * server's `fill` and `click` really submit a form, that the session cookie
 * really persists from one navigation to the next, and how long it all takes.
 *
 * Skipped where no browser is installed, by the same convention as
 * `browser-preflight.spec.ts`.
 */

import * as fs from 'node:fs';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import test from 'ava';
import {createRedactor} from '../../source/models/secret-redaction.js';
import type {SignInDescription} from '../../source/models/sign-in.js';
import {readToolOutcome} from '../../source/models/tool-output.js';
import {
	defaultChromePaths,
	runPreflight,
} from '../../source/services/browser-preflight.js';
import {
	getMCPClient,
	resetMCPClient,
} from '../../source/services/mcp-client.js';
import {
	SignedInSession,
	type SignInBrowser,
} from '../../source/services/sign-in.js';
import {runSequentially} from '../../source/utils/run-sequentially.js';
import {
	loginSiteEmail,
	startLoginSite,
	type LoginSite,
} from '../fixtures/login-site.js';

const hasBrowser = defaultChromePaths().some(path => {
	try {
		fs.accessSync(path, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
});

const realBrowser = hasBrowser ? test.serial : test.serial.skip;

const password = 'correct-horse-battery-staple';

/** The single-screen form at `/login`. */
const oneScreen = (site: LoginSite): SignInDescription => ({
	url: `${site.baseUrl}/login`,
	steps: [
		{fill: 'Email', value: loginSiteEmail},
		{fill: 'Password', secret: 'QA_PASSWORD'},
		{click: 'Sign in'},
	],
	signedIn: {name: 'Sign out', role: 'button'},
});

/** The form at `/login-2step`: the email on one screen, the password on the next. */
const twoScreens = (site: LoginSite): SignInDescription => ({
	url: `${site.baseUrl}/login-2step`,
	steps: [
		{fill: 'Email', value: loginSiteEmail},
		{click: 'Next'},
		{fill: 'Password', secret: 'QA_PASSWORD'},
		{click: 'Sign in'},
	],
	signedIn: {name: 'Sign out', role: 'button'},
});

/**
 * A fixture site and a real browser, torn down with the test.
 */
async function startRun(t: {teardown(fn: () => Promise<void>): void}) {
	const site = await startLoginSite({password});
	const verdict = await runPreflight(undefined);
	if (verdict.kind === 'unmet') {
		await site.close();
		throw new Error('a browser was found but preflight says it cannot run');
	}

	const client = await getMCPClient(verdict, undefined);
	t.teardown(async () => {
		await client.close();
		resetMCPClient();
		await site.close();
	});

	return {site, client};
}

const sessionFor = (client: MCPClient, description: SignInDescription) =>
	new SignedInSession({
		client,
		description,
		secrets: new Map([['QA_PASSWORD', password]]),
		redact: createRedactor([password]),
	});

/** Open a page and capture it, as each route does before asking the session. */
async function capture(client: MCPClient, url: string): Promise<string> {
	const browser = client as unknown as SignInBrowser;
	await browser.callTool({name: 'navigate_page', arguments: {url}});
	return readToolOutcome(
		await browser.callTool({name: 'take_snapshot', arguments: {}}),
	).text;
}

realBrowser(
	'a real browser signs in through the form and keeps its session across pages',
	async t => {
		const {site, client} = await startRun(t);
		const session = sessionFor(client, oneScreen(site));

		const startedAt = Date.now();
		const outcome = await session.establish();
		const signInMs = Date.now() - startedAt;

		t.deepEqual(outcome, {kind: 'signed-in'});

		// The feature's baseline (SC-006): recorded so a regression has a
		// number to be measured against, and bounded so one cannot hide.
		t.log(`sign-in against the fixture site took ${signInMs} ms`);
		t.true(signInMs < 5000, `sign-in took ${signInMs} ms`);

		// One browser, one page at a time.
		const admissions = await runSequentially(
			['/dashboard', '/settings', '/billing'],
			async path => {
				const url = `${site.baseUrl}${path}`;
				return {
					url,
					admission: await session.admit(url, await capture(client, url)),
				};
			},
		);

		for (const {url, admission} of admissions) {
			t.is(admission.kind, 'admitted', `${url} was not admitted`);
			if (admission.kind === 'admitted') {
				t.true(admission.snapshot.includes(`url="${url}"`));
				t.is(admission.reachedUrl, undefined);
			}
		}

		t.is(site.signInCount(), 1, 'the run signed in once for all its pages');
	},
);

realBrowser(
	'a real browser signs in through a form that spans two screens',
	async t => {
		const {site, client} = await startRun(t);
		const session = sessionFor(client, twoScreens(site));

		t.deepEqual(await session.establish(), {kind: 'signed-in'});
		t.is(site.signInCount(), 1);
	},
);

realBrowser(
	'a page that prints the password is admitted without it',
	async t => {
		const {site, client} = await startRun(t);
		const session = sessionFor(client, oneScreen(site));
		await session.establish();

		const url = `${site.baseUrl}/secret`;
		const raw = await capture(client, url);
		const admission = await session.admit(url, raw);

		// The premise first: the browser really does hand the value back.
		t.true(raw.includes(password));
		t.is(admission.kind, 'admitted');
		if (admission.kind === 'admitted') {
			t.false(admission.snapshot.includes(password));
			t.true(admission.snapshot.includes('[redacted]'));
		}
	},
);

realBrowser('a real browser reports a rejected password', async t => {
	const {site, client} = await startRun(t);
	site.setPassword('changed-since-the-run-was-configured');
	const session = sessionFor(client, oneScreen(site));

	const outcome = await session.establish();

	t.is(outcome.kind, 'failed');
	if (outcome.kind === 'failed' && outcome.failure.kind === 'sign-absent') {
		t.regex(outcome.failure.shown, /Invalid email or password/);
	} else {
		t.fail(`expected sign-absent, got ${JSON.stringify(outcome)}`);
	}

	t.is(site.signInCount(), 0);
});
