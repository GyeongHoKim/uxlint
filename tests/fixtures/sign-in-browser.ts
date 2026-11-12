/**
 * A browser client that answers from a script, for sign-in tests.
 *
 * Replies are in the shapes the real browser server produced in the live run
 * recorded in `specs/011-authenticated-pages/research.md` (R1), so a test
 * written against this fake is written against what the server actually says:
 * the capture's header line, the root carrying the reached address, a field's
 * accessible name with its stray trailing space, and the exact success
 * sentences of `fill` and `click`.
 *
 * Lives outside the spec files because more than one of them needs it.
 */

import type {experimental_MCPClient as MCPClient} from '@ai-sdk/mcp';
import {tool} from 'ai';
import {z} from 'zod';
import {mcpError, mcpResult} from './mcp-result.js';

type ToolReply = ReturnType<typeof mcpResult>;

/** One call the fake received, in order. */
export type RecordedCall = {
	name: string;
	arguments: Record<string, unknown>;
};

/** What a script decides. Anything left out gets the server's usual success. */
export type BrowserScript = {
	/** The structure of the page currently open */
	snapshot(): string;

	/** Called on `navigate_page`; return a reply to override the default */
	onNavigate?(url: string): ToolReply | undefined | void;

	/** Called on `fill` */
	onFill?(uid: string, value: string): ToolReply | undefined | void;

	/** Called on `click` */
	onClick?(uid: string): ToolReply | undefined | void;

	/** Tools to leave out of `tools()`, to stand in for an older server */
	withoutTools?: readonly string[];
};

/**
 * Build a page structure the way the browser server prints one.
 *
 * @param title - The page title
 * @param url - The address the page was reached at
 * @param lines - Element lines, without uids, indented with two spaces per level
 * @returns The text of a `take_snapshot` reply
 */
export function structure(
	title: string,
	url: string,
	lines: readonly string[],
): string {
	const body = lines.map((line, index) => {
		const indent = /^ */.exec(line)?.[0] ?? '';
		return `  ${indent}uid=1_${index + 1} ${line.trimStart()}`;
	});

	return [
		'## Latest page snapshot',
		`uid=1_0 RootWebArea "${title}" url="${url}"`,
		...body,
	].join('\n');
}

/**
 * A client that replays a script and records what it was asked.
 *
 * @param script - What the browser shows and how it reacts
 * @returns The client, and every call it received
 */
export function scriptedBrowser(script: BrowserScript): {
	client: MCPClient;
	calls: RecordedCall[];
	closed: () => number;
} {
	const calls: RecordedCall[] = [];
	let closes = 0;

	const answer = (name: string, args: Record<string, unknown>): ToolReply => {
		calls.push({name, arguments: args});

		switch (name) {
			case 'navigate_page': {
				const url = String(args['url']);
				return (
					script.onNavigate?.(url) ??
					mcpResult(`Successfully navigated to ${url}.`)
				);
			}

			case 'take_snapshot': {
				return mcpResult(script.snapshot());
			}

			case 'fill': {
				return (
					script.onFill?.(String(args['uid']), String(args['value'])) ??
					mcpResult('Successfully filled out the element')
				);
			}

			case 'click': {
				return (
					script.onClick?.(String(args['uid'])) ??
					mcpResult('Successfully clicked on the element')
				);
			}

			default: {
				return mcpError(`Unknown tool: ${name}`);
			}
		}
	};

	const definitions = {
		navigate_page: z.object({url: z.string()}),
		take_snapshot: z.object({}),
		fill: z.object({uid: z.string(), value: z.string()}),
		click: z.object({uid: z.string()}),
	};

	const client = {
		async tools() {
			return Object.fromEntries(
				Object.entries(definitions)
					.filter(([name]) => !script.withoutTools?.includes(name))
					.map(([name, inputSchema]) => [
						name,
						tool({
							description: name,
							inputSchema,
							async execute(args: Record<string, unknown>) {
								return answer(name, args);
							},
						}),
					]),
			);
		},
		async callTool(request: {
			name: string;
			arguments?: Record<string, unknown>;
		}) {
			return answer(request.name, request.arguments ?? {});
		},
		async close() {
			closes++;
		},
	} as unknown as MCPClient;

	return {client, calls, closed: () => closes};
}

