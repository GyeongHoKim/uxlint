/**
 * `delegate capture` — the deterministic half, run by the agent.
 *
 * Driven with an injected browser and no agent anywhere, which is the point of
 * the route: everything here is work uxlint does itself, and a model is not
 * involved in any of it.
 */

import {promises as fsPromises} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';
import {captureForAgent} from '../../../source/delegate/driven/capture.js';
import {DelegationSession} from '../../../source/delegate/session.js';
import type {RunProvenance} from '../../../source/models/analysis.js';
import type {PreflightVerdict} from '../../../source/models/browser-preflight.js';
import type {UxLintConfig} from '../../../source/models/config.js';
import {
	describeSignInFailure,
	missingSecretText,
} from '../../../source/models/sign-in.js';
import {
	scriptedBrowser,
	simulatedLoginSite,
} from '../../fixtures/sign-in-browser.js';
import {configFor, fakeBrowser, readyVerdict} from '../helpers.js';

/**
 * A parent directory of its own, so one test's runs are invisible to another's.
 *
 * @param teardown - Ava's teardown registrar
 * @returns The directory
 */
async function parentDirectory(
	teardown: (fn: () => Promise<void>) => void,
): Promise<string> {
	const directory = await fsPromises.mkdtemp(
		path.join(os.tmpdir(), 'uxlint-capture-test-'),
	);
	teardown(async () => {
		await fsPromises.rm(directory, {recursive: true, force: true});
	});
	return directory;
}

/** What `capture` prints, as far as these tests need it. */
type CapturePayload = {
	run: string;
	pages: Array<{pageUrl: string; captured: boolean; failureReason?: string}>;
};

const silent = {
	async runPreflight() {
		return readyVerdict;
	},
	emitMessage() {
		// Nothing is printed during a test.
	},
};

test('every configured page is captured, and the run identity is printed', async t => {
	const parent = await parentDirectory(t.teardown);
	const payloads: unknown[] = [];

	const exitCode = await captureForAgent(configFor(2, 'report.md'), {
		...silent,
		client: fakeBrowser(),
		parentDirectory: parent,
		emitPayload(payload: unknown) {
			payloads.push(payload);
		},
	});

	t.is(exitCode, 0);
	t.is(payloads.length, 1, 'the payload is the command’s whole output');

	const payload = payloads[0] as CapturePayload;
	t.truthy(payload.run);
	t.deepEqual(
		payload.pages.map(page => page.pageUrl),
		['https://example.com/page-1', 'https://example.com/page-2'],
	);
	t.true(payload.pages.every(page => page.captured));
});

test('the run it printed is the run that exists afterwards', async t => {
	const parent = await parentDirectory(t.teardown);
	let payload: CapturePayload | undefined;

	await captureForAgent(configFor(2, 'report.md'), {
		...silent,
		client: fakeBrowser(),
		parentDirectory: parent,
		emitPayload(value: unknown) {
			payload = value as CapturePayload;
		},
	});

	const session = await DelegationSession.loadById(payload!.run, {
		parentDirectory: parent,
	});

	t.deepEqual(session.pageUrls, [
		'https://example.com/page-1',
		'https://example.com/page-2',
	]);

	// The evidence an agent will ask for has to be there already: `evidence`
	// opens no browser.
	const evidence = session.evidenceFor('https://example.com/page-1');
	t.truthy(evidence);
	t.is(evidence!.persona, 'A first-time visitor on a phone');
	t.true(evidence!.snapshot.length > 0);
	t.true(evidence!.measurementDigest.length > 0);
});

test('a page that could not be read is recorded with its reason', async t => {
	const parent = await parentDirectory(t.teardown);
	let payload: CapturePayload | undefined;

	const exitCode = await captureForAgent(configFor(1, 'report.md'), {
		...silent,
		client: fakeBrowser({navigateSucceeds: false}),
		parentDirectory: parent,
		emitPayload(value: unknown) {
			payload = value as CapturePayload;
		},
	});

	// A page uxlint could not open is a fact about the page, not a failure of
	// the command: the agent is still told, and still gets a run to work with.
	t.is(exitCode, 0);
	t.false(payload!.pages[0]!.captured);
	t.regex(payload!.pages[0]!.failureReason!, /could not be opened/);

	const session = await DelegationSession.loadById(payload!.run, {
		parentDirectory: parent,
	});
	t.regex(
		session.evidenceFor('https://example.com/page-1')!.captureFailureReason!,
		/could not be opened/,
	);
});

