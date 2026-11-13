/**
 * Unit tests for the sign-in description and for reading a page structure.
 *
 * Everything here is pure: validating the `signIn` block, finding a step's
 * target and the signed-in sign in a captured structure, reading the address
 * a page was reached at, and the texts a failure is reported with. The
 * structures are in the form the browser server produced in the live run
 * recorded in `specs/011-authenticated-pages/research.md` (R1).
 */

import test from 'ava';
import {
	clickableRoles,
	describeNotReached,
	describeShown,
	describeSignInFailure,
	describeStep,
	fillableRoles,
	hasSignedInSign,
	missingSecretText,
	reachedUrlOf,
	requiredSignInTools,
	resolveTarget,
	sameAddress,
	unusableSecretText,
	validateSignIn,
	type SignInDescription,
} from '../../source/models/sign-in.js';
import {structure} from '../fixtures/sign-in-browser.js';

const wellFormed: SignInDescription = {
	url: 'https://app.example.com/login',
	steps: [
		{fill: 'Email', value: 'qa@example.com'},
		{fill: 'Password', secret: 'UXLINT_QA_PASSWORD'},
		{click: 'Sign in'},
	],
	signedIn: {name: 'Sign out', role: 'button'},
	timeoutMs: 30_000,
};

/** The well-formed block with one part replaced. */
const withChange = (change: Record<string, unknown>): unknown => ({
	...wellFormed,
	...change,
});

/** The well-formed block with one key removed. */
const without = (key: keyof SignInDescription): unknown => {
	const {[key]: _removed, ...rest} = wellFormed;
	return rest;
};

// --- validateSignIn ---------------------------------------------------------

test('an absent signIn block is valid', t => {
	t.is(validateSignIn(undefined), undefined);
});

test('a well-formed signIn block is valid', t => {
	t.is(validateSignIn(wellFormed), undefined);
});

test('a signIn block without the optional role and timeout is valid', t => {
	t.is(
		validateSignIn({
			url: 'https://app.example.com/login',
			steps: [{click: 'Continue as guest'}],
			signedIn: {name: 'Sign out'},
		}),
		undefined,
	);
});

const rejected: Array<{
	label: string;
	input: unknown;
	key: string;
	says: RegExp;
}> = [
	{
		label: 'a signIn block that is not an object',
		input: 'https://app.example.com/login',
		key: 'signIn',
		says: /must be an object/,
	},
	{
		label: 'a signIn block that is an array',
		input: [wellFormed],
		key: 'signIn',
		says: /must be an object/,
	},
	{
		label: 'a missing url',
		input: without('url'),
		key: 'signIn.url',
		says: /must be an absolute URL/,
	},
	{
		label: 'a url that is not absolute',
		input: withChange({url: '/login'}),
		key: 'signIn.url',
		says: /must be an absolute URL/,
	},
	{
		label: 'missing steps',
		input: without('steps'),
		key: 'signIn.steps',
		says: /must list at least one step/,
	},
	{
		label: 'an empty list of steps',
		input: withChange({steps: []}),
		key: 'signIn.steps',
		says: /must list at least one step/,
	},
	{
		label: 'a step with neither fill nor click',
		input: withChange({
			steps: [{fill: 'Email', value: 'a'}, {click: 'Next'}, {role: 'button'}],
		}),
		key: 'signIn.steps[2]',
		says: /exactly one of fill or click/,
	},
	{
		label: 'a step with both fill and click',
		input: withChange({steps: [{fill: 'Email', click: 'Next', value: 'a'}]}),
		key: 'signIn.steps[0]',
		says: /exactly one of fill or click/,
	},
	{
		label: 'a fill step with neither value nor secret',
		input: withChange({steps: [{click: 'Start'}, {fill: 'Email'}]}),
		key: 'signIn.steps[1]',
		says: /exactly one of value or secret/,
	},
	{
		label: 'a fill step with both value and secret',
		input: withChange({
			steps: [{fill: 'Password', value: 'hunter2', secret: 'PASSWORD'}],
		}),
		key: 'signIn.steps[0]',
		says: /exactly one of value or secret/,
	},
	{
		label: 'a fill step whose secret is not a variable name',
		input: withChange({steps: [{fill: 'Password', secret: ''}]}),
		key: 'signIn.steps[0].secret',
		says: /name of an environment variable/,
	},
	{
		label: 'a click step that carries a value',
		input: withChange({steps: [{click: 'Sign in', value: 'x'}]}),
		key: 'signIn.steps[0]',
		says: /click takes no value/,
	},
	{
		label: 'a click step that carries a secret',
		input: withChange({steps: [{click: 'Sign in', secret: 'PASSWORD'}]}),
		key: 'signIn.steps[0]',
		says: /click takes no value/,
	},
	{
		label: 'a step whose target is empty',
		input: withChange({steps: [{click: ''}]}),
		key: 'signIn.steps[0].click',
		says: /non-empty string/,
	},
	{
		label: 'a missing signed-in sign',
		input: without('signedIn'),
		key: 'signIn.signedIn',
		says: /signed-in sign is required/,
	},
	{
		label: 'a signed-in sign with an empty name',
		input: withChange({signedIn: {name: ''}}),
		key: 'signIn.signedIn.name',
		says: /non-empty string/,
	},
	{
		label: 'a timeout that is not a positive integer',
		input: withChange({timeoutMs: 0}),
		key: 'signIn.timeoutMs',
		says: /positive integer of milliseconds/,
	},
	{
		label: 'a timeout given as a string',
		input: withChange({timeoutMs: '30000'}),
		key: 'signIn.timeoutMs',
		says: /positive integer of milliseconds/,
	},
	{
		label: 'an unknown key in the block',
		input: withChange({cookies: []}),
		key: 'signIn.cookies',
		says: /not a recognised.*url, steps, signedIn, timeoutMs/,
	},
	{
		label: 'an unknown key in a step',
		input: withChange({
			steps: [{fill: 'Email', value: 'a', selector: '#email'}],
		}),
		key: 'signIn.steps[0].selector',
		says: /not a recognised/,
	},
	{
		label: 'an unknown key in the signed-in sign',
		input: withChange({signedIn: {name: 'Sign out', text: 'Sign out'}}),
		key: 'signIn.signedIn.text',
		says: /not a recognised/,
	},
];

