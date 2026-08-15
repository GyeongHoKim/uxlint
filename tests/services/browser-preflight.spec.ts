import test from 'ava';
import {
	namespaceSandboxSignature,
	rootSandboxSignature,
} from '../../source/models/browser-preflight.js';
import {
	defaultChromePaths,
	runPreflight,
	type ProbeResult,
} from '../../source/services/browser-preflight.js';

const chromeVersion = 'Google Chrome 151.0.7922.137';

/**
 * Build a runner that answers the version probe and then the launch probe.
 *
 * Every environment below is reproduced without spawning anything, including
 * the two container cases that otherwise need Docker to observe.
 */
const runner = (launch: ProbeResult, version?: ProbeResult) => {
	let calls = 0;
	return async () => {
		calls++;
		if (calls === 1) {
			return version ?? {ok: true, stdout: chromeVersion, stderr: ''};
		}

		return launch;
	};
};

const always = (result: boolean) => () => result;

test('a browser that starts cleanly is ready with the sandbox enabled', async t => {
	const verdict = await runPreflight(undefined, {
		runProcess: runner({ok: true, stdout: '<html></html>', stderr: ''}),
		isExecutable: always(true),
		platform: 'linux',
	});

	t.is(verdict.kind, 'ready');
});

test('the root sandbox failure relaxes the sandbox rather than failing', async t => {
	const verdict = await runPreflight(undefined, {
		runProcess: runner({ok: false, stdout: '', stderr: rootSandboxSignature}),
		isExecutable: always(true),
		platform: 'linux',
	});

	t.is(verdict.kind, 'ready-without-sandbox');
	if (verdict.kind === 'ready-without-sandbox') {
		t.true(verdict.cause.includes('--no-sandbox'));
	}
});

test('a non-root container fails the same way and is handled the same way', async t => {
	// Measured in a real container: an ordinary user hits this, not just root.
	// Detecting the condition by checking for uid 0 would leave this case
	// broken with an opaque "Target closed" and no guidance.
	const verdict = await runPreflight(undefined, {
		runProcess: runner({
			ok: false,
			stdout: '',
			stderr: namespaceSandboxSignature,
		}),
		isExecutable: always(true),
		platform: 'linux',
	});

	t.is(verdict.kind, 'ready-without-sandbox');
});

test('an unrelated launch failure is unmet, never a silent sandbox relaxation', async t => {
	const verdict = await runPreflight(undefined, {
		runProcess: runner({
			ok: false,
			stdout: '',
			stderr: 'error while loading shared libraries: libnss3.so',
		}),
		isExecutable: always(true),
		platform: 'linux',
	});

	t.is(verdict.kind, 'unmet');
	if (verdict.kind === 'unmet') {
		t.is(verdict.requirement.kind, 'browser-unstartable');
	}
});

test('no browser anywhere is reported as absent with the paths searched', async t => {
	const verdict = await runPreflight(undefined, {
		runProcess: runner({ok: true, stdout: '', stderr: ''}),
		isExecutable: always(false),
		platform: 'linux',
	});

	t.is(verdict.kind, 'unmet');
	if (
		verdict.kind === 'unmet' &&
		verdict.requirement.kind === 'browser-absent'
	) {
		t.true(verdict.requirement.searchedPaths.length > 0);
	} else {
		t.fail('expected a browser-absent requirement');
	}
});

test('a configured path is the only place searched', async t => {
	const verdict = await runPreflight(
		{executablePath: '/custom/chrome'},
		{
			runProcess: runner({ok: true, stdout: '', stderr: ''}),
			isExecutable: always(false),
			platform: 'linux',
		},
	);

	// Falling back to a default would analyse pages with a browser the user
	// did not ask for, and say nothing about having done so.
	if (
		verdict.kind === 'unmet' &&
		verdict.requirement.kind === 'browser-absent'
	) {
		t.deepEqual(verdict.requirement.searchedPaths, ['/custom/chrome']);
		t.is(verdict.requirement.configuredPath, '/custom/chrome');
	} else {
		t.fail('expected a browser-absent requirement');
	}
});

