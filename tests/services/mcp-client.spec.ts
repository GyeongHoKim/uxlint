import process from 'node:process';
import test from 'ava';
import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {
	browserServerIdentity,
	buildLaunchSpec,
	entryPointPath,
	narrowBrowserTools,
	redactingClient,
	requireSignInTools,
	resetMCPClient,
	resolveBrowserSettings,
	type BrowserLaunchSettings,
} from '../../source/services/mcp-client.js';
import type {PreflightVerdict} from '../../source/models/browser-preflight.js';
import {
	createRedactor,
	redactedMarker,
} from '../../source/models/secret-redaction.js';
import {mcpError, mcpResult} from '../fixtures/mcp-result.js';

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

// --- sign-in tools (011) ----------------------------------------------------

test('a browser server offering fill and click satisfies sign-in', t => {
	t.notThrows(() => {
		requireSignInTools({
			navigate_page: 'nav',
			take_snapshot: 'cap',
			fill: 'fill',
			click: 'click',
		});
	});
});

test('a browser server without fill fails before sign-in, naming it', t => {
	const error = t.throws(() => {
		requireSignInTools({
			navigate_page: 'nav',
			take_snapshot: 'cap',
			click: 'c',
		});
	});

	// Found at startup, not at the first step of signing in: by then the run
	// has opened the login page and has nothing it can do there.
	t.true(error?.message.includes('fill'), 'the message must name it');
	t.false(error?.message.includes('click'));
	t.regex(error?.message ?? '', /sign-in requires/);
});

test('both missing sign-in tools are named rather than only the first', t => {
	const error = t.throws(() => {
		requireSignInTools({navigate_page: 'nav', take_snapshot: 'cap'});
	});

	t.true(error?.message.includes('fill'));
	t.true(error?.message.includes('click'));
});

// --- a client whose results carry no secret (011) ---------------------------

const secret = 'correct-horse-battery-staple';

type ToolArguments = Record<string, unknown>;

/** A tool as the analysis calls it, reduced to the part these tests use. */
type CallableTool = {
	execute(args: ToolArguments, options: unknown): Promise<unknown>;
};

/**
 * A client that answers every call with the same text, and records what it
 * was asked. The text stands in for a page that prints what was typed into
 * it, which is how a secret gets into a result in the first place.
 */
function clientAnswering(text: string) {
	const received: Array<{via: string; name: string; args: ToolArguments}> = [];
	let closes = 0;

	const toolNamed = (name: string): CallableTool => ({
		async execute(args) {
			received.push({via: 'tools', name, args});
			return mcpResult(text);
		},
	});

	const client = {
		async tools() {
			return {
				take_snapshot: toolNamed('take_snapshot'),
				fill: toolNamed('fill'),
			};
		},
		async callTool(request: {name: string; arguments?: ToolArguments}) {
			received.push({
				via: 'callTool',
				name: request.name,
				args: request.arguments ?? {},
			});
			return mcpResult(text);
		},
		async close() {
			closes++;
		},
	} as unknown as MCPClient;

	return {client, received, closed: () => closes};
}

const wrapped = (client: MCPClient): MCPClient =>
	redactingClient(client, createRedactor([secret]));

const toolsOf = async (client: MCPClient) =>
	(await client.tools()) as unknown as Record<string, CallableTool>;

const executeOptions = {toolCallId: 'call-1', messages: []};

test('a direct tool call returns the marker in place of a secret', async t => {
	const {client} = clientAnswering(`StaticText "Your key: ${secret}"`);

	const result = await wrapped(client).callTool({
		name: 'take_snapshot',
		arguments: {},
	});

	t.false(JSON.stringify(result).includes(secret));
	t.deepEqual(result, mcpResult(`StaticText "Your key: ${redactedMarker}"`));
});

test('every tool the client hands out returns the marker in place of a secret', async t => {
	const {client} = clientAnswering(`StaticText "Your key: ${secret}"`);

	const tools = await toolsOf(wrapped(client));
	t.deepEqual(Object.keys(tools).sort(), ['fill', 'take_snapshot']);

	const results = await Promise.all(
		Object.values(tools).map(async tool => tool.execute({}, executeOptions)),
	);

	for (const result of results) {
		t.false(JSON.stringify(result).includes(secret));
		t.deepEqual(result, mcpResult(`StaticText "Your key: ${redactedMarker}"`));
	}
});

