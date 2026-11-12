/**
 * `uxlint sign-in` (011 T063 · FR-015, FR-016).
 *
 * The check a developer runs when a sign-in does not work, or before trusting
 * one in a pipeline. It reviews nothing, so what is asserted here is mostly
 * what it prints, in what order, and what it leaves alone.
 */

import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import type {UxLintConfig} from '../source/models/config.js';
import type {SignInStep} from '../source/models/sign-in.js';
import {runSignInCheck} from '../source/sign-in-check.js';
import {readyVerdict} from './delegate/helpers.js';
import {
	scriptedBrowser,
	simulatedLoginSite,
} from './fixtures/sign-in-browser.js';

const origin = 'https://app.example.com';
const password = 'correct-horse-battery';
const secretName = 'QA_PASSWORD';

const workingSteps: SignInStep[] = [
	{fill: 'Email', value: 'qa@example.com'},
	{fill: 'Password', secret: secretName},
	{click: 'Sign in'},
];

const configFor = (
	paths: readonly string[],
	steps: SignInStep[] | 'no-sign-in' = workingSteps,
): UxLintConfig => {
	const urls = paths.map(item => `${origin}${item}`);

	return {
		mainPageUrl: urls[0]!,
		subPageUrls: urls.slice(1),
		pages: urls.map(url => ({url, features: `Features of ${url}`})),
		persona: 'An operations lead',
		report: {
			output: path.join(os.tmpdir(), `uxlint-never-written-${Date.now()}.md`),
		},
		...(steps !== 'no-sign-in' && {
			signIn: {
				url: `${origin}/login`,
				steps,
				signedIn: {name: 'Sign out', role: 'button'},
			},
		}),
	};
};

/**
 * Run the check against the simulated login site.
 *
 * `/home` forwards to `/dashboard`, and `/editor` is reachable signed in but
 * never shows the sign.
 */
async function check(
	config: UxLintConfig,
	options: {
		withoutTools?: readonly string[];
		environment?: Record<string, string | undefined>;
	} = {},
) {
	const site = simulatedLoginSite({
		origin,
		password,
		pagesWithoutSign: ['/editor'],
		printsPasswordOn: ['/keys'],
	});
	const events: string[] = [];
	const messages: string[] = [];
	const navigations: string[] = [];
	let preflightRuns = 0;
	let ticks = 0;

	const browser = scriptedBrowser({
		...site.script,
		...(options.withoutTools && {withoutTools: options.withoutTools}),
		onNavigate(url) {
			navigations.push(url);
			return site.script.onNavigate?.(
				url === `${origin}/home` ? `${origin}/dashboard` : url,
			);
		},
	});
	const client = new Proxy(browser.client, {
		get(target, property) {
			if (property === 'close') {
				return async () => {
					events.push('closed');
					return target.close();
				};
			}

			return Reflect.get(target, property, target) as unknown;
		},
	});

	const exitCode = await runSignInCheck(config, {
		client,
		environment: options.environment ?? {[secretName]: password},
		async runPreflight() {
			preflightRuns++;
			return readyVerdict;
		},
		emitMessage(message) {
			events.push('printed');
			messages.push(message);
		},
		// Signing in takes 1.2 s by this clock, whatever the machine.
		now: () => (ticks++ === 0 ? 0 : 1200),
	});

	return {
		exitCode,
		messages,
		events,
		navigations,
		calls: browser.calls,
		closed: browser.closed(),
		preflightRuns,
		site,
	};
}

test('a working sign-in is reported with one line per page, and exits 0', async t => {
	const config = configFor(['/dashboard', '/settings']);

	const {exitCode, messages, site} = await check(config);

	t.deepEqual(messages, [
		'uxlint: signed in — found button "Sign out" after 3 steps (1.2 s)',
		`  ✓ ${origin}/dashboard`,
		`  ✓ ${origin}/settings`,
	]);
	t.is(exitCode, 0);
	t.is(site.signInCount(), 1);
	t.false(existsSync(config.report.output), 'the check writes no report');
});

test('a page reached at another address is pointed out, and is not a failure', async t => {
	const {exitCode, messages} = await check(configFor(['/dashboard', '/home']));

	t.deepEqual(messages.slice(1), [
		`  ✓ ${origin}/dashboard`,
		`  → ${origin}/home — reached ${origin}/dashboard`,
	]);
	t.is(exitCode, 0);
});

