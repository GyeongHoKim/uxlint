/**
 * Browser preflight
 *
 * Answers "can this environment run a browser at all" before the MCP
 * transport opens, so that the answer arrives while it is still cheap and
 * still legible. Two probes, cheapest first: the browser's version banner,
 * then a real headless launch.
 *
 * The second probe exists because the server discards the browser's own
 * diagnosis. Chrome says "Running as root without --no-sandbox is not
 * supported" or "Failed to move to new namespace ... Operation not
 * permitted"; by the time that reaches the MCP client it has become
 * "Protocol error (Target.setDiscoverTargets): Target closed", which is the
 * same string for two unrelated causes. Launching the browser ourselves is
 * the only way to keep the sentence that tells the user what to do.
 *
 * @packageDocumentation
 */

import {execFile} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import process from 'node:process';
import {promisify} from 'node:util';
import {logger} from '../infrastructure/logger.js';
import type {BrowserSettings} from '../models/browser.js';
import {
	classifyLaunchFailure,
	parseChromeMajorVersion,
	type PreflightVerdict,
} from '../models/browser-preflight.js';

const execFileAsync = promisify(execFile);

/**
 * Result of running a browser executable.
 */
export type ProbeResult = {
	/** Whether the process exited successfully */
	ok: boolean;

	/** Everything the process wrote to stdout */
	stdout: string;

	/** Everything the process wrote to stderr */
	stderr: string;
};

/**
 * Runs a browser executable.
 *
 * Injected so that every probe outcome -- including ones that need a
 * container to reproduce -- can be simulated in a unit test without spawning
 * anything.
 */
export type ProcessRunner = (
	executablePath: string,
	args: string[],
) => Promise<ProbeResult>;

/**
 * Reports whether a path exists and is executable.
 */
export type ExecutableProbe = (path: string) => boolean;

/**
 * Default locations the platform's Chrome installs into.
 *
 * Read from the pinned server's own browser resolution, so that uxlint looks
 * where the server will look. Diverging would let preflight pass on a browser
 * the server then fails to find.
 */
export function defaultChromePaths(
	platform: NodeJS.Platform = process.platform,
): string[] {
	if (platform === 'darwin') {
		return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
	}

	if (platform === 'win32') {
		// The server probes every one of these prefixes, so preflight has to
		// as well. Listing only the C: pair rejected a Windows user whose
		// Chrome sits on D: -- preflight blocking a run the server would have
		// completed is worse than no preflight at all.
		const suffix = String.raw`\Google\Chrome\Application\chrome.exe`;
		const prefixes = [
			process.env['PROGRAMFILES'],
			process.env['PROGRAMFILES(X86)'],
			String.raw`C:\Program Files`,
			String.raw`C:\Program Files (x86)`,
			String.raw`D:\Program Files`,
			String.raw`D:\Program Files (x86)`,
		].filter((prefix): prefix is string => prefix !== undefined);

		return [...new Set(prefixes.map(prefix => `${prefix}${suffix}`))];
	}

	return ['/opt/google/chrome/chrome'];
}

/**
 * Collaborators, all injectable so tests stay deterministic.
 */
export type PreflightDependencies = {
	runProcess: ProcessRunner;
	isExecutable: ExecutableProbe;
	platform: NodeJS.Platform;
};

const defaultDependencies: PreflightDependencies = {
	async runProcess(executablePath, args) {
		try {
			const {stdout, stderr} = await execFileAsync(executablePath, args, {
				timeout: 20_000,
			});
			return {ok: true, stdout, stderr};
		} catch (error) {
			const failure = error as {stdout?: string; stderr?: string};
			return {
				ok: false,
				stdout: failure.stdout ?? '',
				stderr: failure.stderr ?? String(error),
			};
		}
	},
	isExecutable(candidate) {
		try {
			fs.accessSync(candidate, fs.constants.X_OK);
			return true;
		} catch {
			return false;
		}
	},
	platform: process.platform,
};

