/**
 * Secrets and their redaction
 *
 * The values behind a sign-in description's `secret` names, and the function
 * that keeps them out of everything a run produces. See
 * `specs/011-authenticated-pages/data-model.md`.
 *
 * @packageDocumentation
 */

import type {SignInDescription} from './sign-in.js';

/** The values behind the `secret` names, read once at startup. */
export type ResolvedSecrets =
	| {kind: 'resolved'; values: ReadonlyMap<string, string>}
	| {kind: 'missing'; names: string[]}
	| {kind: 'unusable'; name: string; reason: string};

/** Replaces every secret value in a text. */
export type Redactor = (text: string) => string;

/** What a redacted value is replaced with. */
export const redactedMarker = '[redacted]';

/** A shorter value could not be redacted without mangling ordinary text. */
export const minimumSecretLength = 4;

/**
 * The environment variables a description reads its secrets from.
 *
 * @param description - A sign-in description
 * @returns Each name once, in the order the steps give them
 */
export function secretNames(description: SignInDescription): string[] {
	const names = description.steps.flatMap(step =>
		'secret' in step ? [step.secret] : [],
	);

	return [...new Set(names)];
}

/**
 * Read the values behind a description's `secret` names.
 *
 * @param description - The run's sign-in description
 * @param environment - Where the values are read from
 * @returns The values, or what stops them being used
 */
export function resolveSecrets(
	description: SignInDescription,
	environment: Readonly<Record<string, string | undefined>>,
): ResolvedSecrets {
	const names = secretNames(description);

	const missing = names.filter(name => environment[name] === undefined);
	if (missing.length > 0) {
		return {kind: 'missing', names: missing};
	}

	const values = new Map<string, string>();
	for (const name of names) {
		const value = environment[name] ?? '';

		if (value.length === 0) {
			return {kind: 'unusable', name, reason: 'its value is empty'};
		}

		// Replacing a two-letter value everywhere it occurs would mangle
		// ordinary text and tell a reader where the secret was not.
		if (value.length < minimumSecretLength) {
			return {
				kind: 'unusable',
				name,
				reason: `its value is shorter than ${minimumSecretLength} characters`,
			};
		}

		values.set(name, value);
	}

	return {kind: 'resolved', values};
}

const lowerCaseEscapes = (encoded: string): string =>
	encoded.replaceAll(/%[\dA-F]{2}/g, escape => escape.toLowerCase());

const asMarkupText = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');

/**
 * Every spelling of a value a page, an address or a submitted form may carry.
 */
function spellingsOf(value: string): string[] {
	const urlEncoded = encodeURIComponent(value);
	const formEncoded = urlEncoded.replaceAll('%20', '+');

	return [
		value,
		urlEncoded,
		formEncoded,
		lowerCaseEscapes(urlEncoded),
		lowerCaseEscapes(formEncoded),
		// As it appears inside a JSON string, which is how the audit report
		// and a page's embedded data quote it.
		JSON.stringify(value).slice(1, -1),
		// As markup spells it: in text, and inside an attribute, which is how
		// the snippets an audit quotes from a page carry a field's value.
		asMarkupText(value),
		asMarkupText(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;'),
	];
}

/** Make a text match itself and nothing else inside a pattern. */
const literal = (text: string): string =>
	text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

/**
 * Build the function that removes a run's secrets from a text.
 *
 * @param values - The secret values
 * @returns A function replacing every occurrence with {@link redactedMarker}
 */
export function createRedactor(values: Iterable<string>): Redactor {
	const spellings = [...values]
		.filter(value => value.length > 0)
		.flatMap(value => spellingsOf(value));

	if (spellings.length === 0) {
		return text => text;
	}

	// Longest first, so that a secret containing another is replaced whole
	// rather than leaving its tail behind.
	const pattern = new RegExp(
		[...new Set(spellings)]
			.sort((first, second) => second.length - first.length)
			.map(spelling => literal(spelling))
			.join('|'),
		'g',
	);

	return text => text.replaceAll(pattern, () => redactedMarker);
}
