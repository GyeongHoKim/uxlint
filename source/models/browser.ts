/**
 * Browser configuration
 *
 * Three settings that were previously hard-coded flags nobody could see:
 * where the browser lives, whether untrusted TLS certificates are tolerated,
 * and whether anything derived from the analysed URL may leave the machine.
 *
 * @packageDocumentation
 */

/**
 * User-facing browser settings.
 *
 * Every field is optional; the defaults below apply when the block or a field
 * within it is absent.
 */
export type BrowserSettings = {
	/**
	 * Path to a browser executable outside the platform's default locations.
	 *
	 * When set, it is the only location searched -- a configured path is taken
	 * as deliberate, so failing over to a different browser would silently
	 * analyse pages with something other than what the user asked for.
	 */
	executablePath?: string;

	/**
	 * Whether to tolerate untrusted TLS certificates.
	 *
	 * Defaults to true, which is what every release before this one did
	 * unconditionally. Tightening it is a separate decision with its own
	 * evidence: changing it in the same release that swapped the browser
	 * engine would leave any resulting failure with two candidate causes.
	 */
	acceptInsecureCerts?: boolean;

	/**
	 * Whether the run may consult external data sources.
	 *
	 * Defaults to false. The browser tooling would otherwise send analysed
	 * URLs to Google's CrUX API for field data, and report usage statistics.
	 * uxlint is routinely pointed at staging hosts and internal tools, so the
	 * URL itself is the sensitive part.
	 */
	allowExternalData?: boolean;
};

/** Untrusted certificates are tolerated unless the user says otherwise. */
export const defaultAcceptInsecureCerts = true;

/** Nothing leaves the machine unless the user opts in. */
export const defaultAllowExternalData = false;

/**
 * A rejected browser setting, named so the user can find it.
 */
export type BrowserSettingsIssue = {
	/** Dotted config key, e.g. `browser.executablePath` */
	key: string;

	/** The value as supplied */
	received: unknown;

	/** Message naming the key and what was wrong with it */
	message: string;
};

const knownKeys = new Set([
	'executablePath',
	'acceptInsecureCerts',
	'allowExternalData',
]);

const booleanKeys = ['acceptInsecureCerts', 'allowExternalData'] as const;

/**
 * Validate the optional `browser` block.
 *
 * Runs with the rest of config validation, before any page is analysed, so a
 * typo costs no model usage. D17 is the reason this exists at all: a config
 * field that no validator checked let a misspelling pass silently, and the
 * user found out when the setting simply did not apply.
 *
 * @returns The first issue found, or undefined when the block is valid
 */
export function validateBrowserSettings(
	value: unknown,
): BrowserSettingsIssue | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return {
			key: 'browser',
			received: value,
			message: `browser must be an object, received ${describe(value)}`,
		};
	}

	const block = value as Record<string, unknown>;

	for (const [key, received] of Object.entries(block)) {
		if (!knownKeys.has(key)) {
			return {
				key: `browser.${key}`,
				received,
				message: `browser.${key} is not a recognised browser setting. Expected one of: ${[
					...knownKeys,
				].join(', ')}`,
			};
		}
	}

	const path = block['executablePath'];
	if (path !== undefined && (typeof path !== 'string' || path.length === 0)) {
		return {
			key: 'browser.executablePath',
			received: path,
			message: `browser.executablePath must be a non-empty string, received ${describe(
				path,
			)}`,
		};
	}

	for (const key of booleanKeys) {
		const flag = block[key];
		if (flag === undefined) {
			continue;
		}

		if (typeof flag !== 'boolean') {
			return {
				key: `browser.${key}`,
				received: flag,
				message: `browser.${key} must be true or false, received ${describe(
					flag,
				)}`,
			};
		}
	}

	return undefined;
}

/**
 * Describe a rejected value without dumping an entire object into the message.
 */
function describe(value: unknown): string {
	if (value === null) {
		return 'null';
	}

	if (Array.isArray(value)) {
		return 'an array';
	}

	if (typeof value === 'object') {
		return 'an object';
	}

	if (typeof value === 'string') {
		return `"${value}"`;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	return typeof value;
}
