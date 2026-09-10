/**
 * Installing the fake host agents on PATH for one test.
 *
 * The fakes live in `tests/fixtures/fake-hosts`. What this module adds is the
 * part a fixture cannot carry on its own: executables named exactly what the
 * adapters look for, put where `spawn` will find them, and removed when the
 * test ends. Everything the fakes report back travels through a trace file,
 * because the adapters discard a host's stdout on purpose.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import type {ExecutionContext} from 'ava';
import {hostAdapters} from '../../../source/delegate/host/index.js';
import type {DelegateHostId} from '../../../source/models/delegate.js';
import {
	fakeHostEnvironment,
	type FakeHostScript,
	type FakeHostTrace,
} from '../../fixtures/fake-hosts/contract.js';

/** The compiled fake, next to this file's compiled output. */
const fakeHostEntryPoint = fileURLToPath(
	new URL('../../fixtures/fake-hosts/main.js', import.meta.url),
);

/**
 * What one test wants installed.
 */
export type FakeHostsOptions = {
	/** Which agents appear on PATH */
	installed: DelegateHostId[];

	/** Whether `codex login status` reports a signed-in user; true by default */
	codexSignedIn?: boolean;

	/** What every installed agent does with the pages it is given */
	script?: FakeHostScript;

	/**
	 * The developer's Claude Code settings, when a test wants some. Written to
	 * the same private HOME.
	 */
	claudeSettings?: Record<string, unknown>;
};

/**
 * What a test gets back.
 */
export type InstalledFakeHosts = {
	/** Where the executables were written */
	binDirectory: string;

	/** Where a writable launch would leave its mark */
	canaryPath: string;

	/** What the fake recorded during the most recent launch */
	trace(): FakeHostTrace;
};

/**
 * Put fake host agents on PATH until the test ends.
 *
 * @param t - The test, for teardown
 * @param options - Which agents, and how they behave
 * @returns Where things went, and how to read the trace
 */
export function installFakeHosts(
	t: ExecutionContext,
	options: FakeHostsOptions,
): InstalledFakeHosts {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uxlint-fake-hosts-'));
	const binDirectory = path.join(root, 'bin');
	const home = path.join(root, 'home');
	const tracePath = path.join(root, 'trace.json');
	const canaryPath = path.join(root, 'canary');
	fs.mkdirSync(binDirectory);
	fs.mkdirSync(home);

	for (const id of options.installed) {
		const adapter = hostAdapters.find(candidate => candidate.id === id)!;
		const shim = path.join(binDirectory, adapter.binary);
		fs.writeFileSync(
			shim,
			`#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fakeHostEntryPoint)} ${id} "$@"\n`,
			{mode: 0o755},
		);
	}

	if (options.claudeSettings) {
		const claudeDirectory = path.join(home, '.claude');
		fs.mkdirSync(claudeDirectory);
		fs.writeFileSync(
			path.join(claudeDirectory, 'settings.json'),
			JSON.stringify(options.claudeSettings),
		);
	}

	const previous = new Map<string, string | undefined>();
	const set = (name: string, value: string) => {
		previous.set(name, process.env[name]);
		process.env[name] = value;
	};

	// PATH is replaced, not prefixed. The developer running this suite may
	// well have a real `claude` installed, and "installed" has to mean what
	// the test said.
	set('PATH', binDirectory);
	set('HOME', home);
	set(fakeHostEnvironment.trace, tracePath);
	set(fakeHostEnvironment.canary, canaryPath);
	set(
		fakeHostEnvironment.script,
		JSON.stringify(options.script ?? {default: {findings: 1, complete: true}}),
	);
	set(
		fakeHostEnvironment.codexSignedIn,
		options.codexSignedIn === false ? '0' : '1',
	);

	t.teardown(() => {
		for (const [name, value] of previous) {
			if (value === undefined) {
				Reflect.deleteProperty(process.env, name);
			} else {
				process.env[name] = value;
			}
		}

		fs.rmSync(root, {recursive: true, force: true});
	});

	return {
		binDirectory,
		canaryPath,
		trace() {
			return JSON.parse(fs.readFileSync(tracePath, 'utf8')) as FakeHostTrace;
		},
	};
}

/**
 * Quote a path for a POSIX shell.
 *
 * @param value - The path
 * @returns The path, single-quoted
 */
function quote(value: string): string {
	return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}