test('a browser the environment cannot run stops the command before it claims a capture', async t => {
	const parent = await parentDirectory(t.teardown);
	const messages: string[] = [];

	const exitCode = await captureForAgent(configFor(1, 'report.md'), {
		client: fakeBrowser(),
		parentDirectory: parent,
		async runPreflight(): Promise<PreflightVerdict> {
			return {
				kind: 'unmet',
				requirement: {kind: 'browser-absent', searchedPaths: ['/nowhere']},
			};
		},
		emitMessage(message: string) {
			messages.push(message);
		},
		emitPayload() {
			t.fail('nothing may be printed when nothing was captured');
		},
	});

	t.is(exitCode, 1);
	t.true(messages.length > 0);
});

// The feature's premise. A credential may be present and must still go unread.
// Watched at its real source, the environment, rather than through a hook the
// command could simply never call. Serial because it swaps a process global.
test.serial('no model provider credential is read', async t => {
	const parent = await parentDirectory(t.teardown);
	const credential = 'UXLINT_AI_API_KEY';
	const environment = process.env;
	let readCredential = false;

	process.env = new Proxy(environment, {
		get(target, key) {
			if (key === credential) {
				readCredential = true;
				return 'a-key';
			}

			return Reflect.get(target, key) as unknown;
		},
		has(target, key) {
			if (key === credential) {
				readCredential = true;
				return true;
			}

			return Reflect.has(target, key);
		},
	});
	t.teardown(() => {
		process.env = environment;
	});

	await captureForAgent(configFor(1, 'report.md'), {
		...silent,
		client: fakeBrowser(),
		parentDirectory: parent,
		emitPayload() {
			// Discarded.
		},
	});

	t.false(
		readCredential,
		'the deterministic half must not reach for a credential it has no use for',
	);
});

test('capture sweeps runs nobody came back for', async t => {
	const parent = await parentDirectory(t.teardown);

	const abandoned = await DelegationSession.create(
		{
			hostAgent: 'claude-code',
			pages: [
				{
					pageUrl: 'https://example.com/old',
					features: 'f',
					persona: 'p',
					snapshot: 's',
					measurementDigest: 'm',
				},
			],
		},
		{parentDirectory: parent},
	);

	const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
	await fsPromises.utimes(abandoned.directory, old, old);

	await captureForAgent(configFor(1, 'report.md'), {
		...silent,
		client: fakeBrowser(),
		parentDirectory: parent,
		emitPayload() {
			// Discarded.
		},
	});

	await t.throwsAsync(
		DelegationSession.loadById(abandoned.id, {parentDirectory: parent}),
		{message: /No delegation session/},
	);
});

// Signing in (011). The browser is the scripted login site rather than
// `fakeBrowser`, because what is being asserted is the order of the calls the
// command made and whether the site let it in. That client answers the
// measurement tools with an error, so every page here is captured and left
// unmeasured.
const origin = 'https://app.example.com';
const password = 'correct-horse-battery';

/**
 * A configuration over two pages behind the login site's form.
 *
 * Literal values only, so no environment variable has to exist for the
 * description to be usable.
 *
 * @param describesSignIn - Whether the configuration carries a `signIn` block
 * @returns The configuration
 */
function gatedConfig(describesSignIn: boolean): UxLintConfig {
	const urls = [`${origin}/dashboard`, `${origin}/settings`];

	return {
		mainPageUrl: urls[0]!,
		subPageUrls: urls.slice(1),
		pages: urls.map((url, index) => ({
			url,
			features: `Features of page ${index + 1}`,
		})),
		persona: 'A first-time visitor on a phone',
		report: {output: 'report.md'},
		...(describesSignIn && {
			signIn: {
				url: `${origin}/login`,
				steps: [
					{fill: 'Email', value: 'qa@example.com'},
					{fill: 'Password', value: password},
					{click: 'Sign in'},
				],
				signedIn: {name: 'Sign out', role: 'button'},
			},
		}),
	};
}

/**
 * Run `capture` against the login site, keeping what the browser was asked so
 * the order of it can be read back.
 *
 * @param teardown - Ava's teardown registrar
 * @param options - What the configuration and the server carry
 * @param options.describesSignIn - Whether the configuration carries a `signIn` block
 * @param options.withoutTools - Tools the browser server does not offer
 * @param options.sitePassword - What the site's form accepts, when it is not what the configuration types
 * @param options.configure - A last change to the configuration before the command runs
 * @returns The command's result and what it left behind
 */
