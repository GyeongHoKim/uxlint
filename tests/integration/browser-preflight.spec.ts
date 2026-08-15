/**
 * The one test here that touches a real browser.
 *
 * Everything else injects a process runner and stays deterministic. This exists
 * because the properties preflight checks -- can a browser be found, can it
 * start, does the sandbox work here -- are exactly the ones that a mock cannot
 * confirm and that documentation gets wrong. It skips when no browser is
 * present, so it stays green on machines and CI images without one.
 */

import * as fs from 'node:fs';
import test from 'ava';
import type {PreflightVerdict} from '../../source/models/browser-preflight.js';
import {
	defaultChromePaths,
	runPreflight,
} from '../../source/services/browser-preflight.js';
import {
	getMCPClient,
	resetMCPClient,
} from '../../source/services/mcp-client.js';

const hasBrowser = defaultChromePaths().some(path => {
	try {
		fs.accessSync(path, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
});

const realProbe = hasBrowser ? test : test.skip;

realProbe('a real environment produces an actionable verdict', async t => {
	const verdict = await runPreflight(undefined);

	// Any of the three is a correct answer about a real machine. What must not
	// happen is a hang, a throw, or a verdict that cannot be rendered.
	t.true(
		['ready', 'ready-without-sandbox', 'unmet'].includes(verdict.kind),
		`unexpected verdict kind: ${verdict.kind}`,
	);

	if (verdict.kind !== 'unmet') {
		t.true(verdict.browser.majorVersion > 0);
		t.true(verdict.browser.version.length > 0);
	}
});

test('an absent browser is reported as absent rather than throwing', async t => {
	const verdict = await runPreflight({
		executablePath: '/nonexistent/definitely/not/a/browser',
	});

	t.is(verdict.kind, 'unmet');
	if (verdict.kind === 'unmet') {
		t.is(verdict.requirement.kind, 'browser-absent');
	}
});

test('the pinned server really starts and serves its tools over the transport', async t => {
	// No browser is required for this: the server connects and serves its full
	// tool list even where Chrome is absent, which is precisely why preflight
	// exists. That property makes this test runnable anywhere.
	const verdict: PreflightVerdict = {
		kind: 'ready',
		browser: {
			executablePath: '/opt/google/chrome/chrome',
			version: 'Google Chrome 151.0.0.0',
			majorVersion: 151,
		},
	};

	const client = await getMCPClient(verdict, undefined);

	try {
		const tools = await client.tools();
		const names = Object.keys(tools);

		// The two the analysis prompt names. If either disappears in a future
		// version bump, the prompt is asking for something that does not exist.
		t.true(names.includes('navigate_page'), 'navigate_page must exist');
		t.true(names.includes('take_snapshot'), 'take_snapshot must exist');

		// Needed by 007. Cheap to assert now, expensive to discover later.
		t.true(names.includes('lighthouse_audit'));
		t.true(names.includes('performance_start_trace'));
	} finally {
		await client.close();
		resetMCPClient();
	}
});
