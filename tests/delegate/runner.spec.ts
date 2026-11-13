import fs from 'node:fs/promises';
import {promises as fsPromises} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';
import {
	runDelegatedAnalysis,
	type DelegateDependencies,
} from '../../source/delegate/runner.js';
import type {HostLaunch} from '../../source/delegate/host/types.js';
import type {UxLintConfig} from '../../source/models/config.js';
import {
	describeSignInFailure,
	missingSecretText,
} from '../../source/models/sign-in.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import {
	scriptedBrowser,
	simulatedLoginSite,
	type SimulatedSite,
} from '../fixtures/sign-in-browser.js';
import {
	configFor,
	fakeBrowser,
	readyVerdict,
	scriptedHost,
	temporaryDirectory,
} from './helpers.js';

/**
 * Run a delegated analysis, holding the builder so the report can be read back
 * the way `ci-runner` does rather than by parsing the rendered markdown.
 */
async function runAndRead(
	t: {teardown: (fn: () => void) => void},
	options: Partial<DelegateDependencies> &
		Pick<DelegateDependencies, 'adapter'> & {pages?: number},
) {
	const {pages = 1, ...dependencies} = options;
	const directory = temporaryDirectory(t.teardown);
	const output = path.join(directory, 'report.md');
	const builder = new ReportBuilder(fsPromises);
	const config = configFor(pages, output);

	const exitCode = await runDelegatedAnalysis(config, {
		client: fakeBrowser(),
		builder,
		async runPreflight() {
			return readyVerdict;
		},
		emitVerdict() {
			// Nothing is printed during a test.
		},
		...dependencies,
	});

	return {exitCode, report: builder.generateFinalReport(), output};
}

test.serial('a report is written with no model credential present', async t => {
	const previous = process.env['UXLINT_AI_API_KEY'];
	delete process.env['UXLINT_AI_API_KEY'];
	t.teardown(() => {
		if (previous !== undefined) {
			process.env['UXLINT_AI_API_KEY'] = previous;
		}
	});

	const {exitCode, report, output} = await runAndRead(t, {
		adapter: scriptedHost([{findings: 2, note: true, complete: true}]),
	});

	t.is(exitCode, 0);
	await t.notThrowsAsync(fs.stat(output));
	t.true(
		report.prioritizedFindings.some(finding => finding.origin === 'judgement'),
		'the host agent judgement reached the report',
	);
	t.true(
		report.prioritizedFindings.some(finding => finding.origin === 'audit'),
		'the measured findings reached the report',
	);
});

test('a judgement finding is attributed to the page it was submitted against', async t => {
	const {report} = await runAndRead(t, {
		pages: 2,
		adapter: scriptedHost([
			{findings: 1, complete: true},
			{findings: 3, complete: true},
		]),
	});

	const judged = report.prioritizedFindings.filter(
		finding => finding.origin === 'judgement',
	);

	t.is(
		judged.filter(finding => finding.pageUrl === 'https://example.com/page-1')
			.length,
		1,
	);
	t.is(
		judged.filter(finding => finding.pageUrl === 'https://example.com/page-2')
			.length,
		3,
	);
});

test('every page is captured and measured before the host agent is launched', async t => {
	const order: string[] = [];

	await runAndRead(t, {
		pages: 2,
		onPageCaptured(pageUrl: string) {
			order.push(`captured:${pageUrl}`);
		},
		adapter: scriptedHost([{complete: true}, {complete: true}], {
			onLaunch() {
				order.push('launched');
			},
		}),
	});

	t.deepEqual(order, [
		'captured:https://example.com/page-1',
		'captured:https://example.com/page-2',
		'launched',
	]);
});

test('the report records which host agent produced the judgement', async t => {
	const {report} = await runAndRead(t, {
		adapter: scriptedHost([{complete: true}]),
	});

	t.is(report.metadata.tooling.hostAgent, 'claude-code');
	t.is(report.metadata.tooling.browserServer, 'chrome-devtools-mcp');
});