/**
 * Create a throwaway Chrome profile directory for the launch probe.
 */
function makeTemporaryProfile(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-preflight-'));
}

/**
 * Remove the throwaway profile, ignoring failures.
 *
 * A profile left behind is untidy; a preflight that throws while cleaning up
 * would turn a healthy environment into a failed run, which is worse.
 */
function removeTemporaryProfile(directory: string): void {
	try {
		fs.rmSync(directory, {recursive: true, force: true});
	} catch {
		// Nothing to do: the temp directory is the OS's problem from here.
	}
}

/**
 * Check whether this environment can run a browser.
 *
 * @param settings - User browser settings; an executable path here is treated as deliberate
 * @param dependencies - Injectable collaborators
 * @returns A verdict the caller must act on before opening the transport
 */
export async function runPreflight(
	settings: BrowserSettings | undefined,
	dependencies: Partial<PreflightDependencies> = {},
): Promise<PreflightVerdict> {
	const {runProcess, isExecutable, platform} = {
		...defaultDependencies,
		...dependencies,
	};

	// A configured path is the only place searched. Falling back to a default
	// would analyse pages with a browser the user did not ask for, and say
	// nothing about having done so.
	const configuredPath = settings?.executablePath;
	const searchedPaths = configuredPath
		? [configuredPath]
		: defaultChromePaths(platform);

	const executablePath = searchedPaths.find(candidate =>
		isExecutable(candidate),
	);

	if (!executablePath) {
		logger.warn('Preflight: no browser found', {searchedPaths});
		return {
			kind: 'unmet',
			requirement: {
				kind: 'browser-absent',
				searchedPaths,
				...(configuredPath && {configuredPath}),
			},
		};
	}

	// Probe 1 -- presence and version. Measured at ~31ms. The version is read
	// for the report's provenance, not to gate on: see browser-preflight.ts
	// for why this project does not invent a floor.
	const versionProbe = await runProcess(executablePath, ['--version']);
	const banner = (versionProbe.stdout || versionProbe.stderr).trim();
	const majorVersion = parseChromeMajorVersion(banner);

	if (!versionProbe.ok || majorVersion === undefined) {
		return {
			kind: 'unmet',
			requirement: {
				kind: 'browser-unstartable',
				cause: banner || 'the browser did not report a version',
			},
		};
	}

	const browser = {executablePath, version: banner, majorVersion};

	// Probe 2 -- can the sandbox actually start here. Measured at 38-66ms when
	// it cannot and ~700ms when it can, so the environments that need the
	// fallback are the ones that answer fastest.
	//
	// The throwaway profile is not hygiene, it is correctness. Without
	// --user-data-dir the probe uses the developer's real Chrome profile, and
	// a Chrome already running on that profile makes the probe either fail on
	// the profile lock -- aborting a run on a perfectly healthy machine with
	// "a browser was found but would not start" -- or hand the command to the
	// running instance and exit 0 without launching anything, returning
	// `ready` while verifying nothing. The server passes --isolated for the
	// same reason.
	const profileDirectory = makeTemporaryProfile();
	let launchProbe: ProbeResult;
	try {
		launchProbe = await runProcess(executablePath, [
			'--headless',
			'--disable-gpu',
			`--user-data-dir=${profileDirectory}`,
			'--dump-dom',
			'about:blank',
		]);
	} finally {
		removeTemporaryProfile(profileDirectory);
	}

	if (launchProbe.ok) {
		return {kind: 'ready', browser};
	}

	const failure = classifyLaunchFailure(launchProbe.stderr);

	if (failure.kind === 'sandbox-unavailable') {
		logger.warn('Preflight: sandbox unavailable, relaxing it', {
			cause: failure.cause,
		});
		return {kind: 'ready-without-sandbox', browser, cause: failure.cause};
	}

	return {
		kind: 'unmet',
		requirement: {kind: 'browser-unstartable', cause: failure.cause},
	};
}
