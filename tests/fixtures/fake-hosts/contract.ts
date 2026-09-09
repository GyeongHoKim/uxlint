/**
 * What the fake host agents and the tests that launch them agree on.
 *
 * The fakes run in their own process, so nothing can be passed to them but an
 * environment, and nothing comes back but a file. This module names both
 * sides of that exchange once.
 */

import type {DelegateHostId} from '../../../source/models/delegate.js';

/**
 * Environment variables a fake host reads.
 */
export const fakeHostEnvironment = {
	/** Where the fake writes its trace when it exits */
	trace: 'UXLINT_FAKE_HOST_TRACE',

	/** Where a fake that was launched writable leaves its mark */
	canary: 'UXLINT_FAKE_HOST_CANARY',

	/** JSON of `FakeHostScript`: what to do with each page */
	script: 'UXLINT_FAKE_HOST_SCRIPT',

	/** `1` when `codex login status` should report a signed-in user */
	codexSignedIn: 'UXLINT_FAKE_CODEX_SIGNED_IN',
} as const;

/**
 * What a fake host does with one page.
 */
export type FakeHostPageScript = {
	/** How many findings to submit */
	findings?: number;

	/** Whether to record a measurement note */
	note?: boolean;

	/** Whether to mark the page finished */
	complete?: boolean;
};

/**
 * What a fake host does with the pages the judgement server lists.
 */
export type FakeHostScript = {
	/** Per page, in the order `listPages` returns them */
	pages?: FakeHostPageScript[];

	/** For any page without an entry above; left untouched when absent */
	default?: FakeHostPageScript;
};

/**
 * Everything a fake host observed during one launch.
 */
export type FakeHostTrace = {
	/** Which fake ran */
	host: DelegateHostId;

	/** The arguments it was started with, executable excluded */
	argv: string[];

	/** Where the prompt came from */
	promptSource: 'stdin' | 'argument' | 'none';

	/** The prompt text */
	prompt: string;

	/** The judgement server the fake resolved, and from where */
	server?: {
		command: string;
		args: string[];
		env: Record<string, string>;
		source: string;
	};

	/** Tool names the server advertised */
	tools: string[];

	/** Every tool call, in order */
	calls: Array<{name: string; arguments: unknown; isError: boolean}>;

	/** Tools the launch did not pre-approve, so the fake never called them */
	denied: string[];

	/**
	 * Anything on the server's stdout that was not JSON-RPC.
	 *
	 * The SDK client skips such a line and carries on, so a leak would pass
	 * unnoticed without this. Not every client is that forgiving.
	 */
	protocolErrors: string[];

	/** Why no tool was called at all, when the launch ran but judged nothing */
	skipped?: string;

	/** Whether the launch permitted writing, as the documented CLI reads it */
	wroteCanary: boolean;

	/** What the fake exited with */
	exitCode: number;

	/** Why it exited non-zero, when it did */
	failure?: string;
};