test('a page the host agent judged clean is complete rather than partial', async t => {
	const {report} = await runAndRead(t, {
		adapter: scriptedHost([{complete: true}]),
	});

	t.deepEqual(report.metadata.analyzedPages, ['https://example.com/page-1']);
	t.deepEqual(report.metadata.partialPages, []);
});

test('the measurement note the host agent recorded reaches the page', async t => {
	const {report} = await runAndRead(t, {
		adapter: scriptedHost([{note: true, complete: true}]),
	});

	t.regex(report.pages[0]!.measurementNote!, /what the measurements mean/i);
});

// FR-016 and the preflight edge case: a browser that cannot run must stop the
// run before a host agent is launched, and must say so the way the existing
// modes say it.
test('a failing preflight stops the run before any host agent is launched', async t => {
	const directory = temporaryDirectory(t.teardown);
	const config = configFor(1, path.join(directory, 'report.md'));
	const messages: string[] = [];
	let launched = false;

	const exitCode = await runDelegatedAnalysis(config, {
		client: fakeBrowser(),
		async runPreflight() {
			return {
				kind: 'unmet',
				requirement: {
					kind: 'browser-absent',
					searchedPaths: ['/opt/google/chrome'],
				},
			};
		},
		emitVerdict(message: string) {
			messages.push(message);
		},
		adapter: scriptedHost([{complete: true}], {
			onLaunch() {
				launched = true;
			},
		}),
	});

	t.is(exitCode, 1);
	t.false(launched, 'a capture pass must not be spent on an unusable browser');
	t.true(messages.join(' ').length > 0);
	await t.throwsAsync(fs.stat(path.join(directory, 'report.md')));
});

test('a host agent that cannot run stops the analysis before a browser opens', async t => {
	const directory = temporaryDirectory(t.teardown);
	const config = configFor(1, path.join(directory, 'report.md'));
	const messages: string[] = [];
	let preflightRan = false;

	const exitCode = await runDelegatedAnalysis(config, {
		client: fakeBrowser(),
		async runPreflight() {
			preflightRan = true;
			return readyVerdict;
		},
		emitVerdict(message: string) {
			messages.push(message);
		},
		adapter: {
			...scriptedHost([]),
			async detect() {
				return {
					kind: 'not-authenticated',
					message: 'Run `claude login` first.',
				};
			},
		},
	});

	t.is(exitCode, 1);
	t.false(preflightRan, 'availability is settled before a browser is started');
	t.regex(messages.join(' '), /login/);
});

// Signing in (011). The browser is the scripted login site rather than
// `fakeBrowser`, because what is being asserted is the order of the calls the
// run made and whether the site let it in. That client answers the measurement
// tools with an error, so every page here is captured and left unmeasured.
const origin = 'https://app.example.com';
const password = 'correct-horse-battery';

/**
 * A configuration over two pages behind the login site's form.
 *
 * Literal values only, so no environment variable has to exist for the
 * description to be usable.
 *
 * @param output - Where the report is written
 * @param describesSignIn - Whether the configuration carries a `signIn` block
 * @returns The configuration
 */
