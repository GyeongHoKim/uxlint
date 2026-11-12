/**
 * Sign-in description
 *
 * How an account signs in to the product under review, and how a run tells
 * that it worked. See `specs/011-authenticated-pages/data-model.md`.
 *
 * @packageDocumentation
 */

/** Names an element of a page structure by accessible name, and optionally role. */
export type ElementMatcher = {
	name: string;
	role?: string;
};

/** One step of signing in. */
export type SignInStep =
	| {fill: string; role?: string; value: string}
	| {fill: string; role?: string; secret: string}
	| {click: string; role?: string};

/** The optional `signIn` block of the configuration. */
export type SignInDescription = {
	/** Where sign-in starts */
	url: string;

	/** Carried out in order; at least one */
	steps: SignInStep[];

	/** The signed-in sign: shown only to a signed-in visitor */
	signedIn: ElementMatcher;

	/** Bound on one sign-in, in milliseconds */
	timeoutMs?: number;
};

/** A rejected part of a `signIn` block, named so the user can find it. */
export type SignInIssue = {
	/** Dotted config key, e.g. `signIn.steps[1]` */
	key: string;

	/** The value as supplied */
	received: unknown;

	/** Message naming the key and what was wrong with it */
	message: string;
};

/** Why an attempt to sign in did not succeed. */
export type SignInFailure =
	| {
			kind: 'step-failed';
			stepIndex: number;
			step: string;
			problem: 'not-found' | 'ambiguous' | 'tool-error';
			shown: string;
	  }
	| {kind: 'sign-absent'; shown: string}
	| {kind: 'timed-out'; afterMs: number}
	| {kind: 'not-opened'; detail: string};

/** What an attempt to sign in produced. */
export type SignInOutcome =
	{kind: 'signed-in'} | {kind: 'failed'; failure: SignInFailure};

/** Why a page was refused admission. */
export type NotReachedReason = 'session-lost' | 'sign-missing';

/** What the session decided about one captured page. */
export type PageAdmission =
	| {kind: 'admitted'; snapshot: string; reachedUrl?: string}
	| {kind: 'refused'; reason: NotReachedReason; detail: string};

/** Where a step's target was found in a page structure, if it was. */
export type TargetResolution =
	| {kind: 'found'; uid: string}
	| {kind: 'not-found'}
	| {kind: 'ambiguous'; count: number};

/** Roles a `fill` step may target when it names none. */
export const fillableRoles = ['textbox', 'searchbox', 'combobox'] as const;

/** Roles a `click` step may target when it names none. */
export const clickableRoles = ['button', 'link'] as const;

/** Browser-server tools sign-in needs beyond the ones the analysis requires. */
export const requiredSignInTools = ['fill', 'click'] as const;

/** One element line of a page structure. */
type StructureElement = {
	indent: number;
	uid: string;
	role: string;

	/** Accessible name with whitespace normalised; undefined when the line carries none */
	name?: string;
};

const rootRole = 'RootWebArea';

// `uid=1_4 textbox "Email " value="…"`: the name is the quoted string directly
// after the role. A later quoted string belongs to an attribute, which is why
// the name may not be searched for anywhere else on the line.
const elementLine = /^(\s*)uid=(\S+) (\S+)(?: "((?:[^"\\]|\\.)*)")?/;

// Applied to one line with its indentation removed.
const rootAddress = new RegExp(
	String.raw`^uid=\S+ ${rootRole}(?: "(?:[^"\\]|\\.)*")? url="([^"]*)"`,
);

/**
 * Collapse runs of whitespace and trim.
 *
 * The browser prints a label's trailing space as part of a field's name
 * (research R1), so a name is never compared as written.
 */
function normalise(name: string): string {
	return name.replaceAll(/\s+/g, ' ').trim();
}

function parseStructure(snapshot: string): StructureElement[] {
	const elements: StructureElement[] = [];

	for (const line of snapshot.split('\n')) {
		const match = elementLine.exec(line);
		if (!match) {
			continue;
		}

		const [, indent = '', uid = '', role = '', name] = match;
		elements.push({
			indent: indent.length,
			uid,
			role,
			...(name !== undefined && {name: normalise(name)}),
		});
	}

	return elements;
}