for (const {label, input, key, says} of rejected) {
	test(`validateSignIn rejects ${label}`, t => {
		const issue = validateSignIn(input);

		t.is(issue?.key, key);
		t.regex(issue?.message ?? '', says);
	});
}

test('a rejected secret is reported by where it is, not by what it holds', t => {
	const issue = validateSignIn(
		withChange({
			steps: [{fill: 'Password', value: 'hunter2', secret: 'PASSWORD'}],
		}),
	);

	t.notRegex(issue?.message ?? '', /hunter2/);
});

// --- resolveTarget ----------------------------------------------------------

const loginForm = structure('Sign in', 'https://app.example.com/login', [
	'heading "Sign in" level="1"',
	'form',
	'  StaticText "Email "',
	'  textbox "Email "',
	'  StaticText "Password "',
	'  textbox "Password "',
	'  button "Sign in"',
	'link "Forgot password?"',
]);

test('a field is found by its accessible name despite stray whitespace', t => {
	t.deepEqual(resolveTarget(loginForm, {name: 'Email'}, fillableRoles), {
		kind: 'found',
		uid: '1_4',
	});
});

test('whitespace inside a name is collapsed on both sides', t => {
	const page = structure('Sign in', 'https://app.example.com/login', [
		'textbox "Work   email"',
	]);

	t.is(
		resolveTarget(page, {name: ' Work email '}, fillableRoles).kind,
		'found',
	);
});

test('names are compared case-sensitively', t => {
	t.deepEqual(resolveTarget(loginForm, {name: 'email'}, fillableRoles), {
		kind: 'not-found',
	});
});

test('a fill without a role matches only fillable elements', t => {
	// "Sign in" names a heading and a button, neither of which can be filled.
	t.deepEqual(resolveTarget(loginForm, {name: 'Sign in'}, fillableRoles), {
		kind: 'not-found',
	});
	t.deepEqual([...fillableRoles], ['textbox', 'searchbox', 'combobox']);
});

test('a click without a role matches only buttons and links', t => {
	// The heading shares the button's name and must not make it ambiguous.
	t.deepEqual(resolveTarget(loginForm, {name: 'Sign in'}, clickableRoles), {
		kind: 'found',
		uid: '1_7',
	});
	t.is(
		resolveTarget(loginForm, {name: 'Forgot password?'}, clickableRoles).kind,
		'found',
	);
	t.deepEqual([...clickableRoles], ['button', 'link']);
});

test('an explicit role overrides the default roles', t => {
	t.deepEqual(
		resolveTarget(
			loginForm,
			{name: 'Sign in', role: 'heading'},
			clickableRoles,
		),
		{kind: 'found', uid: '1_1'},
	);
});

