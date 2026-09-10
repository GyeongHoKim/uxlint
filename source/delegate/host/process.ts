/**
 * Running a host agent
 *
 * Spawning is identical for all three adapters, so it lives here once. What
 * differs between them is the command line, and that is what each adapter
 * owns.
 *
 * @packageDocumentation
 */

import {spawn, spawnSync} from 'node:child_process';
import process from 'node:process';
import {logger} from '../../infrastructure/logger.js';
import type {HostAvailability, HostLaunch, HostOutcome} from './types.js';

/**
 * How much of a failing agent's stderr is kept for the error message.
 *
 * Enough to name a cause, short enough that a runaway agent cannot turn a
 * report into a wall of text.
 */
const stderrKeptBytes = 2000;

/**
 * How long an agent is given to exit after SIGTERM before it is killed outright.
 *
 * Enough for an agent to close its own MCP children; short enough that one
 * which handles the signal and carries on cannot hold the run open.
 */
const defaultKillGraceMs = 5000;

/**
 * Whether an executable is on PATH.
 *
 * Probed by asking it for its version rather than by searching PATH by hand,
 * which would have to reimplement PATHEXT resolution on Windows.
 *
 * @param binary - Executable to look for
 * @param hints - What to tell the developer when it is missing
 * @param hints.installHint - How to install it
 * @param hints.authHint - How to sign in, mentioned alongside the install hint
 * @returns Whether it can be used
 */
export function detectBinary(
	binary: string,
	hints: {installHint: string; authHint: string},
): HostAvailability {
	const probe = spawnSync(binary, ['--version'], {
		stdio: 'ignore',
		timeout: 10_000,
	});

	if (probe.error ?? probe.status !== 0) {
		return {
			kind: 'not-installed',
			message: `uxlint: ${binary} is not available on PATH. ${hints.installHint}`,
		};
	}

	return {kind: 'ready'};
}

/**
 * Whether a sign-in probe reports the agent as authenticated.
 *
 * Only some agents offer one. Where an agent does, using it is the difference
 * between "delegate mode produced nothing" and "you are not signed in", which
 * is the whole of FR-016.
 *
 * @param binary - Executable to ask
 * @param args - The subcommand that reports sign-in state
 * @returns Whether the probe reported success
 */
export function probeAuthenticated(binary: string, args: string[]): boolean {
	const probe = spawnSync(binary, args, {stdio: 'ignore', timeout: 15_000});
	return !probe.error && probe.status === 0;
}

/**
 * Start a host agent and wait for it.
 *
 * The prompt goes on stdin when the adapter asked for that, because at least
 * one agent's argument parser swallows a trailing positional. stdout and
 * stderr are captured rather than inherited: this process is rendering nothing,
 * and an agent's own progress output would land in the middle of a run that
 * has its own account to give.
 *
 * @param launch - What the adapter built
 * @param options - Execution controls
 * @param options.timeoutMs - How long the session may take before it is killed
 * @param options.cwd - Where to run it; the caller's directory by default
 * @param options.signal - Ends the session when aborted, as its bound would
 * @param options.killGraceMs - How long SIGTERM is given before SIGKILL
 * @returns How the session ended
 */
export async function runLaunch(
	launch: HostLaunch,
	options: {
		timeoutMs?: number;
		cwd?: string;
		signal?: AbortSignal;
		killGraceMs?: number;
	} = {},
): Promise<HostOutcome> {
	const {timeoutMs, cwd, signal, killGraceMs = defaultKillGraceMs} = options;

	return new Promise<HostOutcome>(resolve => {
		// The working directory is inherited in production -- a delegated run
		// judges the developer's own project. It is settable because at least one
		// host refuses to start depending on what the directory is, and that
		// refusal has to be exercisable.
		const child = spawn(launch.command, launch.args, {
			env: {...process.env, ...launch.env},
			stdio: ['pipe', 'pipe', 'pipe'],
			...(cwd !== undefined && {cwd}),
		});

		let stderr = '';
		let timedOut = false;

		const decoder = new TextDecoder();
		child.stderr?.on('data', (chunk: Uint8Array) => {
			stderr = (stderr + decoder.decode(chunk, {stream: true})).slice(
				-stderrKeptBytes,
			);
		});

		// Read and discard. An unread pipe fills, and the child then blocks on
		// write once the OS buffer is full -- the same deadlock this project
		// already documents for the browser server's stderr.
		child.stdout?.on('data', () => undefined);

		let escalation: NodeJS.Timeout | undefined;

		// SIGTERM first, so the agent can close its own children. SIGKILL after
		// a grace period, because an agent that handles SIGTERM and carries on
		// would otherwise hold the run open indefinitely. Its pipes go with it:
		// `close` waits for them, and a grandchild that inherited one would keep
		// the session open after the agent itself is gone.
		const terminate = () => {
			if (timedOut) {
				return;
			}

			timedOut = true;
			child.kill('SIGTERM');
			escalation = setTimeout(() => {
				child.kill('SIGKILL');
				child.stdout?.destroy();
				child.stderr?.destroy();
			}, killGraceMs);
		};

		const timer =
			timeoutMs === undefined ? undefined : setTimeout(terminate, timeoutMs);

		const settle = (outcome: HostOutcome) => {
			clearTimeout(timer);
			clearTimeout(escalation);
			signal?.removeEventListener('abort', terminate);

			logger.info('Host agent session ended', {
				command: launch.command,
				terminated: outcome.terminated,
				exitCode: outcome.exitCode,
			});

			resolve(outcome);
		};

		child.on('error', error => {
			settle({
				terminated: 'failed',
				stderrSummary: error instanceof Error ? error.message : String(error),
			});
		});

		child.on('close', code => {
			if (timedOut) {
				settle({
					terminated: 'timed-out',
					exitCode: code ?? undefined,
					stderrSummary: stderr,
				});
				return;
			}

			settle({
				terminated: code === 0 ? 'completed' : 'failed',
				exitCode: code ?? undefined,
				stderrSummary: code === 0 ? undefined : stderr,
			});
		});

		if (launch.stdin === undefined) {
			child.stdin?.end();
		} else {
			child.stdin?.end(launch.stdin);
		}

		// The run's own bound, when it expires, ends the session the same way
		// the timeout above would.
		if (signal?.aborted) {
			terminate();
		} else {
			signal?.addEventListener('abort', terminate, {once: true});
		}
	});
}