async function captureAgainstLoginSite(
	teardown: (fn: () => Promise<void>) => void,
	options: {
		describesSignIn: boolean;
		withoutTools?: readonly string[];
		sitePassword?: string;
		configure?: (config: UxLintConfig) => UxLintConfig;
	},
) {
	const {
		describesSignIn,
		withoutTools = [],
		sitePassword = password,
		configure = (config: UxLintConfig) => config,
	} = options;
	const parent = await parentDirectory(teardown);
	const site = simulatedLoginSite({origin, password: sitePassword});
	const browser = scriptedBrowser({...site.script, withoutTools});
	const messages: string[] = [];
	let payload: CapturePayload | undefined;
	let preflightRuns = 0;

	const exitCode = await captureForAgent(
		configure(gatedConfig(describesSignIn)),
		{
			client: browser.client,
			parentDirectory: parent,
			async runPreflight() {
				preflightRuns++;
				return readyVerdict;
			},
			emitMessage(message: string) {
				messages.push(message);
			},
			emitPayload(value: unknown) {
				payload = value as CapturePayload;
			},
		},
	);

	return {
		exitCode,
		parent,
		site,
		messages,
		payload,
		calls: browser.calls,
		closed: browser.closed(),
		preflightRuns,
		navigations: browser.calls
			.filter(call => call.name === 'navigate_page')
			.map(call => String(call.arguments['url'])),
	};
}

test('a configuration that describes a sign-in is signed in once, before any page is captured', async t => {
	const {site, navigations} = await captureAgainstLoginSite(t.teardown, {
		describesSignIn: true,
	});

	t.is(site.signInCount(), 1);
	t.is(
		navigations[0],
		`${origin}/login`,
		'the form is the first address the browser is sent to',
	);
	t.is(
		navigations.filter(url => url === `${origin}/login`).length,
		1,
		'one sign-in covers both pages',
	);

	// Both pages follow it, so neither was captured as a signed-out visitor.
	const afterSignIn = navigations.slice(1);
	t.true(afterSignIn.includes(`${origin}/dashboard`));
	t.true(afterSignIn.includes(`${origin}/settings`));
});

test('the run records that it signed in', async t => {
	const {parent, payload} = await captureAgainstLoginSite(t.teardown, {
		describesSignIn: true,
	});

	const session = await DelegationSession.loadById(payload!.run, {
		parentDirectory: parent,
	});

	// Read from the run directory because that is all `report` will have: the
	// command that writes the report never saw the browser sign in.
	const {provenance}: {provenance?: Partial<RunProvenance>} = session.manifest;
	t.true(provenance?.signedIn);
});

// The same startup guarantee `narrowBrowserTools` makes for the analysis: a
// server that cannot fill a field is found out before a browser is sent
// anywhere, not at the first step of the form.
test('a browser server that cannot fill a field stops a signed-in capture at startup', async t => {
	const {exitCode, messages, navigations, payload} =
		await captureAgainstLoginSite(t.teardown, {
			describesSignIn: true,
			withoutTools: ['fill'],
		});

	t.is(exitCode, 1);
	t.regex(messages.join(' '), /sign-in requires/);
	t.regex(messages.join(' '), /fill/);
	t.deepEqual(navigations, [], 'nothing is opened on a server that cannot run');
	t.is(payload, undefined, 'nothing may be printed when nothing was captured');
});

test('a configuration that describes no sign-in does not need the sign-in tools', async t => {
	const {exitCode, parent, site, navigations, payload} =
		await captureAgainstLoginSite(t.teardown, {
			describesSignIn: false,
			withoutTools: ['fill', 'click'],
		});

	t.is(exitCode, 0);
	t.deepEqual(
		payload!.pages.map(page => page.pageUrl),
		[`${origin}/dashboard`, `${origin}/settings`],
	);
	t.true(payload!.pages.every(page => page.captured));
	t.is(site.signInCount(), 0);
	t.deepEqual(navigations, [`${origin}/dashboard`, `${origin}/settings`]);

	const session = await DelegationSession.loadById(payload!.run, {
		parentDirectory: parent,
	});
	const {provenance}: {provenance?: Partial<RunProvenance>} = session.manifest;
	t.is(provenance?.signedIn, undefined);
});