test('a browser below the version floor is rejected with both versions', async t => {
	const verdict = await runPreflight(undefined, {
		runProcess: runner(
			{ok: true, stdout: '', stderr: ''},
			{ok: true, stdout: 'Google Chrome 120.0.0.1', stderr: ''},
		),
		isExecutable: always(true),
		platform: 'linux',
	});

	if (
		verdict.kind === 'unmet' &&
		verdict.requirement.kind === 'browser-too-old'
	) {
		t.is(verdict.requirement.detectedMajorVersion, 120);
		t.true(verdict.requirement.requiredMajorVersion > 120);
	} else {
		t.fail('expected a browser-too-old requirement');
	}
});

test('a browser that reports no version is unstartable rather than too old', async t => {
	const verdict = await runPreflight(undefined, {
		runProcess: runner(
			{ok: true, stdout: '', stderr: ''},
			{ok: false, stdout: '', stderr: 'Segmentation fault'},
		),
		isExecutable: always(true),
		platform: 'linux',
	});

	if (verdict.kind === 'unmet') {
		t.is(verdict.requirement.kind, 'browser-unstartable');
	} else {
		t.fail('expected an unmet verdict');
	}
});

test('the launch probe runs without a sandbox flag, so it measures the real thing', async t => {
	const seen: string[][] = [];

	await runPreflight(undefined, {
		async runProcess(_executablePath, args) {
			seen.push(args);
			return {ok: true, stdout: chromeVersion, stderr: ''};
		},
		isExecutable: always(true),
		platform: 'linux',
	});

	const launchArgs = seen[1] ?? [];
	t.false(launchArgs.includes('--no-sandbox'));
	t.true(launchArgs.includes('--headless'));
});

test('each platform searches the location its Chrome actually installs into', t => {
	// Read from the pinned server's own resolution so preflight looks where
	// the server will look; diverging would let preflight pass on a browser
	// the server then fails to find.
	t.deepEqual(defaultChromePaths('linux'), ['/opt/google/chrome/chrome']);
	t.deepEqual(defaultChromePaths('darwin'), [
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	]);

	const windows = defaultChromePaths('win32');
	t.true(
		windows.length >= 4,
		'both Program Files variants on both drives are searched',
	);
	t.true(windows.every(candidate => candidate.endsWith('chrome.exe')));
});

test('an unlisted platform falls back to the Linux location rather than searching nothing', t => {
	t.deepEqual(defaultChromePaths('freebsd'), ['/opt/google/chrome/chrome']);
});

test('the real process runner reports a failure instead of throwing', async t => {
	// Exercises the default runner rather than an injected one: a spawn that
	// fails must come back as a probe result, because preflight's whole
	// purpose is to answer rather than to raise.
	const verdict = await runPreflight({
		executablePath: '/nonexistent/chrome-that-is-not-there',
	});

	t.is(verdict.kind, 'unmet');
});

test('the launch probe uses a throwaway profile, never the user real one', async t => {
	const seen: string[][] = [];

	await runPreflight(undefined, {
		async runProcess(_executablePath, args) {
			seen.push(args);
			return {ok: true, stdout: chromeVersion, stderr: ''};
		},
		isExecutable: always(true),
		platform: 'linux',
	});

	// Without this, a developer with Chrome already open either fails the
	// probe on the profile lock -- aborting a run on a healthy machine -- or
	// has the command handed to the running instance, which exits 0 without
	// launching anything and returns `ready` having verified nothing.
	const launchArgs = seen[1] ?? [];
	t.true(
		launchArgs.some(argument => argument.startsWith('--user-data-dir=')),
		'the probe must isolate itself from the real profile',
	);
});

test('windows searches every prefix the server searches, including other drives', t => {
	const paths = defaultChromePaths('win32');

	// Listing only the C: pair rejected a Windows user whose Chrome sits on
	// D:, blocking a run the server would have completed.
	t.true(paths.some(path => path.startsWith('D:')));
	t.true(paths.every(path => path.endsWith('chrome.exe')));
});
