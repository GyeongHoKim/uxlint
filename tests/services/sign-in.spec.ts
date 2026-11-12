/**
 * Tests for the session that signs a run in and admits its pages.
 *
 * Driven through a scripted browser client that answers in the shapes the
 * real server produced (research R1). Waiting is injected, so the five-second
 * window a missing sign is given is exercised without a test taking five
 * seconds.
 */

import test from 'ava';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import type {UxLintConfig} from '../../source/models/config.js';
import {createRedactor} from '../../source/models/secret-redaction.js';
import type {SignInDescription} from '../../source/models/sign-in.js';
import {
	checkSignInSecrets,
	defaultSignInTimeoutMs,
	SignedInSession,
	signWaitWindowMs,
} from '../../source/services/sign-in.js';
import {mcpError} from '../fixtures/mcp-result.js';
import {
	scriptedBrowser,
	simulatedLoginSite,
	structure,
	type BrowserScript,
} from '../fixtures/sign-in-browser.js';

const origin = 'https://app.example.com';
const password = 'correct-horse-battery';

const description: SignInDescription = {
	url: `${origin}/login`,
	steps: [
		{fill: 'Email', value: 'qa@example.com'},
		{fill: 'Password', secret: 'QA_PASSWORD'},
		{click: 'Sign in'},
	],
	signedIn: {name: 'Sign out', role: 'button'},
};

/**
 * A session over a script, with waiting recorded instead of performed.
 */
function sessionOver(
	script: BrowserScript,
	overrides: {
		description?: SignInDescription;
		secret?: string;
		client?: MCPClient;
	} = {},
) {
	const browser = scriptedBrowser(script);
	const waited: number[] = [];
	const secret = overrides.secret ?? password;
	const session = new SignedInSession({
		client: overrides.client ?? browser.client,
		description: overrides.description ?? description,
		secrets: new Map([['QA_PASSWORD', secret]]),
		redact: createRedactor([secret]),
		async wait(ms: number) {
			waited.push(ms);
		},
	});

	return {
		session,
		calls: browser.calls,
		waitedMs: () => waited.reduce((total, ms) => total + ms, 0),
	};
}

const names = (calls: ReadonlyArray<{name: string}>) =>
	calls.map(call => call.name);

// --- establish --------------------------------------------------------------

test('sign-in opens the sign-in address before anything else', async t => {
	const site = simulatedLoginSite({origin, password});
	const {session, calls} = sessionOver(site.script);

	await session.establish();

	t.deepEqual(calls[0], {
		name: 'navigate_page',
		arguments: {url: `${origin}/login`},
	});
});

test('sign-in carries the steps out and finds the sign', async t => {
	const site = simulatedLoginSite({origin, password});
	const {session} = sessionOver(site.script);

	t.deepEqual(await session.establish(), {kind: 'signed-in'});
	t.is(site.signInCount(), 1);
});

test('the structure is captured afresh before every step', async t => {
	const site = simulatedLoginSite({origin, password});
	const {session, calls} = sessionOver(site.script);

	await session.establish();

	t.deepEqual(names(calls), [
		'navigate_page',
		'take_snapshot',
		'fill',
		'take_snapshot',
		'fill',
		'take_snapshot',
		'click',
		'take_snapshot',
	]);
});

test('the secret leaves only as the value of its fill', async t => {
	const site = simulatedLoginSite({origin, password});
	const {session, calls} = sessionOver(site.script);

	await session.establish();

	const carrying = calls.filter(call =>
		JSON.stringify(call).includes(password),
	);
	t.is(carrying.length, 1);
	t.is(carrying[0]?.name, 'fill');
	t.is(carrying[0]?.arguments['value'], password);
});

test('a literal step value is filled as written', async t => {
	const site = simulatedLoginSite({origin, password});
	const {session, calls} = sessionOver(site.script);

	await session.establish();

	const firstFill = calls.find(call => call.name === 'fill');
	t.is(firstFill?.arguments['value'], 'qa@example.com');
});

