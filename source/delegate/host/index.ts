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

/**
 * Every supported host agent.
 */
export const hostAdapters: readonly HostAgentAdapter[] = [claudeCode, codex];

/**
 * Why Cursor Agent has no launcher adapter.
 *
 * Not an omission. A live run against Cursor Agent 2026.09.02 established three
 * things, recorded in `specs/009-delegate-mode/research.md`: `agent -p` refuses
 * to start without workspace trust, so no launched run ever completed; Cursor
 * gives an MCP server child none of its own environment, so a per-run session
 * cannot reach the judgement server through the static registration file uxlint
 * declines to write; and no flag combination both submits findings and refuses
 * writes -- `--mode plan` blocks the tool calls, while `--trust` and
 * `--sandbox enabled` both let the agent write to an absolute path inside the
 * developer's repository, which `--workspace` does not prevent either.
 *
 * Keeping an adapter would mean `readOnlyPosture` asserting a guarantee that run
 * disproved. The identifier stays accepted so that a developer following the
 * older documentation gets this explanation instead of a parse error.
 */
const cursorAgentSignpost =
	'uxlint: cursor-agent cannot be launched as a read-only reviewer, so --delegate does not support it. Install the uxlint review skill into ~/.cursor/skills/uxlint-review/ and ask Cursor Agent to review the app instead — it then calls uxlint itself, which needs no trust and no server to hand it. See the README.';

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
		// Checked before the registry, because this host is deliberately absent
		// from it and the developer needs the route that works rather than the
		// news that this one does not exist.
		if (requested === 'cursor-agent') {
			return {kind: 'unavailable', message: cursorAgentSignpost};
		}

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
