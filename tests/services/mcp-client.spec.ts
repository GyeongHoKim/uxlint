import process from 'node:process';
import test from 'ava';
import {
	browserServerIdentity,
	buildLaunchSpec,
	entryPointPath,
	narrowBrowserTools,
	resetMCPClient,
	resolveBrowserSettings,
	type BrowserLaunchSettings,
} from '../../source/services/mcp-client.js';
import type {PreflightVerdict} from '../../source/models/browser-preflight.js';

const ready: PreflightVerdict = {
	kind: 'ready',
	browser: {
		executablePath: '/opt/google/chrome/chrome',
		version: 'Google Chrome 151.0.7922.137',
		majorVersion: 151,
	},
};

const readyWithoutSandbox: PreflightVerdict = {
	kind: 'ready-without-sandbox',
	browser: {
		executablePath: '/opt/google/chrome/chrome',
		version: 'Google Chrome 151.0.7922.137',
		majorVersion: 151,
	},
	cause: 'Running as root without --no-sandbox is not supported.',
};

const defaults: BrowserLaunchSettings = {
	acceptInsecureCerts: true,
	allowExternalData: false,
};

test('the static argument vector matches the launch contract', t => {
	const spec = buildLaunchSpec(ready, defaults);

	t.true(spec.args.includes('--headless'));
	t.true(spec.args.includes('--isolated'));
	t.true(spec.args.includes('--no-performance-crux'));
	t.true(spec.args.includes('--no-usage-statistics'));
});

test('--slim is never passed, because it removes the audit tools 007 needs', t => {
	const spec = buildLaunchSpec(ready, defaults);

	t.false(spec.args.includes('--slim'));
});

test('no argument carries a floating version reference', t => {
	const spec = buildLaunchSpec(ready, defaults);

	for (const argument of spec.args) {
		t.false(
			argument.includes('@latest'),
			`${argument} pins to a moving target`,
		);
	}
});

test('the update check is disabled in the server environment', t => {
	const spec = buildLaunchSpec(ready, defaults);

	// Without this the server fetches registry.npmjs.org from a detached
	// child on startup, which breaks the offline guarantee from inside the
	// dependency rather than from our own code.
	t.is(spec.env['CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS'], '1');
});

test('the child stderr disposition is set explicitly', t => {
	const spec = buildLaunchSpec(ready, defaults);

	// The transport default is `inherit`, which writes the server's startup
	// banner into the Ink render and into a stream this project reserves.
	t.not(spec.stderr, undefined);
});

test('the server is spawned from the installed dependency, never through npx', t => {
	const spec = buildLaunchSpec(ready, defaults);

	t.not(spec.command, 'npx');
	t.true(spec.serverEntryPoint.endsWith('.js'));
	t.true(spec.args.includes(spec.serverEntryPoint));
});

test('the sandbox is left enabled when the verdict says it works', t => {
	const spec = buildLaunchSpec(ready, defaults);

	t.false(spec.args.some(argument => argument.includes('--no-sandbox')));
});

test('the sandbox is relaxed only when the verdict says it cannot start', t => {
	const spec = buildLaunchSpec(readyWithoutSandbox, defaults);

	t.true(spec.args.includes('--chromeArg=--no-sandbox'));
});

test('a configured executable path is passed through', t => {
	const spec = buildLaunchSpec(ready, {
		...defaults,
		executablePath: '/custom/chrome',
	});

	t.true(spec.args.includes('--executablePath'));
	t.true(spec.args.includes('/custom/chrome'));
});

test('no executable path is passed when the user configured none', t => {
	const spec = buildLaunchSpec(ready, defaults);

	t.false(spec.args.includes('--executablePath'));
});

test('TLS tolerance follows the setting, defaulting to today behaviour', t => {
	const tolerant = buildLaunchSpec(ready, defaults);
	const strict = buildLaunchSpec(ready, {
		...defaults,
		acceptInsecureCerts: false,
	});

	t.true(tolerant.args.includes('--acceptInsecureCerts'));
	t.false(strict.args.includes('--acceptInsecureCerts'));
});

test('opting in to external data drops both suppression flags', t => {
	const spec = buildLaunchSpec(ready, {...defaults, allowExternalData: true});

	t.false(spec.args.includes('--no-performance-crux'));
	t.false(spec.args.includes('--no-usage-statistics'));
});

test('absent browser settings resolve to the documented defaults', t => {
	const resolved = resolveBrowserSettings(undefined);

	t.true(
		resolved.acceptInsecureCerts,
		'TLS tolerance matches earlier releases',
	);
	t.false(resolved.allowExternalData, 'nothing leaves the machine unasked');
	t.is(resolved.executablePath, undefined);
});