test('a step whose target never appears fails as not-found after the wait', async t => {
	const site = simulatedLoginSite({origin, password});
	const {session, waitedMs} = sessionOver(site.script, {
		description: {
			...description,
			steps: [
				{fill: 'Email', value: 'qa@example.com'},
				{fill: 'Passphrase', secret: 'QA_PASSWORD'},
				{click: 'Sign in'},
			],
		},
	});

	const outcome = await session.establish();

	t.is(outcome.kind, 'failed');
	if (outcome.kind === 'failed' && outcome.failure.kind === 'step-failed') {
		t.is(outcome.failure.stepIndex, 1);
		t.is(outcome.failure.step, 'fill "Passphrase"');
		t.is(outcome.failure.problem, 'not-found');
		t.is(outcome.failure.shown, `"Sign in" at ${origin}/login`);
	} else {
		t.fail(`expected a failed step, got ${JSON.stringify(outcome)}`);
	}

	t.is(signWaitWindowMs, 5000);
	t.true(waitedMs() >= 4000 && waitedMs() <= signWaitWindowMs);
	t.is(site.signInCount(), 0);
});

test('a step whose target appears a moment later is carried out', async t => {
	let captures = 0;
	const site = simulatedLoginSite({origin, password});
	const {session, waitedMs} = sessionOver({
		...site.script,
		snapshot() {
			captures++;
			// The form's fields render on the third capture.
			return captures < 3
				? structure('Sign in', `${origin}/login`, ['heading "Loading"'])
				: site.script.snapshot();
		},
	});

	t.deepEqual(await session.establish(), {kind: 'signed-in'});
	t.true(waitedMs() > 0 && waitedMs() < signWaitWindowMs);
});

test('a step with two matching targets fails as ambiguous without waiting', async t => {
	const {session, waitedMs} = sessionOver(
		{
			snapshot: () =>
				structure('Sign in', `${origin}/login`, [
					'button "Sign in"',
					'button "Sign in"',
				]),
		},
		{description: {...description, steps: [{click: 'Sign in'}]}},
	);

	const outcome = await session.establish();

	t.is(outcome.kind, 'failed');
	if (outcome.kind === 'failed' && outcome.failure.kind === 'step-failed') {
		t.is(outcome.failure.problem, 'ambiguous');
		t.is(outcome.failure.stepIndex, 0);
	} else {
		t.fail(`expected a failed step, got ${JSON.stringify(outcome)}`);
	}

	t.is(waitedMs(), 0);
});

test('a step the browser refuses fails as tool-error', async t => {
	const site = simulatedLoginSite({origin, password});
	const {session} = sessionOver({
		...site.script,
		onFill: () => mcpError('The element is not editable'),
	});

	const outcome = await session.establish();

	t.is(outcome.kind, 'failed');
	if (outcome.kind === 'failed' && outcome.failure.kind === 'step-failed') {
		t.is(outcome.failure.problem, 'tool-error');
		t.is(outcome.failure.stepIndex, 0);
		t.is(outcome.failure.step, 'fill "Email"');
	} else {
		t.fail(`expected a failed step, got ${JSON.stringify(outcome)}`);
	}
});

test('steps that run without the sign appearing fail as sign-absent', async t => {
	const site = simulatedLoginSite({origin, password: 'a-different-password'});
	const {session, waitedMs} = sessionOver(site.script);

	const outcome = await session.establish();

	t.deepEqual(outcome, {
		kind: 'failed',
		failure: {
			kind: 'sign-absent',
			shown: `"Sign in" at ${origin}/login?error=1 — alert: "Invalid email or password"`,
		},
	});
	t.true(waitedMs() >= 4000 && waitedMs() <= signWaitWindowMs);
});

test('what a failure shows has passed through the redactor', async t => {
	const {session} = sessionOver(
		{
			// A product that echoes the rejected password back in its error.
			snapshot: () =>
				structure('Sign in', `${origin}/login`, [
					`alert "The password ${password} is not valid"`,
					'textbox "Password "',
					'button "Sign in"',
				]),
		},
		{
			description: {
				...description,
				steps: [{fill: 'Password', secret: 'QA_PASSWORD'}, {click: 'Sign in'}],
			},
		},
	);

	const outcome = await session.establish();

	t.is(outcome.kind, 'failed');
	if (outcome.kind === 'failed' && outcome.failure.kind === 'sign-absent') {
		t.false(outcome.failure.shown.includes(password));
		t.true(outcome.failure.shown.includes('[redacted]'));
	} else {
		t.fail(`expected sign-absent, got ${JSON.stringify(outcome)}`);
	}
});

