import fs from 'node:fs/promises';
import {promises as fsPromises} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';
import {
	runDelegatedAnalysis,
	type DelegateDependencies,
} from '../../source/delegate/runner.js';
import type {UxLintConfig} from '../../source/models/config.js';
import {ReportBuilder} from '../../source/services/report-builder.js';
import {
	scriptedBrowser,
	simulatedLoginSite,
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
	options: {describesSignIn: boolean; withoutTools?: readonly string[]},
) {
	const {describesSignIn, withoutTools = []} = options;
	const directory = temporaryDirectory(t.teardown);
	const builder = new ReportBuilder(fsPromises);
	const site = simulatedLoginSite({origin, password});
	const browser = scriptedBrowser({...site.script, withoutTools});
	const messages: string[] = [];

	const exitCode = await runDelegatedAnalysis(
		gatedConfig(path.join(directory, 'report.md'), describesSignIn),
		{
			client: browser.client,
			builder,
			async runPreflight() {
				return readyVerdict;
			},
			emitVerdict(message: string) {
				messages.push(message);
			},
			adapter: scriptedHost([{complete: true}, {complete: true}]),
		},
	);

	return {
		exitCode,
		builder,
		site,
		messages,
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
