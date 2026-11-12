/**
 * A small site whose pages sit behind a form login.
 *
 * The site 011 is tested against, and the one `quickstart.md` walks through.
 * It is a real HTTP server so that a real browser can sign in to it: the
 * session is an `HttpOnly` cookie, and a signed-out visitor asking for a gated
 * page is redirected to the form, which is the shape of the products the
 * feature exists for.
 *
 * Run directly it prints its address and takes the account's password from
 * `LOGIN_SITE_PASSWORD`:
 *
 * ```bash
 * LOGIN_SITE_PASSWORD='…' node dist/tests/fixtures/login-site.js
 * ```
 */

import {Buffer} from 'node:buffer';
import http from 'node:http';
import process from 'node:process';
import {randomUUID} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {fileURLToPath} from 'node:url';

/** The one account the site knows. */
export const loginSiteEmail = 'qa@example.com';

/** A running instance of the site. */
export type LoginSite = {
	/** Origin the site is served from, with no trailing slash */
	baseUrl: string;

	/** Stop the server */
	close(): Promise<void>;

	/** Invalidate every session, as `/__expire` does */
	expireSessions(): void;

	/** Change the password the form accepts from now on */
	setPassword(password: string): void;

	/** How many times the form has signed a visitor in */
	signInCount(): number;

	/** The cookie values of the sessions currently valid */
	sessionIds(): string[];
};

const gatedPages: Record<string, {title: string; body: string}> = {
	'/dashboard': {
		title: 'Dashboard',
		body: "<h1>Dashboard</h1><p>This month's usage: 1,204 requests</p>",
	},
	'/settings': {
		title: 'Settings',
		body: '<h1>Settings</h1><label>Display name <input name="displayName"></label>',
	},
	'/billing': {
		title: 'Billing',
		body: '<h1>Billing</h1><p>Next invoice: 1 December</p>',
	},
};

const signOutControl = '<nav><button type="button">Sign out</button></nav>';

function document(title: string, body: string): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
}

function loginForm(action: string, rejected: boolean): string {
	const alert = rejected ? '<p role="alert">Invalid email or password</p>' : '';
	return document(
		'Sign in',
		`<h1>Sign in</h1>${alert}<form method="post" action="${action}"><label>Email <input name="email" type="email"></label><label>Password <input name="password" type="password"></label><button type="submit">Sign in</button></form>`,
	);
}