test('explicit browser settings override the defaults', t => {
	const resolved = resolveBrowserSettings({
		acceptInsecureCerts: false,
		allowExternalData: true,
		executablePath: '/custom/chrome',
	});

	t.false(resolved.acceptInsecureCerts);
	t.true(resolved.allowExternalData);
	t.is(resolved.executablePath, '/custom/chrome');
});

test('a partially specified block keeps the defaults for what it omits', t => {
	const resolved = resolveBrowserSettings({allowExternalData: true});

	t.true(resolved.acceptInsecureCerts);
	t.true(resolved.allowExternalData);
});

test('the report records the version of the server that actually ran', t => {
	const identity = browserServerIdentity();

	t.is(identity.name, 'chrome-devtools-mcp');
	// Read from the installed package, so a dependency bump cannot leave
	// reports claiming a version that never ran.
	t.regex(identity.version, /^\d+\.\d+\.\d+/);
});

test('resetting the client cache is safe to call when nothing is cached', t => {
	t.notThrows(() => {
		resetMCPClient();
	});
});

test('an install path containing a space resolves to a loadable path', t => {
	// URL.pathname percent-encodes, so this used to yield `my%20projects` and
	// the server died at startup with a missing-module error that named
	// neither the space nor the real cause.
	const resolved = entryPointPath(
		'/home/user/my projects/app/node_modules/chrome-devtools-mcp/package.json',
		'build/src/bin/chrome-devtools-mcp.js',
	);

	t.false(resolved.includes('%20'));
	t.true(resolved.includes('my projects'));
});

test('a non-ASCII install path survives resolution', t => {
	const resolved = entryPointPath(
		'/home/사용자/앱/node_modules/chrome-devtools-mcp/package.json',
		'build/src/bin/chrome-devtools-mcp.js',
	);

	t.true(resolved.includes('사용자'));
	t.false(resolved.includes('%'));
});

test('the resolved entry point is the package bin, under the package root', t => {
	const resolved = entryPointPath(
		'/opt/app/node_modules/chrome-devtools-mcp/package.json',
		'build/src/bin/chrome-devtools-mcp.js',
	);

	t.is(
		resolved,
		'/opt/app/node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js',
	);
});

test('no model or cloud credential is forwarded to the browser subprocess', t => {
	const spec = buildLaunchSpec(ready, defaults);

	// Passing all of process.env would hand this project's credentials to a
	// third-party subprocess tree -- a strange thing to do in the feature
	// whose subject is what leaves the machine.
	for (const key of Object.keys(spec.env)) {
		t.notRegex(key, /api_key|token|secret|password/i, `${key} is forwarded`);
	}
});

test('the subprocess still gets what a browser needs to launch', t => {
	const spec = buildLaunchSpec(ready, defaults);

	t.is(spec.env['PATH'], process.env['PATH']);
	t.is(spec.env['CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS'], '1');
});

test('the server stderr is discarded rather than piped into a buffer nobody drains', t => {
	const spec = buildLaunchSpec(ready, defaults);

	// The transport never attaches a reader, so a pipe fills and the child
	// blocks on write once the OS buffer is full.
	t.is(spec.stderr, 'ignore');
});

test('the adapted tool set is narrowed to what the analysis uses', t => {
	const narrowed = narrowBrowserTools({
		navigate_page: 'nav',
		take_snapshot: 'cap',
		take_screenshot: 'unused',
		lighthouse_audit: 'unused',
		performance_start_trace: 'unused',
	});

	// Everything the server offers is re-sent, in full, on every request. A
	// tool merely left unmentioned in the prompt is still paid for.
	t.deepEqual(Object.keys(narrowed).sort(), ['navigate_page', 'take_snapshot']);
});

test('a browser server missing a required tool fails, naming it (SC-007)', t => {
	const error = t.throws(() => {
		narrowBrowserTools({navigate_page: 'nav', take_screenshot: 'unused'});
	});

	// The prompt tells the model to call this tool. Proceeding without it
	// produces a run that fails later for a reason pointing somewhere else.
	t.true(error?.message.includes('take_snapshot'), 'the message must name it');
});

test('both missing tools are named rather than only the first', t => {
	const error = t.throws(() => {
		narrowBrowserTools({take_screenshot: 'unused'});
	});

	t.true(error?.message.includes('navigate_page'));
	t.true(error?.message.includes('take_snapshot'));
});

test('narrowing happens before any provider request could be issued', t => {
	// SC-007 requires the failure to cost no model tokens. narrowBrowserTools
	// is pure and runs on the tool set, so it cannot reach a provider: this
	// asserts the shape that guarantees it rather than the timing.
	t.throws(() => {
		narrowBrowserTools({});
	});
	t.notThrows(() => {
		narrowBrowserTools({navigate_page: 'nav', take_snapshot: 'cap'});
	});
});