test('a failed result is redacted and stays a failure', async t => {
	const {client} = clientAnswering('unused');
	const failing = {
		...client,
		async callTool() {
			return mcpError(`Could not type "${secret}" into the element`);
		},
	} as unknown as MCPClient;

	const result = await wrapped(failing).callTool({name: 'fill', arguments: {}});

	t.deepEqual(
		result,
		mcpError(`Could not type "${redactedMarker}" into the element`),
	);
});

test('arguments reach the browser unchanged, a secret among them', async t => {
	// Sign-in has to type the secret. Redacting what goes in would type the
	// marker into the password field and fail every sign-in.
	const {client, received} = clientAnswering(
		'Successfully filled out the element',
	);
	const redacting = wrapped(client);
	const args = {uid: '1_4', value: secret};

	await redacting.callTool({name: 'fill', arguments: args});
	const tools = await toolsOf(redacting);
	await tools['fill']?.execute(args, executeOptions);

	t.deepEqual(received, [
		{via: 'callTool', name: 'fill', args: {uid: '1_4', value: secret}},
		{via: 'tools', name: 'fill', args: {uid: '1_4', value: secret}},
	]);
});

test('a result carrying no secret comes back with equal content', async t => {
	const text = 'uid=1_0 RootWebArea "Dashboard" url="https://app.example.com/"';
	const {client} = clientAnswering(text);
	const redacting = wrapped(client);

	const direct = await redacting.callTool({
		name: 'take_snapshot',
		arguments: {},
	});
	const tools = await toolsOf(redacting);
	const adapted = await tools['take_snapshot']?.execute({}, executeOptions);

	t.deepEqual(direct, mcpResult(text));
	t.deepEqual(adapted, mcpResult(text));
});

test('closing a redacting client closes the browser client behind it', async t => {
	const {client, closed} = clientAnswering(`key ${secret}`);
	const redacting = wrapped(client);

	// Asserted on a client that provably redacts, so that this is a statement
	// about the wrapper rather than about the client handed back untouched.
	const result = await redacting.callTool({
		name: 'take_snapshot',
		arguments: {},
	});
	t.false(JSON.stringify(result).includes(secret));

	await redacting.close();

	t.is(closed(), 1);
});

/** A client whose every call is rejected with a message quoting the secret. */
function clientRejecting(message: string): MCPClient {
	return {
		async tools() {
			return {
				fill: {
					async execute() {
						throw new Error(message);
					},
				},
			};
		},
		async callTool() {
			throw new Error(message);
		},
	} as unknown as MCPClient;
}

test('a rejected direct call is rejected without the secret in its message', async t => {
	const client = wrapped(clientRejecting(`could not type "${secret}"`));

	const error = await t.throwsAsync(
		client.callTool({name: 'fill', arguments: {}}),
	);

	t.is(error?.message, 'could not type "[redacted]"');
	t.false(
		JSON.stringify(error, Object.getOwnPropertyNames(error)).includes(secret),
	);
	t.is(error?.cause, undefined, 'the original must not ride along');
});

test('a rejected tool is rejected without the secret in its message', async t => {
	const tools = await toolsOf(
		wrapped(clientRejecting(`could not type "${secret}"`)),
	);

	const error = await t.throwsAsync(tools['fill']!.execute({}, executeOptions));

	t.is(error?.message, 'could not type "[redacted]"');
});

test('an image a tool returns is not rewritten, even where it spells a secret', async t => {
	// Base64 spells short words by accident. Replacing one would corrupt the
	// picture, and a picture's bytes are not text a secret can be read from.
	const image = {
		type: 'image',
		data: `AAAA${secret}BBBB`,
		mimeType: 'image/png',
	};
	const client = {
		async callTool() {
			return {
				content: [{type: 'text', text: `typed ${secret}`}, image],
				isError: false,
			};
		},
	} as unknown as MCPClient;

	const result = await wrapped(client).callTool({
		name: 'take_screenshot',
		arguments: {},
	});

	t.deepEqual(result, {
		content: [{type: 'text', text: 'typed [redacted]'}, image],
		isError: false,
	});
});