// A failed sign-in (011, FR-009). Driven for real: the site accepts a password
// the configuration does not type, so the form answers with its own error and
// the signed-in sign never appears. Signing in then waits out its whole window
// for the sign, which is why these tests are given longer than the default.
//
// No agent comes back for a run that reviewed nothing, so this is the one case
// where `capture` writes the report itself rather than leaving it to `report`.
const rejectedReason = describeSignInFailure(
	{
		kind: 'sign-absent',
		shown: `"Sign in" at ${origin}/login?error=1 — alert: "Invalid email or password"`,
	},
	gatedConfig(true).signIn!,
);

/**
 * Run `capture` against a site that rejects the configured password, with the
 * report pointed at a file of its own.
 *
 * @param teardown - Ava's teardown registrar
 * @returns The command's result, and where its report would be
 */
async function captureRejectedSignIn(
	teardown: (fn: () => Promise<void>) => void,
) {
	// Apart from the run directories, so an empty parent still means no run.
	const output = path.join(await parentDirectory(teardown), 'report.md');
	const result = await captureAgainstLoginSite(teardown, {
		describesSignIn: true,
		sitePassword: 'the-real-one',
		configure: config => ({...config, report: {output}}),
	});

	return {...result, output};
}

test('a failed sign-in captures no page and leaves no run behind', async t => {
	t.timeout(30_000);

	const {parent, site, navigations, payload, closed} =
		await captureRejectedSignIn(t.teardown);

	t.is(site.signInCount(), 0);
	t.deepEqual(
		navigations.filter(url => url !== `${origin}/login`),
		[],
		'a page must not be captured signed out',
	);
	t.is(payload, undefined, 'nothing may be printed when nothing was captured');
	t.deepEqual(
		await fsPromises.readdir(parent),
		[],
		'there is no evidence for an agent to come back for',
	);
	t.true(closed > 0, 'the browser is released on this path too');
});

test('a failed sign-in writes the report itself, with the reason and no page reviewed', async t => {
	t.timeout(30_000);

	const {output} = await captureRejectedSignIn(t.teardown);

	await t.notThrowsAsync(
		fsPromises.stat(output),
		'the report is the only place the unreviewed pages are listed',
	);
	const report = await fsPromises.readFile(output, 'utf8');

	t.true(report.includes(rejectedReason));
	t.true(
		report.includes('**Signed in**: no — sign-in failed; no page was reviewed'),
	);
	t.true(report.includes(`${origin}/dashboard`));
	t.true(report.includes(`${origin}/settings`));
});

test('a failed sign-in exits 1 and says why', async t => {
	t.timeout(30_000);

	const {exitCode, messages} = await captureRejectedSignIn(t.teardown);

	t.is(exitCode, 1);
	t.deepEqual(messages, [`uxlint: sign-in failed — ${rejectedReason}`]);
	t.is(
		rejectedReason,
		`Sign-in steps completed but the signed-in sign "Sign out" did not appear. The page showed: "Sign in" at ${origin}/login?error=1 — alert: "Invalid email or password"`,
	);
});

// A missing secret (011, FR-010). Found out before anything is started, so an
// agent that was not given one is told at once and has spent nothing.
const neverSetSecret = 'UXLINT_TEST_SECRET_THAT_IS_NEVER_SET';

test('a sign-in naming a secret that is not set stops the command before anything is started', async t => {
	Reflect.deleteProperty(process.env, neverSetSecret);
	const output = path.join(await parentDirectory(t.teardown), 'report.md');

	const {exitCode, parent, messages, payload, calls, preflightRuns} =
		await captureAgainstLoginSite(t.teardown, {
			describesSignIn: true,
			configure: config => ({
				...config,
				report: {output},
				signIn: {
					...config.signIn!,
					steps: [
						{fill: 'Email', value: 'qa@example.com'},
						{fill: 'Password', secret: neverSetSecret},
						{click: 'Sign in'},
					],
				},
			}),
		});

	t.is(exitCode, 1);
	t.deepEqual(messages, [`uxlint: ${missingSecretText([neverSetSecret])}`]);
	t.is(
		messages[0],
		`uxlint: Sign-in needs ${neverSetSecret}, which is not set in the environment`,
	);
	t.is(preflightRuns, 0, 'no browser is probed for a run that cannot sign in');
	t.deepEqual(calls, [], 'the browser is asked for nothing');
	t.is(payload, undefined, 'nothing may be printed when nothing was captured');
	t.deepEqual(await fsPromises.readdir(parent), []);
	await t.throwsAsync(fsPromises.stat(output));
});