function gatedConfig(output: string, describesSignIn: boolean): UxLintConfig {
	const urls = [`${origin}/dashboard`, `${origin}/settings`];

	return {
		mainPageUrl: urls[0]!,
		subPageUrls: urls.slice(1),
		pages: urls.map((url, index) => ({
			url,
			features: `Features of page ${index + 1}`,
		})),
		persona: 'A first-time visitor on a phone',
		report: {output},
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
 * Run a delegated analysis against the login site, keeping what the browser
 * was asked so the order of it can be read back.
 */
async function runAgainstLoginSite(
	t: {teardown: (fn: () => void) => void},
	options: {
		describesSignIn: boolean;
		withoutTools?: readonly string[];
		/** What the site's form accepts, when it is not what the configuration types */
		sitePassword?: string;
		/** A last change to the configuration before the run */
		configure?: (config: UxLintConfig) => UxLintConfig;
		/** Runs before the site answers a navigation; throwing rejects the call */
		onNavigate?: (url: string, site: SimulatedSite) => void;
		/** What the host agent's session rejects with, when it does not run */
		hostFailure?: Error;
	},
) {
	const {
		describesSignIn,
		withoutTools = [],
		sitePassword = password,
		configure = (config: UxLintConfig) => config,
		onNavigate,
		hostFailure,
	} = options;
	const directory = temporaryDirectory(t.teardown);
	const output = path.join(directory, 'report.md');
	const builder = new ReportBuilder(fsPromises);
	const site = simulatedLoginSite({origin, password: sitePassword});
	const browser = scriptedBrowser({
		...site.script,
		withoutTools,
		onNavigate(url) {
			onNavigate?.(url, site);
			return site.script.onNavigate?.(url);
		},
	});
	const messages: string[] = [];
	const host = scriptedHost([{complete: true}, {complete: true}]);
	let preflightRuns = 0;
	let launches = 0;
	const launched: HostLaunch[] = [];

	const exitCode = await runDelegatedAnalysis(
		configure(gatedConfig(output, describesSignIn)),
		{
			client: browser.client,
			builder,
			async runPreflight() {
				preflightRuns++;
				return readyVerdict;
			},
			emitVerdict(message: string) {
				messages.push(message);
			},
			// Counted at both ends: a launch that was built is a host agent the
			// run meant to start, whether or not it got as far as running it.
			adapter: {
				...host,
				buildLaunch(context) {
					launches++;
					return host.buildLaunch(context);
				},
				async run(launch, runOptions) {
					launches++;
					launched.push(launch);
					if (hostFailure) {
						throw hostFailure;
					}

					return host.run(launch, runOptions);
				},
			},
		},
	);

	return {
		exitCode,
		builder,
		output,
		site,
		messages,
		calls: browser.calls,
		closed: browser.closed(),
		preflightRuns,
		launches,
		launched,
		navigations: browser.calls
			.filter(call => call.name === 'navigate_page')
			.map(call => String(call.arguments['url'])),
	};
}

test('a run whose configuration describes a sign-in signs in once, before any page is captured', async t => {
	const {site, navigations} = await runAgainstLoginSite(t, {
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

test('the report records that the run signed in', async t => {
	const {builder} = await runAgainstLoginSite(t, {describesSignIn: true});

	t.true(builder.generateFinalReport().metadata.tooling.signedIn);
});

// The same startup guarantee `narrowBrowserTools` makes for the analysis: a
// server that cannot fill a field is found out before a browser is sent
// anywhere, not at the first step of the form.
test('a browser server that cannot fill a field stops a signed-in run at startup', async t => {
	const {exitCode, messages, navigations} = await runAgainstLoginSite(t, {
		describesSignIn: true,
		withoutTools: ['fill'],
	});

	t.is(exitCode, 1);
	t.regex(messages.join(' '), /sign-in requires/);
	t.regex(messages.join(' '), /fill/);
	t.deepEqual(navigations, [], 'nothing is opened on a server that cannot run');
});

test('a run that describes no sign-in does not need the sign-in tools', async t => {
	const {exitCode, builder, site, navigations} = await runAgainstLoginSite(t, {
		describesSignIn: false,
		withoutTools: ['fill', 'click'],
	});
	const report = builder.generateFinalReport();

	t.is(exitCode, 0);
	t.deepEqual(report.metadata.analyzedPages, [
		`${origin}/dashboard`,
		`${origin}/settings`,
	]);
	t.is(report.metadata.tooling.signedIn, undefined);
	t.is(site.signInCount(), 0);
	t.deepEqual(navigations, [`${origin}/dashboard`, `${origin}/settings`]);
});

// A failed sign-in (011, FR-009). Driven for real: the site accepts a password
// the configuration does not type, so the form answers with its own error and
// the signed-in sign never appears. Signing in then waits out its whole window
// for the sign, which is why these tests are given longer than the default.
const rejectedReason = describeSignInFailure(
	{
		kind: 'sign-absent',
		shown: `"Sign in" at ${origin}/login?error=1 — alert: "Invalid email or password"`,
	},
	gatedConfig('report.md', true).signIn!,
);

test('a failed sign-in captures no page and launches no host agent', async t => {
	t.timeout(30_000);

	const {site, navigations, launches, closed} = await runAgainstLoginSite(t, {
		describesSignIn: true,
		sitePassword: 'the-real-one',
	});

	t.is(site.signInCount(), 0);
	t.deepEqual(
		navigations.filter(url => url !== `${origin}/login`),
		[],
		'a page must not be captured signed out',
	);
	t.is(launches, 0, 'a host agent has nothing to judge');
	t.true(closed > 0, 'the browser is released on this path too');
});

test('a failed sign-in still writes a report, with every page failed for that reason', async t => {
	t.timeout(30_000);

	const {builder, output} = await runAgainstLoginSite(t, {
		describesSignIn: true,
		sitePassword: 'the-real-one',
	});
	const report = builder.generateFinalReport();

	await t.notThrowsAsync(
		fs.stat(output),
		'the report is the only place the unreviewed pages are listed',
	);
	t.deepEqual(report.metadata.failedPages, [
		`${origin}/dashboard`,
		`${origin}/settings`,
	]);
	t.deepEqual(report.metadata.analyzedPages, []);
	t.deepEqual(
		report.pages.map(page => page.error),
		[rejectedReason, rejectedReason],
	);
	// False rather than absent: a sign-in was described, attempted, and failed.
	t.false(report.metadata.tooling.signedIn);
	t.is(report.metadata.tooling.browserServer, 'chrome-devtools-mcp');
});

// Written for both because the gate must not be what decides it: a failed
// sign-in fails a run that never configured a threshold, and a configured one
// must not turn the message into a verdict about findings.
for (const [label, thresholds] of [
	['with no thresholds configured', undefined],
	['with thresholds configured', {maxCritical: 10}],
] as const) {
	test(`a failed sign-in exits 1 and says why ${label}`, async t => {
		t.timeout(30_000);

		const {exitCode, messages} = await runAgainstLoginSite(t, {
			describesSignIn: true,
			sitePassword: 'the-real-one',
			configure: config => ({...config, ...(thresholds && {thresholds})}),
		});

		t.is(exitCode, 1);
		t.true(
			messages.includes(`uxlint: sign-in failed — ${rejectedReason}`),
			'the message names the sign-in, not a failed analysis',
		);
		t.is(
			rejectedReason,
			`Sign-in steps completed but the signed-in sign "Sign out" did not appear. The page showed: "Sign in" at ${origin}/login?error=1 — alert: "Invalid email or password"`,
		);
		t.false(messages.some(message => message.includes('analysis failed')));
	});
}

// A missing secret (011, FR-010). Found out before anything is started, so a
// developer who forgot to set one is told at once and has spent nothing.
const neverSetSecret = 'UXLINT_TEST_SECRET_THAT_IS_NEVER_SET';

test('a sign-in naming a secret that is not set stops the run before anything is started', async t => {
	Reflect.deleteProperty(process.env, neverSetSecret);

	const {exitCode, messages, output, calls, preflightRuns, launches} =
		await runAgainstLoginSite(t, {
			describesSignIn: true,
			configure: config => ({
				...config,
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
	t.is(launches, 0);
	await t.throwsAsync(fs.stat(output));
});

// Releasing the browser (011, FR-022). The signed-in session lives only in the
// browser's throwaway profile, which is discarded when the browser closes, so
// a run that describes a sign-in must close it exactly once however it ends:
// not at all leaves a signed-in browser behind, and twice closes a client that
// is already torn down.
const settingsUrl = `${origin}/settings`;

// The session ends once the first page has been captured, and the password the
// configuration types has stopped working, so signing in again fails and the
// second page is refused. Both waits for the sign run their whole window, which
// is why that ending is given longer than the others.
const sessionLostAtSettings = (url: string, site: SimulatedSite) => {
	if (url !== settingsUrl) {
		return;
	}

	site.expire();
	site.setPassword('changed-since-the-run-began');
};

// Signing in swallows a browser call that rejects and reads it as a failed
// step; the capture pass does not, so this ends the run after it signed in.
const rejectingAtSettings = (url: string) => {
	if (url === settingsUrl) {
		throw new Error('browser transport died mid-run');
	}
};

for (const [label, ending, expected] of [
	['a completed signed-in run', {}, {exitCode: 0, signIns: 1, launches: 2}],
	[
		'a failed sign-in',
		{sitePassword: 'the-real-one'},
		{exitCode: 1, signIns: 0, launches: 0},
	],
	[
		'a signed-in run with a page refused part-way through',
		{onNavigate: sessionLostAtSettings},
		{exitCode: 0, signIns: 1, launches: 2},
	],
	[
		'a browser call that rejects after signing in',
		{onNavigate: rejectingAtSettings},
		{exitCode: 1, signIns: 1, launches: 0},
	],
	[
		'a host agent that fails after signing in',
		{hostFailure: new Error('the host agent could not be started')},
		{exitCode: 1, signIns: 1, launches: 2},
	],
] as const) {
	test(`${label} closes the browser exactly once`, async t => {
		t.timeout(60_000);

		const {exitCode, site, launches, navigations, closed} =
			await runAgainstLoginSite(t, {describesSignIn: true, ...ending});

		// What shows the ending under test is the one that was reached.
		t.is(exitCode, expected.exitCode);
		t.is(site.signInCount(), expected.signIns);
		t.is(launches, expected.launches);
		t.is(
			navigations.includes(settingsUrl),
			expected.signIns === 1,
			'only a run that signed in gets as far as its second page',
		);
		t.is(closed, 1, 'the signed-in browser is released once, not twice');
	});
}

test('a page refused part-way through is failed in a report the run still writes', async t => {
	t.timeout(60_000);

	const {builder, output, closed} = await runAgainstLoginSite(t, {
		describesSignIn: true,
		onNavigate: sessionLostAtSettings,
	});
	const {metadata} = builder.generateFinalReport();

	await t.notThrowsAsync(fs.stat(output));
	t.deepEqual(metadata.analyzedPages, [`${origin}/dashboard`]);
	t.deepEqual(metadata.failedPages, [settingsUrl]);
	t.is(closed, 1);
});

// The password is in this process's environment, which a host agent would
// otherwise inherit whole.
test('the host agent is launched without the secrets the sign-in names', async t => {
	t.timeout(30_000);
	process.env['UXLINT_TEST_QA_PASSWORD'] = password;
	t.teardown(() => {
		Reflect.deleteProperty(process.env, 'UXLINT_TEST_QA_PASSWORD');
	});

	const {exitCode, launched} = await runAgainstLoginSite(t, {
		describesSignIn: true,
		configure: config => ({
			...config,
			signIn: {
				...config.signIn!,
				steps: [
					{fill: 'Email', value: 'qa@example.com'},
					{fill: 'Password', secret: 'UXLINT_TEST_QA_PASSWORD'},
					{click: 'Sign in'},
				],
			},
		}),
	});

	t.is(exitCode, 0);
	t.deepEqual(
		launched.map(launch => launch.withheldEnvironment),
		[['UXLINT_TEST_QA_PASSWORD']],
	);
});

test('a browser server that cannot sign a run in is still released', async t => {
	const {exitCode, closed} = await runAgainstLoginSite(t, {
		describesSignIn: true,
		withoutTools: ['fill'],
	});

	t.is(exitCode, 1);
	t.is(closed, 1);
});