function describeKind(value: unknown): string {
	if (value === null) {
		return 'null';
	}

	if (Array.isArray(value)) {
		return 'an array';
	}

	if (value === undefined) {
		return 'nothing';
	}

	return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

const blockKeys = ['url', 'steps', 'signedIn', 'timeoutMs'];
const stepKeys = ['fill', 'click', 'role', 'value', 'secret'];
const signKeys = ['name', 'role'];
const variableName = /^[a-z_]\w*$/i;

function unknownKey(
	block: Record<string, unknown>,
	known: readonly string[],
	at: string,
): SignInIssue | undefined {
	const key = Object.keys(block).find(candidate => !known.includes(candidate));
	if (key === undefined) {
		return undefined;
	}

	// The value is not echoed, here or in any message below: a step may hold
	// something the user believed was a secret.
	return {
		key: `${at}.${key}`,
		received: describeKind(block[key]),
		message: `${at}.${key} is not a recognised key. Expected one of: ${known.join(
			', ',
		)}`,
	};
}

function validateRole(
	block: Record<string, unknown>,
	at: string,
): SignInIssue | undefined {
	const {role} = block;
	if (role === undefined || isNonEmptyString(role)) {
		return undefined;
	}

	return {
		key: `${at}.role`,
		received: describeKind(role),
		message: `${at}.role must be a non-empty string, received ${describeKind(
			role,
		)}`,
	};
}

function validateFill(
	step: Record<string, unknown>,
	at: string,
): SignInIssue | undefined {
	const {value, secret} = step;

	if ((value === undefined) === (secret === undefined)) {
		return {
			key: at,
			received: Object.keys(step),
			message: `${at} must carry exactly one of value or secret: value for text written in the configuration, secret for the name of an environment variable`,
		};
	}

	if (secret !== undefined) {
		return typeof secret === 'string' && variableName.test(secret)
			? undefined
			: {
					key: `${at}.secret`,
					received: describeKind(secret),
					message: `${at}.secret must be the name of an environment variable, such as UXLINT_QA_PASSWORD, never the secret itself`,
				};
	}

	return typeof value === 'string'
		? undefined
		: {
				key: `${at}.value`,
				received: describeKind(value),
				message: `${at}.value must be a string, received ${describeKind(value)}`,
			};
}

function validateStep(step: unknown, at: string): SignInIssue | undefined {
	if (!isRecord(step)) {
		return {
			key: at,
			received: describeKind(step),
			message: `${at} must be an object, received ${describeKind(step)}`,
		};
	}

	const unknown = unknownKey(step, stepKeys, at);
	if (unknown) {
		return unknown;
	}

	const {fill, click} = step;
	if ((fill === undefined) === (click === undefined)) {
		return {
			key: at,
			received: Object.keys(step),
			message: `${at} must carry exactly one of fill or click`,
		};
	}

	const kind = fill === undefined ? 'click' : 'fill';
	if (!isNonEmptyString(step[kind])) {
		return {
			key: `${at}.${kind}`,
			received: describeKind(step[kind]),
			message: `${at}.${kind} must be a non-empty string naming the element, received ${describeKind(
				step[kind],
			)}`,
		};
	}

	const role = validateRole(step, at);
	if (role) {
		return role;
	}

	if (kind === 'fill') {
		return validateFill(step, at);
	}

	return step['value'] === undefined && step['secret'] === undefined
		? undefined
		: {
				key: at,
				received: Object.keys(step),
				message: `${at}: click takes no value or secret`,
			};
}

function validateSteps(steps: unknown): SignInIssue | undefined {
	if (!Array.isArray(steps) || steps.length === 0) {
		return {
			key: 'signIn.steps',
			received: describeKind(steps),
			message: 'signIn.steps must list at least one step',
		};
	}

	for (const [index, step] of steps.entries()) {
		const issue = validateStep(step, `signIn.steps[${index}]`);
		if (issue) {
			return issue;
		}
	}

	return undefined;
}

function validateSign(sign: unknown): SignInIssue | undefined {
	if (sign === undefined) {
		return {
			key: 'signIn.signedIn',
			received: undefined,
			message:
				'signIn.signedIn: a signed-in sign is required. Name an element only a signed-in visitor sees, such as a "Sign out" button',
		};
	}

	if (!isRecord(sign)) {
		return {
			key: 'signIn.signedIn',
			received: describeKind(sign),
			message: `signIn.signedIn must be an object, received ${describeKind(
				sign,
			)}`,
		};
	}

	const unknown = unknownKey(sign, signKeys, 'signIn.signedIn');
	if (unknown) {
		return unknown;
	}

	if (!isNonEmptyString(sign['name'])) {
		return {
			key: 'signIn.signedIn.name',
			received: describeKind(sign['name']),
			message: `signIn.signedIn.name must be a non-empty string, received ${describeKind(
				sign['name'],
			)}`,
		};
	}

	return validateRole(sign, 'signIn.signedIn');
}

function isAbsoluteUrl(value: unknown): boolean {
	return typeof value === 'string' && URL.canParse(value);
}

/**
 * Validate the optional `signIn` block.
 *
 * @param value - The block as read from the configuration
 * @returns The first problem found, or undefined when the block is absent or valid
 */
export function validateSignIn(value: unknown): SignInIssue | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!isRecord(value)) {
		return {
			key: 'signIn',
			received: describeKind(value),
			message: `signIn must be an object, received ${describeKind(value)}`,
		};
	}

	const unknown = unknownKey(value, blockKeys, 'signIn');
	if (unknown) {
		return unknown;
	}

	if (!isAbsoluteUrl(value['url'])) {
		return {
			key: 'signIn.url',
			received: describeKind(value['url']),
			message:
				'signIn.url must be an absolute URL, the address where sign-in starts',
		};
	}

	const timeout = value['timeoutMs'];
	if (
		timeout !== undefined &&
		!(Number.isSafeInteger(timeout) && Number(timeout) > 0)
	) {
		return {
			key: 'signIn.timeoutMs',
			received: timeout,
			message: `signIn.timeoutMs must be a positive integer of milliseconds, received ${describeKind(
				timeout,
			)}`,
		};
	}

	return validateSteps(value['steps']) ?? validateSign(value['signedIn']);
}