test('two elements with the same name and role are ambiguous', t => {
	const page = structure('Sign in', 'https://app.example.com/login', [
		'button "Sign in"',
		'button "Sign in"',
	]);

	t.deepEqual(resolveTarget(page, {name: 'Sign in'}, clickableRoles), {
		kind: 'ambiguous',
		count: 2,
	});
});

test('a name that only starts another name does not match it', t => {
	t.deepEqual(resolveTarget(loginForm, {name: 'Forgot'}, clickableRoles), {
		kind: 'not-found',
	});
});

// --- hasSignedInSign --------------------------------------------------------

const dashboard = structure('Dashboard', 'https://app.example.com/dashboard', [
	'navigation',
	'  button "Sign out"',
	'heading "Dashboard" level="1"',
]);

test('the sign is found by name alone', t => {
	t.true(hasSignedInSign(dashboard, {name: 'Sign out'}));
});

test('the sign is found by name and role', t => {
	t.true(hasSignedInSign(dashboard, {name: 'Sign out', role: 'button'}));
});

test('the sign is not satisfied by an element of another role', t => {
	t.false(hasSignedInSign(dashboard, {name: 'Sign out', role: 'link'}));
});

test('the sign is not satisfied by a longer name that contains it', t => {
	const page = structure('Sign in', 'https://app.example.com/login', [
		'StaticText "Sign out of other devices before continuing"',
		'link "Sign out everywhere"',
	]);

	t.false(hasSignedInSign(page, {name: 'Sign out'}));
});

test('the sign is absent from a login form', t => {
	t.false(hasSignedInSign(loginForm, {name: 'Sign out', role: 'button'}));
});

test('the sign is absent from an empty capture', t => {
	t.false(hasSignedInSign('', {name: 'Sign out'}));
});

// --- reachedUrlOf / sameAddress ---------------------------------------------

test('the reached address is read from the root of the structure', t => {
	t.is(reachedUrlOf(dashboard), 'https://app.example.com/dashboard');
});

test('a structure whose root carries no address has no reached address', t => {
	t.is(
		reachedUrlOf('## Latest page snapshot\nuid=1_0 RootWebArea "x"'),
		undefined,
	);
	t.is(reachedUrlOf(''), undefined);
});

test('two addresses are the same when only a fragment differs', t => {
	t.true(
		sameAddress(
			'https://app.example.com/dashboard#usage',
			'https://app.example.com/dashboard',
		),
	);
});

test('two addresses are the same when only a trailing slash differs', t => {
	t.true(
		sameAddress(
			'https://app.example.com/settings/',
			'https://app.example.com/settings',
		),
	);
	t.true(sameAddress('https://app.example.com', 'https://app.example.com/'));
});

test('two addresses differ when the path differs', t => {
	t.false(
		sameAddress(
			'https://app.example.com/dashboard',
			'https://app.example.com/login',
		),
	);
});

test('two addresses differ when the query differs', t => {
	t.false(
		sameAddress(
			'https://app.example.com/login',
			'https://app.example.com/login?error=1',
		),
	);
});

test('an address that does not parse is the same only as itself', t => {
	t.true(sameAddress('not a url', 'not a url'));
	t.false(sameAddress('not a url', 'https://app.example.com/'));
});

// --- describeShown ----------------------------------------------------------

test('what a page showed names its title and its address', t => {
	t.is(describeShown(loginForm), '"Sign in" at https://app.example.com/login');
});

test('what a page showed includes the text of its alerts', t => {
	const rejectedLogin = structure(
		'Sign in',
		'https://app.example.com/login?error=1',
		[
			'heading "Sign in" level="1"',
			'alert atomic live="assertive"',
			'  StaticText "Invalid email or password"',
			'form',
			'  textbox "Email "',
		],
	);

	t.is(
		describeShown(rejectedLogin),
		'"Sign in" at https://app.example.com/login?error=1 — alert: "Invalid email or password"',
	);
});

test('a named alert is reported by its name', t => {
	const page = structure('Verify', 'https://app.example.com/verify', [
		'alert "Enter the code we sent to your phone"',
	]);

	t.is(
		describeShown(page),
		'"Verify" at https://app.example.com/verify — alert: "Enter the code we sent to your phone"',
	);
});

test('an unreadable capture is described as such', t => {
	t.is(describeShown(''), 'a page whose structure could not be read');
});

// --- reason texts -----------------------------------------------------------

test('a step is described by its kind and target, never by its value', t => {
	t.is(describeStep({fill: 'Password', secret: 'PASSWORD'}), 'fill "Password"');
	t.is(describeStep({fill: 'Email', value: 'qa@example.com'}), 'fill "Email"');
	t.is(describeStep({click: 'Sign in'}), 'click "Sign in"');
});