test('a sign-in address that cannot be opened fails as not-opened', async t => {
	const site = simulatedLoginSite({origin, password});
	const {session, calls} = sessionOver({
		...site.script,
		onNavigate: () =>
			mcpError(
				'Unable to navigate in the selected page: net::ERR_CONNECTION_REFUSED.',
			),
	});

	const outcome = await session.establish();

	t.is(outcome.kind, 'failed');
	if (outcome.kind === 'failed' && outcome.failure.kind === 'not-opened') {
		t.regex(outcome.failure.detail, /ERR_CONNECTION_REFUSED/);
	} else {
		t.fail(`expected not-opened, got ${JSON.stringify(outcome)}`);
	}

	t.deepEqual(names(calls), ['navigate_page']);
});

test('a sign-in that does not finish in time fails as timed-out', async t => {
	// A browser that never answers: the bound is the only way out.
	const stalled = {
		async callTool() {
			return new Promise<never>(() => {
				// Never settles.
			});
		},
	} as unknown as MCPClient;
	const site = simulatedLoginSite({origin, password});
	const {session} = sessionOver(site.script, {
		client: stalled,
		description: {...description, timeoutMs: 40},
	});

	t.deepEqual(await session.establish(), {
		kind: 'failed',
		failure: {kind: 'timed-out', afterMs: 40},
	});
});

test('a visitor the sign-in address already shows as signed in is signed in', async t => {
	// Many products send a signed-in visitor away from their login page. The
	// form is then not there to fill, and looking for it would report a
	// session that is perfectly alive as one that could not be established.
	const {session, calls} = sessionOver({
		snapshot: () =>
			structure('Dashboard', `${origin}/dashboard`, [
				'navigation',
				'  button "Sign out"',
			]),
	});

	t.deepEqual(await session.establish(), {kind: 'signed-in'});
	t.deepEqual(names(calls), ['navigate_page', 'take_snapshot']);
});

test('sign-in is bounded at thirty seconds unless the description says otherwise', t => {
	t.is(defaultSignInTimeoutMs, 30_000);
});

// --- admit ------------------------------------------------------------------

/** A session that has signed in to a simulated site. */
async function signedInTo(options: Parameters<typeof simulatedLoginSite>[0]) {
	const site = simulatedLoginSite(options);
	const over = sessionOver(site.script, {secret: options.password});
	await over.session.establish();
	const callsAfterSignIn = over.calls.length;

	return {...over, site, newCalls: () => over.calls.slice(callsAfterSignIn)};
}

test('a capture showing the sign is admitted without another browser call', async t => {
	const {session, newCalls} = await signedInTo({origin, password});
	const capture = structure('Settings', `${origin}/settings`, [
		'navigation',
		'  button "Sign out"',
		'heading "Settings" level="1"',
	]);

	const admission = await session.admit(`${origin}/settings`, capture);

	t.deepEqual(admission, {kind: 'admitted', snapshot: capture});
	t.deepEqual(newCalls(), []);
});

test('an admitted capture has passed through the redactor', async t => {
	const {session} = await signedInTo({origin, password});
	const capture = structure('API keys', `${origin}/secret`, [
		'button "Sign out"',
		`StaticText "Your key: ${password}"`,
	]);

	const admission = await session.admit(`${origin}/secret`, capture);

	t.is(admission.kind, 'admitted');
	if (admission.kind === 'admitted') {
		t.false(admission.snapshot.includes(password));
		t.true(admission.snapshot.includes('Your key: [redacted]'));
	}
});

test('the reached address is reported only when it differs from the configured one', async t => {
	const {session} = await signedInTo({origin, password});
	const capture = structure('Dashboard', `${origin}/dashboard`, [
		'button "Sign out"',
	]);

	const forwarded = await session.admit(`${origin}/home`, capture);
	const direct = await session.admit(`${origin}/dashboard/`, capture);

	t.is(
		forwarded.kind === 'admitted' ? forwarded.reachedUrl : 'refused',
		`${origin}/dashboard`,
	);
	t.is(direct.kind === 'admitted' ? direct.reachedUrl : 'refused', undefined);
});

test('a sign that renders a moment late is waited for, not treated as signed out', async t => {
	const {session, site, newCalls, waitedMs} = await signedInTo({
		origin,
		password,
		signAppearsAfter: 2,
	});
	const early = structure('settings', `${origin}/settings`, [
		'heading "settings" level="1"',
	]);

	const admission = await session.admit(`${origin}/settings`, early);

	t.is(admission.kind, 'admitted');
	t.is(site.signInCount(), 1, 'the session was never lost');
	t.true(names(newCalls()).every(name => name === 'take_snapshot'));
	t.true(waitedMs() > 0 && waitedMs() < signWaitWindowMs);
});