/** Controls over a simulated login site. */
export type SimulatedSite = {
	script: BrowserScript;

	/** End the session, as a product does when it expires */
	expire(): void;

	/** Change the password the form accepts */
	setPassword(password: string): void;

	/** How many times the form signed the visitor in */
	signInCount(): number;
};

/**
 * A scripted stand-in for `tests/fixtures/login-site.ts`.
 *
 * Signed out, every address shows the login form at `/login`; `/login` itself
 * shows it to anyone. Filling the two fields and pressing the button signs in
 * when the password matches, after which gated addresses show their own page
 * with a `Sign out` button.
 *
 * @param options - How the site behaves
 * @param options.origin - The site's origin
 * @param options.password - What the form accepts
 * @param options.signAppearsAfter - Captures of a signed-in page before `Sign out` renders
 * @param options.pagesWithoutSign - Paths reachable signed in that never show `Sign out`
 * @param options.printsPasswordOn - Paths that print the password on the page
 * @returns The script and its controls
 */
export function simulatedLoginSite(options: {
	origin: string;
	password: string;
	signAppearsAfter?: number;
	pagesWithoutSign?: readonly string[];
	printsPasswordOn?: readonly string[];
}): SimulatedSite {
	const {origin, signAppearsAfter = 0} = options;
	let {password} = options;
	let signedIn = false;
	let rejected = false;
	let path = '/login';
	let signIns = 0;
	let capturesSinceArrival = 0;
	const filled = new Map<string, string>();

	const arrive = (next: string) => {
		path = next;
		capturesSinceArrival = 0;
	};

	const loginStructure = () =>
		structure('Sign in', `${origin}/login${rejected ? '?error=1' : ''}`, [
			'heading "Sign in" level="1"',
			...(rejected
				? [
						'alert atomic live="assertive"',
						'  StaticText "Invalid email or password"',
					]
				: []),
			'form',
			'  StaticText "Email "',
			'  textbox "Email "',
			'  StaticText "Password "',
			'  textbox "Password "',
			'  button "Sign in"',
		]);

	// Uids as `structure` assigns them to the form above. The role is part of
	// the lookup because the page's title and heading share the button's name.
	const uidOf = (role: string, name: string): string | undefined =>
		new RegExp(String.raw`uid=(\S+) ${role} "${name} ?"`).exec(
			loginStructure(),
		)?.[1];

	const script: BrowserScript = {
		snapshot() {
			// The form is served at its address whoever asks, as the real
			// fixture site serves it: a visitor already signed in can sign in
			// again, which is what recovery relies on.
			if (!signedIn || path === '/login') {
				return loginStructure();
			}

			capturesSinceArrival++;
			const showsSign =
				!options.pagesWithoutSign?.includes(path) &&
				capturesSinceArrival > signAppearsAfter;

			return structure(path.slice(1), `${origin}${path}`, [
				...(showsSign ? ['navigation', '  button "Sign out"'] : []),
				`heading "${path.slice(1)}" level="1"`,
				...(options.printsPasswordOn?.includes(path)
					? [`StaticText "Your key: ${password}"`]
					: []),
			]);
		},
		onNavigate(url) {
			const requested = new URL(url).pathname;
			arrive(signedIn && requested !== '/login' ? requested : '/login');
			if (path === '/login') {
				rejected = false;
				filled.clear();
			}
		},
		onFill(uid, value) {
			filled.set(uid, value);
		},
		onClick(uid) {
			let reply: ToolReply | undefined;

			if (path === '/login' && uid === uidOf('button', 'Sign in')) {
				const email = filled.get(uidOf('textbox', 'Email') ?? '');
				const typed = filled.get(uidOf('textbox', 'Password') ?? '');
				filled.clear();

				if (email !== undefined && typed === password) {
					signedIn = true;
					rejected = false;
					signIns++;
					arrive('/dashboard');
					reply = mcpResult(
						`Successfully clicked on the element\nPage navigated to ${origin}/dashboard.`,
					);
				} else {
					rejected = true;
				}
			}

			return reply;
		},
	};

	return {
		script,
		expire() {
			signedIn = false;
			arrive('/login');
		},
		setPassword(next: string) {
			password = next;
		},
		signInCount: () => signIns,
	};
}
