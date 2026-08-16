/**
 * Reading a browser tool's result
 *
 * The MCP adapter hands a tool's result through **unchanged**: an execute
 * returns the server's `CallToolResult` — `{content: [{type: 'text', text}],
 * isError?}` — not the text inside it. Two consequences drove this module into
 * existence, both of which shipped briefly and neither of which any test
 * noticed, because the test doubles returned plain strings while the real
 * adapter returns the wrapper:
 *
 * First: code that expected a string recorded nothing at all in production.
 * Second: failure is reported *in* the result, as `isError: true`, rather than
 * by throwing, so treating a returned result as success meant a navigation
 * that failed still counted as a page that loaded.
 *
 * The second is the same shape 005 found and documented: this browser server
 * reports a missing browser as a tool result, not an error.
 *
 * @packageDocumentation
 */

/**
 * What a tool actually reported.
 */
export type ToolOutcome = {
	/** The text the tool returned, joined across content parts */
	text: string;

	/** Whether the tool reported failure, however it reported it */
	failed: boolean;
};

/**
 * Read a tool result, whatever shape it arrives in.
 *
 * Accepts a plain string as well as the MCP wrapper, so a locally-built tool
 * and a server-adapted one can be read the same way.
 *
 * @param output - Whatever the tool's execute returned
 * @param erroredAtTransport - Whether the SDK itself reported a tool error
 * @returns The text and whether it represents a failure
 */
export function readToolOutcome(
	output: unknown,
	erroredAtTransport = false,
): ToolOutcome {
	if (erroredAtTransport) {
		return {text: '', failed: true};
	}

	if (typeof output === 'string') {
		return {text: output, failed: false};
	}

	if (typeof output !== 'object' || output === null) {
		return {text: '', failed: true};
	}

	const result = output as {content?: unknown; isError?: unknown};
	const failed = result.isError === true;
	const parts = Array.isArray(result.content) ? result.content : [];

	const text = parts
		.map(part => {
			if (typeof part === 'string') {
				return part;
			}

			const typed = part as {type?: unknown; text?: unknown};
			return typed.type === 'text' && typeof typed.text === 'string'
				? typed.text
				: '';
		})
		.join('');

	return {text, failed};
}