test('a failed step is reported with its 1-based position', t => {
	t.is(
		describeSignInFailure(
			{
				kind: 'step-failed',
				stepIndex: 1,
				step: 'fill "Password"',
				problem: 'not-found',
				shown: '"Sign in" at https://app.example.com/login/verify',
			},
			wellFormed,
		),
		'Sign-in failed at step 2 (fill "Password"): not-found. The page showed: "Sign in" at https://app.example.com/login/verify',
	);
});

test('a sign that never appeared is reported with the sign and the page', t => {
	t.is(
		describeSignInFailure(
			{
				kind: 'sign-absent',
				shown: '"Sign in" at https://app.example.com/login?error=1',
			},
			wellFormed,
		),
		'Sign-in steps completed but the signed-in sign "Sign out" did not appear. The page showed: "Sign in" at https://app.example.com/login?error=1',
	);
});

test('a sign-in that ran out of time is reported with its bound', t => {
	t.is(
		describeSignInFailure({kind: 'timed-out', afterMs: 30_000}, wellFormed),
		'Sign-in did not finish within 30000 ms',
	);
});

test('a sign-in page that could not be opened is reported with its address', t => {
	t.is(
		describeSignInFailure(
			{kind: 'not-opened', detail: 'net::ERR_CONNECTION_REFUSED'},
			wellFormed,
		),
		'Sign-in could not open https://app.example.com/login: net::ERR_CONNECTION_REFUSED',
	);
});

test('a missing secret is reported by its name', t => {
	t.is(
		missingSecretText(['UXLINT_QA_PASSWORD']),
		'Sign-in needs UXLINT_QA_PASSWORD, which is not set in the environment',
	);
});

test('several missing secrets are reported together', t => {
	t.is(
		missingSecretText(['QA_EMAIL', 'QA_PASSWORD']),
		'Sign-in needs QA_EMAIL and QA_PASSWORD, which are not set in the environment',
	);
});

test('an unusable secret is reported by its name and what is wrong with it', t => {
	t.is(
		unusableSecretText('QA_PIN', 'its value is shorter than 4 characters'),
		'Sign-in cannot use QA_PIN: its value is shorter than 4 characters',
	);
});

test('a lost session is reported with why signing in again failed', t => {
	t.is(
		describeNotReached(
			'session-lost',
			wellFormed,
			'Sign-in did not finish within 30000 ms',
		),
		'The session was lost and signing in again failed: Sign-in did not finish within 30000 ms',
	);
});

test('a page without the sign is reported as signed in but not shown', t => {
	t.is(
		describeNotReached('sign-missing', wellFormed),
		'Signed in, but this page did not show the signed-in sign "Sign out". The account may not have access to it, or the page may not carry the sign',
	);
});

test('sign-in requires the fill and click tools', t => {
	t.deepEqual([...requiredSignInTools], ['fill', 'click']);
});

// The browser server prints a name between double quotes without escaping
// the ones the name itself contains.
test('a name that contains double quotes is found', t => {
	const snapshot = structure('Greeter', 'https://app.example.com/', [
		'button "Say "hello"" focusable',
		'textbox "Your "handle" " value="qa"',
	]);

	t.deepEqual(resolveTarget(snapshot, {name: 'Say "hello"'}, clickableRoles), {
		kind: 'found',
		uid: '1_1',
	});
	t.deepEqual(resolveTarget(snapshot, {name: 'Your "handle"'}, fillableRoles), {
		kind: 'found',
		uid: '1_2',
	});
	t.true(hasSignedInSign(snapshot, {name: 'Say "hello"', role: 'button'}));
	t.false(hasSignedInSign(snapshot, {name: 'Say ', role: 'button'}));
});

test('an attribute after a name is not read as part of the name', t => {
	const snapshot = structure('Form', 'https://app.example.com/', [
		'textbox "Email " description="Work address" value="qa@example.com"',
	]);

	t.deepEqual(resolveTarget(snapshot, {name: 'Email'}, fillableRoles), {
		kind: 'found',
		uid: '1_1',
	});
});

test('the reached address is read past a title that contains double quotes', t => {
	t.is(
		reachedUrlOf(
			structure('The "new" dashboard', 'https://app.example.com/home', []),
		),
		'https://app.example.com/home',
	);
});

test('a page that could not be opened again is reported with what the browser said', t => {
	t.is(
		describeNotReached('not-reopened', wellFormed, 'net::ERR_FAILED'),
		'Signed in again, but the page could not be opened: net::ERR_FAILED',
	);
});