/**
 * Find the one element a step names.
 *
 * @param snapshot - A captured page structure
 * @param target - The element's accessible name, and optionally its role
 * @param defaultRoles - Roles considered when the target names none
 * @returns Where the element is, or why it could not be singled out
 */
export function resolveTarget(
	snapshot: string,
	target: ElementMatcher,
	defaultRoles: readonly string[],
): TargetResolution {
	const roles = target.role === undefined ? defaultRoles : [target.role];
	const name = normalise(target.name);
	const matches = parseStructure(snapshot).filter(
		element => element.name === name && roles.includes(element.role),
	);

	if (matches.length > 1) {
		return {kind: 'ambiguous', count: matches.length};
	}

	const [match] = matches;
	return match ? {kind: 'found', uid: match.uid} : {kind: 'not-found'};
}

/**
 * Whether a captured page shows the signed-in sign.
 *
 * @param snapshot - A captured page structure
 * @param sign - The sign's accessible name, and optionally its role
 * @returns True when an element with exactly that name is present
 */
export function hasSignedInSign(
	snapshot: string,
	sign: ElementMatcher,
): boolean {
	const name = normalise(sign.name);

	// Without a role any element counts except the root, whose name is the
	// page title: a login page titled like the sign shows nothing of the kind.
	return parseStructure(snapshot).some(
		element =>
			element.name === name &&
			(sign.role === undefined
				? element.role !== rootRole
				: element.role === sign.role),
	);
}

/**
 * Read the address a page was reached at from the root of its structure.
 *
 * @param snapshot - A captured page structure
 * @returns The address, or undefined when the root carries none
 */
export function reachedUrlOf(snapshot: string): string | undefined {
	for (const line of snapshot.split('\n')) {
		const match = rootAddress.exec(line.trimStart());
		if (match) {
			return match[1];
		}
	}

	return undefined;
}

function comparableAddress(address: string): string | undefined {
	if (!URL.canParse(address)) {
		return undefined;
	}

	const url = new URL(address);
	let path = url.pathname;
	while (path.endsWith('/')) {
		path = path.slice(0, -1);
	}

	return `${url.origin}${path}${url.search}`;
}

/**
 * Whether two addresses name the same page.
 *
 * A fragment and a trailing slash are not differences a reader of the report
 * would call a redirect.
 *
 * @param first - One address
 * @param second - The other
 * @returns True when they differ in nothing but those
 */
