/**
 * The host agents delegate mode can drive, and how one is chosen.
 *
 * A registry rather than a switch, so that the properties every adapter has to
 * satisfy -- a read-only posture, a session carried in the environment -- can
 * be asserted over all of them at once, and a new adapter cannot be added
 * without inheriting those assertions.
 *
 * @packageDocumentation
 */

import {delegateHostIds, isDelegateHostId} from '../../models/delegate.js';
import type {HostAgentAdapter} from './types.js';
import {claudeCode} from './claude-code.js';
import {codex} from './codex.js';
import {cursorAgent} from './cursor-agent.js';

/**
 * Every supported host agent.
 */
export const hostAdapters: readonly HostAgentAdapter[] = [
	claudeCode,
	codex,
	cursorAgent,
];

/**
 * The outcome of choosing a host agent.
 */
export type HostSelection =
	| {kind: 'selected'; adapter: HostAgentAdapter; message: string}
	| {kind: 'unavailable'; message: string};

/**
 * Choose which agent judges this run.
 *
 * Runs before a browser is started, so an unusable agent costs no capture
 * pass: an availability failure discovered afterwards has already spent a full
 * navigation and measurement sweep on nothing.
 *
 * When several are installed and none is named, this stops rather than picking
 * one. Which agent judges a review changes the review, and that is not a
 * decision to make on the developer's behalf.
 *
 * @param requested - The agent named on the command line, if any
 * @param adapters - The registry to choose from; injectable for tests
 * @returns The chosen adapter, or why none could be
 */
export async function selectHostAgent(
	requested: string | undefined,
	adapters: readonly HostAgentAdapter[] = hostAdapters,
): Promise<HostSelection> {
	if (requested !== undefined) {
		if (!isDelegateHostId(requested)) {
			return {
				kind: 'unavailable',
				message: `uxlint: ${requested} is not a supported host agent. Supported: ${delegateHostIds.join(', ')}.`,
			};
		}

		const named = adapters.find(adapter => adapter.id === requested);

		if (!named) {
			return {
				kind: 'unavailable',
				message: `uxlint: ${requested} is not a supported host agent. Supported: ${adapters.map(adapter => adapter.id).join(', ')}.`,
			};
		}

		const availability = await named.detect();

		return availability.kind === 'ready'
			? {
					kind: 'selected',
					adapter: named,
					message: `uxlint: delegating judgement to ${named.id}.`,
				}
			: {kind: 'unavailable', message: availability.message};
	}

	const checked = await Promise.all(
		adapters.map(async adapter => ({
			adapter,
			availability: await adapter.detect(),
		})),
	);

	const ready = checked.filter(item => item.availability.kind === 'ready');

	if (ready.length === 0) {
		return {
			kind: 'unavailable',
			message: `uxlint: no supported coding agent was found. Delegate mode needs one of ${adapters.map(adapter => adapter.id).join(', ')} installed and signed in. Install one, or drop --delegate to run with your own model credential.`,
		};
	}

	if (ready.length > 1) {
		return {
			kind: 'unavailable',
			message: `uxlint: several coding agents are available (${ready.map(item => item.adapter.id).join(', ')}). Choose one with --host-agent, because which agent judges a review changes the review.`,
		};
	}

	const [only] = ready;

	return {
		kind: 'selected',
		adapter: only!.adapter,
		message: `uxlint: delegating judgement to ${only!.adapter.id}.`,
	};
}