test('a lost session is recovered by signing in again exactly once', async t => {
	const {session, site, newCalls, waitedMs} = await signedInTo({
		origin,
		password,
	});
	site.expire();
	const signedOut = site.script.snapshot();

	const admission = await session.admit(`${origin}/billing`, signedOut);

	t.is(admission.kind, 'admitted');
	t.is(site.signInCount(), 2);
	if (admission.kind === 'admitted') {
		t.true(admission.snapshot.includes(`url="${origin}/billing"`));
	}

	// Waited the full window first, then signed in and re-opened the page.
	t.true(waitedMs() >= 4000 && waitedMs() <= signWaitWindowMs);
	const navigations = newCalls()
		.filter(call => call.name === 'navigate_page')
		.map(call => call.arguments['url']);
	t.deepEqual(navigations, [`${origin}/login`, `${origin}/billing`]);
});

test('a session that cannot be re-established refuses the page as session-lost', async t => {
	const {session, site} = await signedInTo({origin, password});
	site.expire();
	site.setPassword('changed-since-the-run-began');

	const admission = await session.admit(
		`${origin}/billing`,
		site.script.snapshot(),
	);

	t.deepEqual(admission, {
		kind: 'refused',
		reason: 'session-lost',
		detail: `The session was lost and signing in again failed: Sign-in steps completed but the signed-in sign "Sign out" did not appear. The page showed: "Sign in" at ${origin}/login?error=1 — alert: "Invalid email or password"`,
	});
	t.is(site.signInCount(), 1);
});

test('a page without the sign after a successful sign-in is refused as sign-missing', async t => {
	const {session, site} = await signedInTo({
		origin,
		password,
		pagesWithoutSign: ['/editor'],
	});
	site.script.onNavigate?.(`${origin}/editor`);

	const admission = await session.admit(
		`${origin}/editor`,
		site.script.snapshot(),
	);

	t.deepEqual(admission, {
		kind: 'refused',
		reason: 'sign-missing',
		detail:
			'Signed in, but this page did not show the signed-in sign "Sign out". The account may not have access to it, or the page may not carry the sign',
	});
	t.is(site.signInCount(), 2, 'recovery signed in once before giving up');
});

test('recovery is attempted once per page, not until it works', async t => {
	const {session, site, newCalls} = await signedInTo({
		origin,
		password,
		pagesWithoutSign: ['/editor'],
	});
	site.script.onNavigate?.(`${origin}/editor`);

	await session.admit(`${origin}/editor`, site.script.snapshot());

	const signInVisits = newCalls().filter(
		call =>
			call.name === 'navigate_page' &&
			call.arguments['url'] === `${origin}/login`,
	);
	t.is(signInVisits.length, 1);
});

test('the session exposes the run redactor', async t => {
	const {session} = await signedInTo({origin, password});

	t.is(session.redact(`key ${password}`), 'key [redacted]');
});

// --- checkSignInSecrets -----------------------------------------------------

const config: UxLintConfig = {
	mainPageUrl: `${origin}/dashboard`,
	subPageUrls: [],
	pages: [{url: `${origin}/dashboard`, features: 'Usage this month'}],
	persona: 'An operations lead',
	report: {output: './ux-report.md'},
	signIn: description,
};

test('a configuration without sign-in needs no secrets', t => {
	const {signIn: _removed, ...withoutSignIn} = config;

	t.is(checkSignInSecrets(withoutSignIn, {}), undefined);
});

test('a configuration whose secrets are all set passes the check', t => {
	t.is(checkSignInSecrets(config, {QA_PASSWORD: password}), undefined);
});

test('an unset secret is reported by name before any browser starts', t => {
	t.is(
		checkSignInSecrets(config, {}),
		'Sign-in needs QA_PASSWORD, which is not set in the environment',
	);
});

test('a secret too short to redact is reported without its value', t => {
	t.is(
		checkSignInSecrets(config, {QA_PASSWORD: 'abc'}),
		'Sign-in cannot use QA_PASSWORD: its value is shorter than 4 characters',
	);
});