export function sameAddress(first: string, second: string): boolean {
	const [a, b] = [comparableAddress(first), comparableAddress(second)];
	return a === undefined || b === undefined ? first === second : a === b;
}

/** The text an unnamed element says through what sits beneath it. */
function textBeneath(
	elements: readonly StructureElement[],
	index: number,
): string {
	const parent = elements[index];
	const inside: string[] = [];

	for (const child of elements.slice(index + 1)) {
		if (!parent || child.indent <= parent.indent) {
			break;
		}

		if (child.role === 'StaticText' && child.name) {
			inside.push(child.name);
		}
	}

	return inside.join(' ');
}

function alertTexts(elements: readonly StructureElement[]): string[] {
	return elements
		.map((element, index) =>
			element.role === 'alert'
				? (element.name ?? textBeneath(elements, index))
				: '',
		)
		.filter(text => text.length > 0);
}

/**
 * Say what a page showed, for a failure's reason.
 *
 * Title, address and any alert: enough for a reader to recognise a rejected
 * password or a second factor without the whole structure being quoted.
 *
 * @param snapshot - A captured page structure
 * @returns One line describing the page
 */
export function describeShown(snapshot: string): string {
	const elements = parseStructure(snapshot);
	const root = elements.find(element => element.role === rootRole);
	if (!root) {
		return 'a page whose structure could not be read';
	}

	const address = reachedUrlOf(snapshot) ?? 'an unknown address';
	const alerts = alertTexts(elements)
		.map(text => `"${text}"`)
		.join(', ');

	return `"${root.name ?? ''}" at ${address}${
		alerts ? ` — alert: ${alerts}` : ''
	}`;
}

/**
 * Describe a step by its kind and target, never by what it fills in.
 *
 * @param step - The step
 * @returns For example `fill "Password"`
 */
export function describeStep(step: SignInStep): string {
	return 'fill' in step ? `fill "${step.fill}"` : `click "${step.click}"`;
}

/**
 * The reason text of a failed sign-in.
 *
 * @param failure - Why it failed
 * @param description - The description that was being carried out
 * @returns The sentence the report and the terminal show
 */
export function describeSignInFailure(
	failure: SignInFailure,
	description: SignInDescription,
): string {
	switch (failure.kind) {
		case 'step-failed': {
			return `Sign-in failed at step ${failure.stepIndex + 1} (${
				failure.step
			}): ${failure.problem}. The page showed: ${failure.shown}`;
		}

		case 'sign-absent': {
			return `Sign-in steps completed but the signed-in sign "${description.signedIn.name}" did not appear. The page showed: ${failure.shown}`;
		}

		case 'timed-out': {
			return `Sign-in did not finish within ${failure.afterMs} ms`;
		}

		case 'not-opened': {
			return `Sign-in could not open ${description.url}: ${failure.detail}`;
		}
	}
}

/**
 * The reason text of a page that was refused.
 *
 * @param reason - Why it was refused
 * @param description - The run's sign-in description
 * @param signInFailure - For a lost session, why signing in again failed
 * @returns The sentence the report shows for the page
 */
export function describeNotReached(
	reason: NotReachedReason,
	description: SignInDescription,
	signInFailure?: string,
): string {
	if (reason === 'session-lost') {
		return `The session was lost and signing in again failed: ${
			signInFailure ?? 'no reason was given'
		}`;
	}

	return `Signed in, but this page did not show the signed-in sign "${description.signedIn.name}". The account may not have access to it, or the page may not carry the sign`;
}

/**
 * The message for secrets the environment does not hold.
 *
 * @param names - The unset variables
 * @returns The sentence shown before the run stops
 */
export function missingSecretText(names: readonly string[]): string {
	const listed =
		names.length > 1
			? `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
			: (names[0] ?? '');

	return `Sign-in needs ${listed}, which ${
		names.length > 1 ? 'are' : 'is'
	} not set in the environment`;
}

/**
 * The message for a secret that is set but cannot be used.
 *
 * @param name - The variable
 * @param reason - What is wrong with its value, never the value
 * @returns The sentence shown before the run stops
 */
export function unusableSecretText(name: string, reason: string): string {
	return `Sign-in cannot use ${name}: ${reason}`;
}