test('a page that does not show the sign is marked, the rest are still checked, and the check exits 1', async t => {
	t.timeout(60_000);

	const {exitCode, messages} = await check(
		configFor(['/dashboard', '/editor', '/settings']),
	);

	t.deepEqual(messages, [
		'uxlint: signed in — found button "Sign out" after 3 steps (1.2 s)',
		`  ✓ ${origin}/dashboard`,
		`  ✗ ${origin}/editor — signed in, but this page did not show the signed-in sign "Sign out"`,
		`  ✓ ${origin}/settings`,
	]);
	t.is(exitCode, 1);
});

test('a failed sign-in prints only the step that failed and what the page showed', async t => {
	t.timeout(60_000);

	const {exitCode, messages, navigations} = await check(
		configFor(
			['/dashboard', '/settings'],
			[
				{fill: 'Email', value: 'qa@example.com'},
				{fill: 'Passphrase', secret: secretName},
				{click: 'Sign in'},
			],
		),
	);

	t.is(messages.length, 1);
	t.regex(
		messages[0]!,
		/^uxlint: sign-in failed at step 2 \(fill "Passphrase"\): not-found\. The page showed: "Sign in" at https:\/\/app\.example\.com\/login/,
	);
	t.is(exitCode, 1);
	t.deepEqual(
		navigations.filter(url => url !== `${origin}/login`),
		[],
		'no page is opened signed out',
	);
});

test('a sign-in that fails for another reason is reported with its reason', async t => {
	t.timeout(60_000);

	const {exitCode, messages} = await check(configFor(['/dashboard']), {
		environment: {[secretName]: 'not-the-password'},
	});

	t.deepEqual(messages, [
		`uxlint: sign-in failed — Sign-in steps completed but the signed-in sign "Sign out" did not appear. The page showed: "Sign in" at ${origin}/login?error=1 — alert: "Invalid email or password"`,
	]);
	t.is(exitCode, 1);
});

test('a configuration with no signIn block is told so, and nothing is started', async t => {
	const {exitCode, messages, calls, preflightRuns} = await check(
		configFor(['/dashboard'], 'no-sign-in'),
	);

	t.deepEqual(messages, ['uxlint: this configuration has no signIn block']);
	t.is(exitCode, 1);
	t.is(preflightRuns, 0);
	t.deepEqual(calls, []);
});

test('a secret that is not set stops the check before a browser is looked for', async t => {
	const {exitCode, messages, calls, preflightRuns} = await check(
		configFor(['/dashboard']),
		{environment: {}},
	);

	t.deepEqual(messages, [
		`uxlint: Sign-in needs ${secretName}, which is not set in the environment`,
	]);
	t.is(exitCode, 1);
	t.is(preflightRuns, 0);
	t.deepEqual(calls, []);
});

test('a browser server that cannot sign in is reported, and released', async t => {
	const {exitCode, messages, closed} = await check(configFor(['/dashboard']), {
		withoutTools: ['fill'],
	});

	t.is(messages.length, 1);
	t.regex(messages[0]!, /^uxlint: The browser server does not offer fill/);
	t.is(exitCode, 1);
	t.is(closed, 1);
});

for (const [label, paths, steps] of [
	['a working sign-in', ['/dashboard', '/settings'], workingSteps],
	[
		'a failed sign-in',
		['/dashboard'],
		[
			{fill: 'Email', value: 'qa@example.com'},
			{fill: 'Passphrase', secret: secretName},
			{click: 'Sign in'},
		],
	],
] as const) {
	test(`${label} prints nothing until the browser has been closed, and closes it once`, async t => {
		t.timeout(60_000);

		const {events, closed} = await check(configFor(paths, [...steps]));

		t.is(events[0], 'closed', 'stdout is the browser server’s until then');
		t.is(events.filter(event => event === 'closed').length, 1);
		t.true(events.includes('printed'));
		t.is(closed, 1);
	});
}

test('a page that prints the password is checked without the password being printed', async t => {
	const {exitCode, messages, calls} = await check(
		configFor(['/dashboard', '/keys']),
	);

	t.is(exitCode, 0);
	t.false(messages.join('\n').includes(password));
	// The premise: the password was typed, so there was something to leak.
	t.true(
		calls.some(
			call => call.name === 'fill' && call.arguments['value'] === password,
		),
	);
});