async function readForm(
	request: http.IncomingMessage,
): Promise<URLSearchParams> {
	const chunks: Uint8Array[] = [];
	for await (const chunk of request) {
		chunks.push(chunk as Uint8Array);
	}

	return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function cookieValue(
	request: http.IncomingMessage,
	name: string,
): string | undefined {
	for (const pair of (request.headers.cookie ?? '').split(';')) {
		const [key, value] = pair.trim().split('=');
		if (key === name) {
			return value;
		}
	}

	return undefined;
}

/**
 * Start the site on a free local port.
 *
 * @param options - The account's password
 * @param options.password - What the form accepts for {@link loginSiteEmail}
 * @returns The running site
 */
export async function startLoginSite(options: {
	password: string;
}): Promise<LoginSite> {
	let {password} = options;
	let signIns = 0;
	const sessions = new Set<string>();

	// Email submitted on the first screen of the two-screen form, keyed by the
	// short-lived cookie that carries it to the second.
	const pendingEmails = new Map<string, string>();

	const redirect = (
		response: http.ServerResponse,
		location: string,
		cookie?: string,
	) => {
		response.writeHead(302, {
			Location: location,
			...(cookie !== undefined && {'Set-Cookie': cookie}),
		});
		response.end();
	};

	const html = (response: http.ServerResponse, body: string) => {
		response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
		response.end(body);
	};

	const startSession = (response: http.ServerResponse) => {
		const id = randomUUID();
		sessions.add(id);
		signIns++;
		redirect(response, '/dashboard', `sid=${id}; HttpOnly; Path=/`);
	};

	// The two-screen form: the email on one screen, the password on the next.
	const twoStep = async (
		request: http.IncomingMessage,
		response: http.ServerResponse,
		url: URL,
	) => {
		if (request.method === 'POST') {
			const form = await readForm(request);
			const email = form.get('email');

			if (email !== null) {
				const ticket = randomUUID();
				pendingEmails.set(ticket, email);
				redirect(
					response,
					'/login-2step?step=password',
					`pending=${ticket}; HttpOnly; Path=/`,
				);
				return;
			}

			const pending = pendingEmails.get(cookieValue(request, 'pending') ?? '');
			if (pending === loginSiteEmail && form.get('password') === password) {
				startSession(response);
				return;
			}

			redirect(response, '/login-2step?error=1');
			return;
		}

		const alert = url.searchParams.has('error')
			? '<p role="alert">Invalid email or password</p>'
			: '';
		const field =
			url.searchParams.get('step') === 'password'
				? '<label>Password <input name="password" type="password"></label><button type="submit">Sign in</button>'
				: '<label>Email <input name="email" type="email"></label><button type="submit">Next</button>';
		html(
			response,
			document(
				'Sign in',
				`<h1>Sign in</h1>${alert}<form method="post" action="/login-2step">${field}</form>`,
			),
		);
	};

	const server = http.createServer(async (request, response) => {
		const url = new URL(request.url ?? '/', 'http://127.0.0.1');
		const {pathname} = url;

		if (pathname === '/login' && request.method === 'POST') {
			const form = await readForm(request);
			if (
				form.get('email') === loginSiteEmail &&
				form.get('password') === password
			) {
				startSession(response);
				return;
			}

			redirect(response, '/login?error=1');
			return;
		}

		if (pathname === '/login') {
			html(response, loginForm('/login', url.searchParams.has('error')));
			return;
		}

		if (pathname === '/login-2step') {
			await twoStep(request, response, url);
			return;
		}

		if (pathname === '/__expire') {
			sessions.clear();
			html(response, document('Expired', '<p>Every session was ended.</p>'));
			return;
		}

		const session = cookieValue(request, 'sid');
		const signedIn = session !== undefined && sessions.has(session);
		if (!signedIn) {
			redirect(response, '/login');
			return;
		}

		const gated = gatedPages[pathname];
		if (gated) {
			html(response, document(gated.title, signOutControl + gated.body));
			return;
		}

		if (pathname === '/no-sign') {
			// Reachable signed in, and deliberately without the account
			// control: the page a chosen sign can be missing from.
			html(
				response,
				document('Editor', '<h1>Editor</h1><p>A full-screen editor.</p>'),
			);
			return;
		}

		if (pathname === '/secret') {
			html(
				response,
				document(
					'API keys',
					`${signOutControl}<h1>API keys</h1><p>Your key: ${password}</p>`,
				),
			);
			return;
		}

		response.writeHead(404, {'Content-Type': 'text/html; charset=utf-8'});
		response.end(document('Not found', '<h1>Not found</h1>'));
	});

	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});

	const {port} = server.address() as AddressInfo;

	return {
		baseUrl: `http://127.0.0.1:${port}`,
		async close() {
			await new Promise<void>((resolve, reject) => {
				server.closeAllConnections();
				server.close(error => {
					if (error) {
						reject(error);
					} else {
						resolve();
					}
				});
			});
		},
		expireSessions() {
			sessions.clear();
		},
		setPassword(next: string) {
			password = next;
		},
		signInCount: () => signIns,
		sessionIds: () => [...sessions],
	};
}

// Run as a script: serve until interrupted.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const password = process.env['LOGIN_SITE_PASSWORD'];
	if (password === undefined || password.length === 0) {
		process.stderr.write(
			'Set LOGIN_SITE_PASSWORD to the password the form should accept.\n',
		);
		process.exitCode = 1;
	} else {
		const site = await startLoginSite({password});
		process.stdout.write(`${site.baseUrl}\n`);
	}
}
